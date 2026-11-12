import { describe, expect, test } from 'claude-code/testing'

import { box, rasterize } from './canvas'
import type { Frame } from './canvas'
import { adler32, crc32, encodePng, fromBase64, toBase64 } from './png'

const ascii = (text: string) => Uint8Array.from([...text].map(ch => ch.charCodeAt(0)))
const u32 = (bytes: Uint8Array, at: number) => (((bytes[at] ?? 0) << 24) | ((bytes[at + 1] ?? 0) << 16) | ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0)) >>> 0

// As tabelas do deflate (RFC 1951), escritas aqui de novo: o teste não confia nas do codificador.
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DISTANCE_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DISTANCE_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]

// Um descompactador mínimo de zlib, só de blocos de Huffman fixo: o bastante para ler o que o codificador escreve.
const inflate = (zlib: Uint8Array): Uint8Array => {
  let at = 16 // em bits: pula os dois bytes do cabeçalho zlib
  const bit = () => (((zlib[at >> 3] ?? 0) >> (at++ & 7)) & 1)
  const bits = (count: number) => Array.from({ length: count }, bit).reduce((value, b, i) => value | (b << i), 0)
  const code = (count: number, from = 0) => Array.from({ length: count }, bit).reduce((value, b) => (value << 1) | b, from)
  const symbol = () => {
    const seven = code(7)
    if (seven <= 0b0010111) return 256 + seven
    const eight = code(1, seven)
    if (eight <= 0b10111111) return eight - 0b00110000
    if (eight <= 0b11000111) return 280 + eight - 0b11000000
    return 144 + code(1, eight) - 0b110010000
  }
  const out: number[] = []
  for (let isLast = false; !isLast;) {
    isLast = bit() === 1
    if (bits(2) !== 1) throw new Error('bloco que não é de Huffman fixo')
    for (let sym = symbol(); sym !== 256; sym = symbol()) {
      if (sym < 256) {
        out.push(sym)
        continue
      }
      const length = (LENGTH_BASE[sym - 257] ?? 0) + bits(LENGTH_EXTRA[sym - 257] ?? 0)
      const slot = code(5)
      const distance = (DISTANCE_BASE[slot] ?? 0) + bits(DISTANCE_EXTRA[slot] ?? 0)
      if (distance > out.length) throw new Error(`cópia de antes do começo: ${distance} > ${out.length}`)
      for (let i = 0; i < length; i++) out.push(out[out.length - distance] ?? 0)
    }
  }
  return Uint8Array.from(out)
}

type Chunk = { type: string; data: Uint8Array; isSound: boolean }

// Os blocos de um PNG, cada um conferido com o CRC dele.
const chunksOf = (png: Uint8Array): Chunk[] => {
  const chunks: Chunk[] = []
  for (let at = 8; at < png.length;) {
    const length = u32(png, at)
    const type = String.fromCharCode(...png.slice(at + 4, at + 8))
    const data = png.slice(at + 8, at + 8 + length)
    chunks.push({ type, data, isSound: crc32(png, at + 4, at + 8 + length) === u32(png, at + 8 + length) })
    at += 12 + length
  }
  return chunks
}

// Os pixels de um PNG feito pelo codificador (RGBA de 8 bits, filtros 0 e 2), e o tamanho dele.
const decode = (png: Uint8Array) => {
  const chunks = chunksOf(png)
  const header = chunks.find(c => c.type === 'IHDR')?.data ?? new Uint8Array(13)
  const width = u32(header, 0)
  const height = u32(header, 4)
  const raw = inflate(chunks.find(c => c.type === 'IDAT')?.data ?? new Uint8Array())
  const stride = width * 4
  const pixels = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0
    for (let i = 0; i < stride; i++) {
      const above = filter === 2 && y > 0 ? (pixels[(y - 1) * stride + i] ?? 0) : 0
      pixels[y * stride + i] = ((raw[y * (stride + 1) + 1 + i] ?? 0) + above) & 0xff
    }
  }
  return { width, height, pixels, chunks, rawLength: raw.length, checksum: u32(chunks.find(c => c.type === 'IDAT')?.data ?? new Uint8Array(), (chunks.find(c => c.type === 'IDAT')?.data.length ?? 4) - 4), raw }
}

// O quadro ampliado `scale` vezes, cada pixel virando um quadrado.
const enlarged = (frame: Frame, scale: number) => {
  const out = new Uint8Array(frame.width * scale * frame.height * scale * 4)
  for (let y = 0; y < frame.height * scale; y++)
    for (let x = 0; x < frame.width * scale; x++)
      for (let c = 0; c < 4; c++)
        out[(y * frame.width * scale + x) * 4 + c] = frame.data[(Math.floor(y / scale) * frame.width + Math.floor(x / scale)) * 4 + c] ?? 0
  return out
}

// Um quadro de ruído, sempre o mesmo: o pior caso para o compactador.
const noisy = (width: number, height: number): Frame => {
  const data = new Uint8ClampedArray(width * height * 4)
  let seed = 12345
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
    data[i] = seed >>> 24
  }
  return { width, height, data }
}

describe('as somas de conferência', () => {
  test('o CRC-32 dá os valores conhecidos', () => {
    expect(crc32(ascii('123456789'))).toBe(0xcbf43926)
    expect(crc32(ascii('IEND'))).toBe(0xae426082)
    expect(crc32(new Uint8Array())).toBe(0)
  })

  test('o CRC-32 de um trecho é o do trecho, não o do todo', () => {
    expect(crc32(ascii('xxIENDyy'), 2, 6)).toBe(0xae426082)
  })

  test('o Adler-32 dá os valores conhecidos', () => {
    expect(adler32(ascii('Wikipedia'))).toBe(0x11e60398)
    expect(adler32(new Uint8Array())).toBe(1)
  })
})

describe('a base64', () => {
  test('os exemplos da RFC 4648', () => {
    expect(['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar'].map(text => toBase64(ascii(text)))).toEqual(['', 'Zg==', 'Zm8=', 'Zm9v', 'Zm9vYg==', 'Zm9vYmE=', 'Zm9vYmFy'])
  })

  test('todos os bytes, e um texto longo', () => {
    expect(toBase64(Uint8Array.from([0, 255, 254, 253]))).toBe('AP/+/Q==')
    expect(toBase64(new Uint8Array(30_000)).length).toBe(40_000)
  })

  test('o caminho de volta devolve os mesmos bytes, com qualquer resto', () => {
    for (const text of ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar']) expect([...fromBase64(toBase64(ascii(text)))]).toEqual([...ascii(text)])
    const all = Uint8Array.from({ length: 256 }, (_, i) => i)
    expect([...fromBase64(toBase64(all))]).toEqual([...all])
  })

  test('o que não é do alfabeto é pulado', () => {
    expect([...fromBase64('Zm9v\nYmFy ')]).toEqual([...ascii('foobar')])
  })
})

describe('o PNG de um quadro', () => {
  test('começa com a assinatura e traz cabeçalho, dados e fim, cada bloco com o CRC certo', () => {
    const png = encodePng(rasterize([box(0, 0, 2, 1, 0xff8800)], 3, 2))
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const chunks = chunksOf(png)
    expect(chunks.map(c => c.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
    expect(chunks.every(c => c.isSound)).toBe(true)
    const header = chunks[0]?.data ?? new Uint8Array()
    expect([u32(header, 0), u32(header, 4)]).toEqual([3, 2])
    expect([...header.slice(8)]).toEqual([8, 6, 0, 0, 0]) // 8 bits, RGBA, sem entrelaçar
  })

  test('descompactado, devolve os mesmos pixels', () => {
    const frame = rasterize([box(0, 0, 2, 1, 0xff8800), box(1, 1, 2, 1, 0x3366cc, 0.5)], 3, 2)
    const { width, height, pixels } = decode(encodePng(frame))
    expect([width, height]).toEqual([3, 2])
    expect([...pixels]).toEqual([...frame.data])
  })

  test('a soma do fim dos dados é o Adler-32 do que foi compactado', () => {
    const { raw, checksum } = decode(encodePng(rasterize([box(2, 1, 5, 3, 0x4ec98b)], 12, 6)))
    expect(checksum).toBe(adler32(raw))
  })

  test('uma cena de áreas chapadas fica muito menor que os pixels crus, e volta igual', () => {
    const frame = rasterize([box(40, 8, 72, 40, 0xd97757), box(300, 16, 160, 40, 0x5fa8ff), box(0, 56, 480, 2, 0x6b6b6b, 0.6)], 800, 64)
    const png = encodePng(frame)
    expect(png.length).toBeLessThan(frame.data.length / 20)
    expect([...decode(png).pixels]).toEqual([...frame.data])
  })

  test('ruído puro, o pior caso, também volta igual', () => {
    const frame = noisy(37, 11)
    expect([...decode(encodePng(frame)).pixels]).toEqual([...frame.data])
  })

  test('ampliado, cada pixel vira um quadrado do tamanho pedido', () => {
    const frame = rasterize([box(0, 0, 2, 1, 0xff8800), box(1, 1, 2, 2, 0x3366cc, 0.5)], 5, 3)
    for (const scale of [2, 3]) {
      const { width, height, pixels } = decode(encodePng(frame, scale))
      expect([width, height]).toEqual([5 * scale, 3 * scale])
      expect([...pixels]).toEqual([...enlarged(frame, scale)])
    }
  })

  test('uma ampliação que não é um inteiro de 1 em diante vale 1', () => {
    const frame = rasterize([box(0, 0, 1, 1, 0xffffff)], 2, 2)
    for (const scale of [0, -2, 1.5, Number.NaN]) expect(decode(encodePng(frame, scale)).width).toBe(2)
  })

  test('um quadro sem pixels vira uma imagem de um pixel transparente', () => {
    const { width, height, pixels } = decode(encodePng({ width: 0, height: 0, data: new Uint8ClampedArray() }))
    expect([width, height]).toEqual([1, 1])
    expect([...pixels]).toEqual([0, 0, 0, 0])
  })

  test('o mesmo quadro dá sempre os mesmos bytes', () => {
    const frame = rasterize([box(3, 1, 9, 4, 0xa78bfa)], 20, 8)
    expect([...encodePng(frame)]).toEqual([...encodePng(frame)])
  })
})
