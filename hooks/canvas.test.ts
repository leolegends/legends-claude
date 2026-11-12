import { describe, expect, test } from 'claude-code/testing'

import { bitmapShapes, box, rasterize } from './canvas'
import type { Frame } from './canvas'

const RED = 0xff0000
const BLUE = 0x0000ff

// O pixel (x, y) de um quadro, como [r, g, b, a].
const at = (frame: Frame, x: number, y: number) => [...frame.data.slice((y * frame.width + x) * 4, (y * frame.width + x) * 4 + 4)]

describe('o quadro de pixels', () => {
  test('um quadro sem tinta é todo transparente', () => {
    const frame = rasterize([], 4, 2)
    expect(frame.width).toBe(4)
    expect(frame.height).toBe(2)
    expect(frame.data.length).toBe(4 * 2 * 4)
    expect([...frame.data].every(byte => byte === 0)).toBe(true)
  })

  test('um retângulo opaco pinta só a sua área', () => {
    const frame = rasterize([box(1, 0, 2, 1, RED)], 4, 2)
    expect(at(frame, 0, 0)).toEqual([0, 0, 0, 0])
    expect(at(frame, 1, 0)).toEqual([255, 0, 0, 255])
    expect(at(frame, 2, 0)).toEqual([255, 0, 0, 255])
    expect(at(frame, 3, 0)).toEqual([0, 0, 0, 0])
    expect(at(frame, 1, 1)).toEqual([0, 0, 0, 0])
  })

  test('o que passa da borda é cortado, sem erro', () => {
    const frame = rasterize([box(-3, -3, 5, 5, RED), box(3, 1, 10, 10, BLUE)], 4, 2)
    expect(at(frame, 0, 0)).toEqual([255, 0, 0, 255])
    expect(at(frame, 1, 1)).toEqual([255, 0, 0, 255])
    expect(at(frame, 2, 1)).toEqual([0, 0, 0, 0])
    expect(at(frame, 3, 1)).toEqual([0, 0, 255, 255])
  })

  test('quem vem depois cobre quem veio antes', () => {
    const frame = rasterize([box(0, 0, 2, 1, RED), box(1, 0, 2, 1, BLUE)], 4, 1)
    expect(at(frame, 0, 0)).toEqual([255, 0, 0, 255])
    expect(at(frame, 1, 0)).toEqual([0, 0, 255, 255])
  })

  test('tinta translúcida sobre o vazio guarda a cor inteira e a opacidade dela', () => {
    const frame = rasterize([box(0, 0, 1, 1, RED, 0.5)], 1, 1)
    expect(at(frame, 0, 0)).toEqual([255, 0, 0, 128])
  })

  test('tinta translúcida sobre tinta opaca mistura as duas e segue opaca', () => {
    const frame = rasterize([box(0, 0, 1, 1, RED), box(0, 0, 1, 1, BLUE, 0.5)], 1, 1)
    expect(at(frame, 0, 0)).toEqual([128, 0, 128, 255])
  })

  test('posições quebradas arredondam sem abrir fresta entre vizinhos', () => {
    // dois retângulos encostados em 1,5: a borda de um é a do outro
    const frame = rasterize([box(0, 0, 1.5, 1, RED), box(1.5, 0, 1.5, 1, BLUE)], 3, 1)
    expect(at(frame, 0, 0)).toEqual([255, 0, 0, 255])
    expect(at(frame, 1, 0)[3]).toBe(255)
    expect(at(frame, 2, 0)).toEqual([0, 0, 255, 255])
  })

  test('tinta sem área, sem opacidade ou com número estragado não pinta nada', () => {
    const frame = rasterize([box(0, 0, 0, 1, RED), box(0, 0, 1, 1, RED, 0), box(Number.NaN, 0, 1, 1, RED)], 2, 1)
    expect([...frame.data].every(byte => byte === 0)).toBe(true)
  })

  test('um quadro de tamanho inválido sai vazio, não quebra', () => {
    expect(rasterize([box(0, 0, 1, 1, RED)], 0, 4).data.length).toBe(0)
    expect(rasterize([box(0, 0, 1, 1, RED)], Number.NaN, 4).width).toBe(0)
  })
})

describe('um desenho virando retângulos', () => {
  const paint = (mark: string) => (mark === '#' ? { rgb: RED } : mark === 'o' ? { rgb: BLUE, a: 0.5 } : null)

  test('cada trecho contínuo de uma linha vira um retângulo só', () => {
    const shapes = bitmapShapes(['##.#', '....'], { left: 10, top: 20, cellW: 4, cellH: 8 }, paint)
    expect(shapes).toEqual([
      { x: 10, y: 20, w: 8, h: 8, rgb: RED, a: 1 },
      { x: 22, y: 20, w: 4, h: 8, rgb: RED, a: 1 },
    ])
  })

  test('marcas de tintas diferentes não se juntam', () => {
    const shapes = bitmapShapes(['#o#'], { left: 0, top: 0, cellW: 2, cellH: 2 }, paint)
    expect(shapes.map(s => [s.x, s.w, s.rgb, s.a])).toEqual([[0, 2, RED, 1], [2, 2, BLUE, 0.5], [4, 2, RED, 1]])
  })

  test('a tinta pode depender da coluna e da linha da marca', () => {
    const shapes = bitmapShapes(['##', '##'], { left: 0, top: 0, cellW: 1, cellH: 1 }, (_, col, row) => ({ rgb: col + row * 2 }))
    expect(shapes.map(s => s.rgb)).toEqual([0, 1, 2, 3])
  })
})
