import type { Frame } from './canvas'

// Um quadro virando PNG. O ambiente de um mod não tem zlib nem Node: o compactador é este, bem simples,
// que serve à cena do palco: áreas de cor chapada e linhas iguais à de cima. Cada linha é guardada como
// a diferença para a de cima (o filtro "Up"); uma linha igual à anterior vira uma cópia dela, e um
// trecho de pixels iguais, uma cópia do primeiro. Os códigos são os de Huffman fixo do deflate.
// Um quadro do palco sai com poucos KB em vez de centenas. Tudo puro: a mesma entrada, os mesmos bytes.

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const CHANNELS = 4
const FILTER_UP = 2
const HEADER_AT = SIGNATURE.length // onde começa o bloco IHDR
const HEADER_DATA = 13
const DATA_AT = HEADER_AT + 12 + HEADER_DATA // onde começa o bloco IDAT
const ZLIB_AT = DATA_AT + 8 // e os dados dele
const TAIL = 4 + 4 + 12 // o Adler-32, o CRC do IDAT e o bloco IEND inteiro
const ZLIB_HEADER = [0x78, 0x01] // deflate, janela de 32K, sem dicionário
const ADLER_MOD = 65521
const ADLER_BATCH = 5552 // quantos bytes cabem somados antes do resto, sem passar de 32 bits
const MATCH_MIN = 3
const MATCH_MAX = 258
const WINDOW = 32768 // a maior distância de uma cópia
const END_OF_BLOCK = 256
const FIRST_ROOM = 1 << 15

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DISTANCE_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DISTANCE_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) =>
  Array.from({ length: 8 }).reduce<number>(c => (c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1), n))

/** O CRC-32 (o do PNG e do zip) dos bytes de `from` até antes de `to`. */
export const crc32 = (bytes: Uint8Array, from = 0, to = bytes.length): number => {
  let crc = 0xffffffff
  for (let i = from; i < to; i++) crc = (CRC_TABLE[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// O Adler-32 em duas metades, para ser somado aos poucos: `low` começa em 1.
type Adler = { low: number; high: number }

const adlerOver = (bytes: Uint8Array, from: Adler): Adler => {
  let { low, high } = from
  for (let at = 0; at < bytes.length; at += ADLER_BATCH) {
    const end = Math.min(bytes.length, at + ADLER_BATCH)
    for (let i = at; i < end; i++) {
      low += bytes[i] ?? 0
      high += low
    }
    low %= ADLER_MOD
    high %= ADLER_MOD
  }
  return { low, high }
}

/** O Adler-32 (o do zlib) de uns bytes. */
export const adler32 = (bytes: Uint8Array): number => {
  const { low, high } = adlerOver(bytes, { low: 1, high: 0 })
  return ((high << 16) | low) >>> 0
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64_CODES = Uint8Array.from([...BASE64].map(ch => ch.charCodeAt(0)))
const PAD = '='.charCodeAt(0)
const TEXT_BATCH = 8192 // caracteres montados de cada vez

/** Uns bytes em base64, com o preenchimento `=` no fim. */
export const toBase64 = (bytes: Uint8Array): string => {
  const codes = new Uint8Array(Math.ceil(bytes.length / 3) * 4)
  for (let i = 0, o = 0; i < bytes.length; i += 3, o += 4) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    codes[o] = BASE64_CODES[a >> 2] ?? 0
    codes[o + 1] = BASE64_CODES[((a & 3) << 4) | (b >> 4)] ?? 0
    codes[o + 2] = i + 1 < bytes.length ? (BASE64_CODES[((b & 15) << 2) | (c >> 6)] ?? 0) : PAD
    codes[o + 3] = i + 2 < bytes.length ? (BASE64_CODES[c & 63] ?? 0) : PAD
  }
  const parts: string[] = []
  for (let at = 0; at < codes.length; at += TEXT_BATCH) parts.push(String.fromCharCode(...codes.subarray(at, at + TEXT_BATCH)))
  return parts.join('')
}

const NOT_BASE64 = 255
const BASE64_VALUES = Uint8Array.from({ length: 128 }, (_, code) => {
  const at = BASE64.indexOf(String.fromCharCode(code))
  return at < 0 ? NOT_BASE64 : at
})

/** Os bytes de um texto em base64; o que não é do alfabeto (o `=` do fim, um espaço) é pulado. */
export const fromBase64 = (text: string): Uint8Array => {
  const values = [...text].flatMap(ch => {
    const value = BASE64_VALUES[ch.charCodeAt(0)] ?? NOT_BASE64
    return value === NOT_BASE64 ? [] : [value]
  })
  const bytes = new Uint8Array(Math.floor((values.length * 3) / 4))
  for (let i = 0, o = 0; o < bytes.length; i += 4) {
    const word = ((values[i] ?? 0) << 18) | ((values[i + 1] ?? 0) << 12) | ((values[i + 2] ?? 0) << 6) | (values[i + 3] ?? 0)
    if (o < bytes.length) bytes[o++] = (word >> 16) & 0xff
    if (o < bytes.length) bytes[o++] = (word >> 8) & 0xff
    if (o < bytes.length) bytes[o++] = word & 0xff
  }
  return bytes
}

// Um código de Huffman vai do bit mais alto para o mais baixo; o deflate enche os bytes do mais baixo
// para o mais alto. Guardar o código já invertido deixa a escrita igual à dos outros números.
const reversed = (code: number, bits: number) => Array.from({ length: bits }).reduce<number>((out, _, i) => out | (((code >> i) & 1) << (bits - 1 - i)), 0)

// O código fixo de cada símbolo (um byte, o fim do bloco, ou um comprimento de cópia) e o tamanho dele.
const fixedOf = (symbol: number): readonly [code: number, bits: number] =>
  symbol < 144 ? [0x30 + symbol, 8] : symbol < 256 ? [0x190 + symbol - 144, 9] : symbol < 280 ? [symbol - 256, 7] : [0xc0 + symbol - 280, 8]

const SYMBOLS = Array.from({ length: 288 }, (_, symbol) => fixedOf(symbol))
const SYMBOL_CODE = Uint16Array.from(SYMBOLS.map(([code, bits]) => reversed(code, bits)))
const SYMBOL_BITS = Uint8Array.from(SYMBOLS.map(([, bits]) => bits))
// Para cada comprimento de cópia, de 3 a 258: em que faixa da tabela ele cai.
const LENGTH_SLOT = Uint8Array.from({ length: MATCH_MAX + 1 }, (_, length) => Math.max(0, LENGTH_BASE.findLastIndex(base => base <= length)))
const DISTANCE_CODE = Uint8Array.from({ length: DISTANCE_BASE.length }, (_, slot) => reversed(slot, 5))

// O que vai sendo escrito: os bytes, onde está, e os bits que ainda não fecharam um byte.
// Existe só dentro de `encodePng`, que o cria, enche e descarta.
type Sink = { bytes: Uint8Array; at: number; hold: number; held: number }

const put = (sink: Sink, value: number, bits: number) => {
  sink.hold |= value << sink.held
  sink.held += bits
  while (sink.held >= 8) {
    sink.bytes[sink.at++] = sink.hold & 0xff
    sink.hold >>>= 8
    sink.held -= 8
  }
}

const putSymbol = (sink: Sink, symbol: number) => put(sink, SYMBOL_CODE[symbol] ?? 0, SYMBOL_BITS[symbol] ?? 0)

// Uma cópia de `length` bytes vindos de `distance` bytes atrás, em pedaços que o deflate aceita.
const putCopy = (sink: Sink, length: number, distance: number) => {
  const slot = DISTANCE_BASE.findLastIndex(base => base <= distance)
  for (let left = length; left > 0;) {
    const whole = Math.min(MATCH_MAX, left)
    const piece = left - whole > 0 && left - whole < MATCH_MIN ? left - MATCH_MIN : whole // nunca sobra um resto curto demais
    const at = LENGTH_SLOT[piece] ?? 0
    putSymbol(sink, 257 + at)
    put(sink, piece - (LENGTH_BASE[at] ?? 0), LENGTH_EXTRA[at] ?? 0)
    put(sink, DISTANCE_CODE[slot] ?? 0, 5)
    put(sink, distance - (DISTANCE_BASE[slot] ?? 0), DISTANCE_EXTRA[slot] ?? 0)
    left -= piece
  }
}

const isSamePixel = (row: Uint8Array, a: number, b: number) =>
  row[a] === row[b] && row[a + 1] === row[b + 1] && row[a + 2] === row[b + 2] && row[a + 3] === row[b + 3]

const isSameRow = (a: Uint8Array, b: Uint8Array) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

// Uma linha (o byte do filtro e os pixels): igual à anterior, é uma cópia dela inteira; senão, cada
// pixel sai por extenso, e um trecho de pixels iguais é uma cópia do primeiro.
const putRow = (sink: Sink, row: Uint8Array, previous: Uint8Array | null) => {
  if (previous && row.length <= WINDOW && isSameRow(row, previous)) return putCopy(sink, row.length, row.length)
  putSymbol(sink, row[0] ?? 0)
  for (let at = 1; at < row.length;) {
    for (let c = 0; c < CHANNELS; c++) putSymbol(sink, row[at + c] ?? 0)
    let next = at + CHANNELS
    while (next < row.length && isSamePixel(row, at, next)) next += CHANNELS
    if (next > at + CHANNELS) putCopy(sink, next - at - CHANNELS, CHANNELS)
    at = next
  }
}

// Os bytes de uma linha no pior caso (cada um com 9 bits), com folga.
const worstOf = (rowLength: number) => Math.ceil((rowLength * 9) / 8) + 16

const grown = (sink: Sink, need: number): Sink => {
  if (sink.at + need <= sink.bytes.length) return sink
  const bytes = new Uint8Array(Math.max(sink.bytes.length * 2, sink.at + need))
  bytes.set(sink.bytes.subarray(0, sink.at))
  return { ...sink, bytes }
}

const setU32 = (bytes: Uint8Array, at: number, value: number) => {
  bytes[at] = value >>> 24
  bytes[at + 1] = (value >>> 16) & 0xff
  bytes[at + 2] = (value >>> 8) & 0xff
  bytes[at + 3] = value & 0xff
}

const setText = (bytes: Uint8Array, at: number, text: string) => [...text].forEach((ch, i) => (bytes[at + i] = ch.charCodeAt(0)))

// A linha `y` do quadro como diferença para a de cima, cada pixel repetido `scale` vezes.
const upRow = (frame: Frame, y: number, scale: number, rowLength: number): Uint8Array => {
  const row = new Uint8Array(rowLength)
  row[0] = FILTER_UP
  const stride = frame.width * CHANNELS
  for (let x = 0; x < frame.width; x++) {
    for (let c = 0; c < CHANNELS; c++) {
      const here = frame.data[y * stride + x * CHANNELS + c] ?? 0
      const above = y > 0 ? (frame.data[(y - 1) * stride + x * CHANNELS + c] ?? 0) : 0
      const delta = (here - above) & 0xff
      for (let s = 0; s < scale; s++) row[1 + (x * scale + s) * CHANNELS + c] = delta
    }
  }
  return row
}

const EMPTY_FRAME: Frame = { width: 1, height: 1, data: new Uint8ClampedArray(CHANNELS) }

/**
 * Puro: o quadro como um arquivo PNG (RGBA de 8 bits). `scale` amplia: cada pixel vira um quadrado de
 * `scale` por `scale`, para a imagem chegar ao terminal já perto do tamanho em que será mostrada.
 * Um quadro sem pixels sai como uma imagem de um pixel transparente.
 */
export const encodePng = (source: Frame, scale = 1): Uint8Array => {
  const frame = source.width > 0 && source.height > 0 && source.data.length >= source.width * source.height * CHANNELS ? source : EMPTY_FRAME
  const zoom = Number.isInteger(scale) && scale >= 1 ? scale : 1
  const rowLength = 1 + frame.width * zoom * CHANNELS
  const still = new Uint8Array(rowLength) // uma linha igual à de cima: o filtro e só zeros
  still[0] = FILTER_UP

  let sink: Sink = { bytes: new Uint8Array(Math.max(FIRST_ROOM, ZLIB_AT + worstOf(rowLength) + TAIL)), at: ZLIB_AT, hold: 0, held: 0 }
  sink.bytes.set(SIGNATURE)
  setU32(sink.bytes, HEADER_AT, HEADER_DATA)
  setText(sink.bytes, HEADER_AT + 4, 'IHDR')
  setU32(sink.bytes, HEADER_AT + 8, frame.width * zoom)
  setU32(sink.bytes, HEADER_AT + 12, frame.height * zoom)
  sink.bytes.set([8, 6, 0, 0, 0], HEADER_AT + 16) // 8 bits por canal, RGBA, deflate, filtro por linha, sem entrelaçar
  setU32(sink.bytes, HEADER_AT + 8 + HEADER_DATA, crc32(sink.bytes, HEADER_AT + 4, HEADER_AT + 8 + HEADER_DATA))

  sink.bytes.set(ZLIB_HEADER, sink.at)
  sink.at += ZLIB_HEADER.length
  put(sink, 0b011, 3) // um bloco só, o último, de Huffman fixo
  let sum: Adler = { low: 1, high: 0 }
  let previous: Uint8Array | null = null
  for (let y = 0; y < frame.height; y++) {
    const first = upRow(frame, y, zoom, rowLength)
    // a linha do quadro, e depois as cópias dela que a ampliação pede: iguais à de cima
    for (let copy = 0; copy < zoom; copy++) {
      const row = copy === 0 ? first : still
      sink = grown(sink, worstOf(rowLength) + TAIL)
      putRow(sink, row, previous)
      sum = adlerOver(row, sum)
      previous = row
    }
  }
  putSymbol(sink, END_OF_BLOCK)
  if (sink.held > 0) put(sink, 0, 8 - sink.held) // fecha o último byte
  sink = grown(sink, TAIL)
  setU32(sink.bytes, sink.at, ((sum.high << 16) | sum.low) >>> 0)
  const dataEnd = sink.at + 4
  setU32(sink.bytes, DATA_AT, dataEnd - ZLIB_AT)
  setText(sink.bytes, DATA_AT + 4, 'IDAT')
  setU32(sink.bytes, dataEnd, crc32(sink.bytes, DATA_AT + 4, dataEnd))
  setU32(sink.bytes, dataEnd + 4, 0)
  setText(sink.bytes, dataEnd + 8, 'IEND')
  setU32(sink.bytes, dataEnd + 12, crc32(sink.bytes, dataEnd + 8, dataEnd + 12))
  return sink.bytes.slice(0, dataEnd + 16)
}
