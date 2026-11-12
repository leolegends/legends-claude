import { describe, expect, test } from 'claude-code/testing'

import { BLANK, DEFAULT_COLOR, GLYPHS, cellShapes, fitCells, groundColor, packCells, unpackCells } from './blocks'
import type { Cell } from './blocks'
import { box, rasterize } from './canvas'
import type { Shape } from './canvas'
import { toBase64 } from './png'

const CW = 8 // pixels de largura de uma célula
const CH = 16 // e de altura
const NIGHT = 0x0b0b10
const RED = 0xe04030
const BLUE = 0x3060e0
const PURPLE = 0xa78bfa

// As células de uma cena de `columns` por `rows` células.
const fit = (shapes: Shape[], columns = 1, rows = 1) => fitCells(rasterize(shapes, columns * CW, rows * CH), columns, rows, NIGHT)
const only = (shapes: Shape[]) => fit(shapes)[0]
const glyph = (cell: Cell | undefined) => String.fromCodePoint(cell?.code ?? 0)

describe('uma célula a partir dos pixels dela', () => {
  test('sem tinta, fica em branco, com as cores do terminal', () => {
    expect(only([])).toEqual(BLANK)
    expect(BLANK).toEqual({ code: 0x20, fg: DEFAULT_COLOR, bg: DEFAULT_COLOR })
  })

  test('toda de uma cor, é um espaço com essa cor de fundo: sem emenda entre vizinhas', () => {
    expect(only([box(0, 0, CW, CH, RED)])).toEqual({ code: 0x20, fg: DEFAULT_COLOR, bg: RED })
  })

  test('a borda direita de um desenho cai em qualquer oitavo da célula', () => {
    const edges = Array.from({ length: 7 }, (_, i) => glyph(only([box(0, 0, i + 1, CH, RED)])))
    expect(edges.join('')).toBe('▏▎▍▌▋▊▉')
    expect(only([box(0, 0, 3, CH, RED)])).toEqual({ code: 0x258d, fg: RED, bg: DEFAULT_COLOR })
  })

  test('o topo de um desenho cai em qualquer oitavo da célula', () => {
    const tops = Array.from({ length: 7 }, (_, i) => glyph(only([box(0, CH - (i + 1) * 2, CW, (i + 1) * 2, RED)])))
    expect(tops.join('')).toBe('▁▂▃▄▅▆▇')
  })

  test('sobre o fundo do terminal, a borda esquerda e a de baixo só têm a metade e o oitavo: vale o mais próximo', () => {
    // a tinta do terminal não pinta "transparente": o desenho tem de ser o primeiro plano
    expect(glyph(only([box(5, 0, 3, CH, RED)]))).toBe('▐') // três oitavos à direita: a metade direita
    expect(glyph(only([box(7, 0, 1, CH, RED)]))).toBe('▕')
    expect(glyph(only([box(0, 0, CW, 6, RED)]))).toBe('▀') // três oitavos em cima: a metade de cima
    expect(glyph(only([box(0, 0, CW, 2, RED)]))).toBe('▔')
    expect(only([box(5, 0, 3, CH, RED)])?.bg).toBe(DEFAULT_COLOR)
  })

  test('entre duas cores opacas, qualquer borda cai em qualquer oitavo: uma é o desenho, a outra o fundo', () => {
    expect(only([box(0, 0, 5, CH, BLUE), box(5, 0, 3, CH, RED)])).toEqual({ code: 0x258b, fg: BLUE, bg: RED }) // ▋
    expect(only([box(0, 0, CW, 6, RED), box(0, 6, CW, 10, BLUE)])).toEqual({ code: 0x2585, fg: BLUE, bg: RED }) // ▅
  })

  test('os quadrantes', () => {
    const half = { w: CW / 2, h: CH / 2 }
    const quad = (col: number, row: number) => box(col * half.w, row * half.h, half.w, half.h, RED)
    expect(glyph(only([quad(0, 0), quad(1, 1)]))).toBe('▚')
    expect(glyph(only([quad(1, 0), quad(0, 1)]))).toBe('▞')
    expect(glyph(only([quad(0, 0), quad(1, 0), quad(0, 1)]))).toBe('▛')
    expect(glyph(only([quad(1, 0)]))).toBe('▝')
    expect(glyph(only([quad(0, 1)]))).toBe('▖')
  })

  test('a cor do desenho fica pura na borda, não escurece com o vazio ao lado', () => {
    expect(only([box(0, 0, 4, CH, RED)])).toEqual({ code: 0x258c, fg: RED, bg: DEFAULT_COLOR })
  })

  test('tinta translúcida aparece já misturada com o fundo que se supõe', () => {
    // meio roxo sobre a noite: a metade do caminho entre os dois
    expect(only([box(0, 0, CW, CH, PURPLE, 0.5)])).toEqual({ code: 0x20, fg: DEFAULT_COLOR, bg: 0x594b85 })
  })

  test('um clarão translúcido atrás de um corpo opaco: a célula mostra os dois, cada um na sua metade', () => {
    // ▌ com o clarão de fundo ou ▐ com o corpo de fundo desenham o mesmo: vale o que se vê
    const cells = fit([box(0, 0, CW, CH, PURPLE, 0.5), box(0, 0, 4, CH, RED)])
    const seen = rasterize(cellShapes(cells, 1, CW, CH), CW, CH)
    const wanted = rasterize([box(0, 0, CW, CH, 0x594b85), box(0, 0, 4, CH, RED)], CW, CH)
    expect([...seen.data]).toEqual([...wanted.data])
  })

  test('as células saem linha a linha, da esquerda para a direita', () => {
    const cells = fit([box(CW, 0, CW, CH, RED), box(0, CH, CW, CH, BLUE)], 2, 2)
    expect(cells.map(c => c.bg)).toEqual([DEFAULT_COLOR, RED, BLUE, DEFAULT_COLOR])
  })

  test('uma grade sem células, ou um quadro que não a cobre, não quebra', () => {
    expect(fitCells(rasterize([], 8, 16), 0, 1, NIGHT)).toEqual([])
    expect(fitCells(rasterize([], 8, 16), 1, Number.NaN, NIGHT)).toEqual([])
    expect(fitCells(rasterize([], 0, 0), 2, 1, NIGHT)).toEqual([BLANK, BLANK])
  })
})

describe('todo bloco do conjunto', () => {
  test('desenhado e ajustado de volta, mostra os mesmos pixels, com as duas cores', () => {
    // entre duas cores opacas um bloco e o seu complemento (▀ e ▄, ▌ e ▐) desenham o mesmo: vale o que se vê
    for (const { code } of GLYPHS) {
      const frame = rasterize(cellShapes([{ code, fg: RED, bg: BLUE }], 1, CW, CH), CW, CH)
      const again = rasterize(cellShapes(fitCells(frame, 1, 1, NIGHT), 1, CW, CH), CW, CH)
      expect([...again.data]).toEqual([...frame.data])
    }
  })

  test('sobre o fundo do terminal também, com a cor do terminal atrás', () => {
    for (const { code } of GLYPHS) {
      const cell: Cell = { code, fg: RED, bg: DEFAULT_COLOR }
      const frame = rasterize(cellShapes([cell], 1, CW, CH), CW, CH)
      expect(fitCells(frame, 1, 1, NIGHT)).toEqual([cell])
    }
  })

  test('cada bloco é um caractere só, de uma coluna, do plano básico', () => {
    expect(GLYPHS.every(g => g.code >= 0x2580 && g.code <= 0x259f)).toBe(true)
    expect(new Set(GLYPHS.map(g => g.code)).size).toBe(GLYPHS.length)
  })

  test('uma célula de texto não é um bloco: no desenho de conferência, só o fundo dela aparece', () => {
    expect(cellShapes([{ code: 0x41, fg: RED, bg: BLUE }], 1, CW, CH)).toEqual([box(0, 0, CW, CH, BLUE)])
    expect(cellShapes([BLANK], 1, CW, CH)).toEqual([])
  })
})

describe('as células empacotadas para o terminal', () => {
  test('três números de 32 bits por célula, o byte baixo primeiro, em base64', () => {
    // o exemplo da documentação do Raster: uma célula laranja
    const packed = packCells([{ code: 0x2588, fg: 0xff8800, bg: DEFAULT_COLOR }])
    expect(packed).toBe(toBase64(Uint8Array.from([0x88, 0x25, 0, 0, 0x00, 0x88, 0xff, 0x00, 0, 0, 0, 1])))
    expect(packCells([])).toBe('')
    expect(packCells([BLANK, BLANK]).length).toBe(32)
  })
})

describe('as células lidas de volta', () => {
  test('o que foi empacotado volta igual', () => {
    const cells: Cell[] = [{ code: 0x2588, fg: 0xff8800, bg: DEFAULT_COLOR }, BLANK, { code: 0x41, fg: DEFAULT_COLOR, bg: 0x102030 }]
    expect(unpackCells(packCells(cells))).toEqual(cells)
    expect(unpackCells('')).toEqual([])
  })
})

describe('o fundo de um texto posto sobre uma célula', () => {
  test('é a cor que mais aparece nela: a do bloco, se ele cobre a metade ou mais', () => {
    expect(groundColor({ code: 0x2587, fg: RED, bg: BLUE })).toBe(RED) // ▇
    expect(groundColor({ code: 0x258c, fg: RED, bg: BLUE })).toBe(RED) // ▌
    expect(groundColor({ code: 0x2581, fg: RED, bg: BLUE })).toBe(BLUE) // ▁
    expect(groundColor({ code: 0x20, fg: DEFAULT_COLOR, bg: BLUE })).toBe(BLUE)
    expect(groundColor(BLANK)).toBe(DEFAULT_COLOR)
  })
})
