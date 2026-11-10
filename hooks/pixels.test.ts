import { describe, expect, test } from 'claude-code/testing'

import { brick, cellOf, dotKey, dotsLayer, pixelAt, rasterRow, spriteLayer } from './pixels'
import type { Layer } from './pixels'

const A = '#111111'
const B = '#222222'
const none = undefined

describe('uma célula a partir de quatro subpixels', () => {
  test('sem nada pintado não há célula', () => {
    expect(cellOf([none, none, none, none])).toBeNull()
  })

  test('cada combinação de subpixels tem o seu bloco', () => {
    const glyph = (...on: boolean[]) => cellOf(on.map(isOn => (isOn ? A : none)))?.text
    expect(glyph(true, false, false, false)).toBe('▘')
    expect(glyph(false, true, false, false)).toBe('▝')
    expect(glyph(false, false, true, false)).toBe('▖')
    expect(glyph(false, false, false, true)).toBe('▗')
    expect(glyph(true, true, false, false)).toBe('▀')
    expect(glyph(false, false, true, true)).toBe('▄')
    expect(glyph(true, false, true, false)).toBe('▌')
    expect(glyph(false, true, false, true)).toBe('▐')
    expect(glyph(true, false, false, true)).toBe('▚')
    expect(glyph(false, true, true, false)).toBe('▞')
    expect(glyph(true, true, true, false)).toBe('▛')
    expect(glyph(true, true, false, true)).toBe('▜')
    expect(glyph(true, true, true, true)).toBe('█')
  })

  test('uma cor só vai na frente, sem fundo', () => {
    expect(cellOf([A, A, none, none])).toEqual({ text: '▀', color: A })
  })

  test('duas cores cobrindo a célula inteira: uma desenha, a outra é o fundo', () => {
    expect(cellOf([A, A, B, B])).toEqual({ text: '▀', color: A, bg: B })
    expect(cellOf([A, B, A, B])).toEqual({ text: '▌', color: A, bg: B })
  })

  test('duas cores sem cobrir tudo: o desenho inteiro na cor que mais aparece', () => {
    expect(cellOf([A, B, B, none])).toEqual({ text: '▛', color: B })
  })

  test('uma tinta apagada sai apagada', () => {
    expect(cellOf(['~suggestion', '~suggestion', none, none])).toEqual({ text: '▀', color: 'suggestion', dim: true })
  })
})

describe('camadas', () => {
  const front: Layer = (x, y) => (x === 0 && y === 0 ? A : x === 1 && y === 0 ? null : undefined)
  const back: Layer = () => B

  test('vale a camada da frente; onde ela é transparente, a de trás', () => {
    expect(pixelAt([front, back], 0, 0)).toBe(A)
    expect(pixelAt([front, back], 5, 5)).toBe(B)
  })

  test('uma camada pode tapar o que está atrás sem pintar nada', () => {
    expect(pixelAt([front, back], 1, 0)).toBeUndefined()
  })

  test('um desenho é opaco no retângulo dele e numa margem de um subpixel, e transparente fora', () => {
    const sprite = spriteLayer(['#.#', '.#.'], 10, 4, A)
    expect(sprite(10, 4)).toBe(A)
    expect(sprite(11, 4)).toBeNull() // um vazio dentro do desenho esconde o que passa atrás
    expect(sprite(9, 4)).toBeNull() // a margem
    expect(sprite(13, 5)).toBeNull()
    expect(sprite(8, 4)).toBeUndefined()
    expect(sprite(14, 4)).toBeUndefined()
    expect(sprite(10, 3)).toBeUndefined()
    expect(sprite(10, 6)).toBeUndefined()
  })

  test('um tijolo tem duas células de largura e meia linha de altura', () => {
    const dots = dotsLayer(brick(3, 6, A))
    expect([5, 6, 7, 8, 9, 10].map(x => dots(x, 6))).toEqual([none, A, A, A, A, none])
    expect(dots(6, 5)).toBeUndefined()
  })

  test('um ponto fora da área não entra', () => {
    expect(dotKey(-1, 2)).toBeUndefined()
    expect(dotKey(2, -1)).toBeUndefined()
    expect(dotsLayer([[dotKey(-1, 0), A]])(-1, 0)).toBeUndefined()
  })
})

describe('uma linha de células', () => {
  const none2 = () => undefined
  const text = (parts: { text: string }[]) => parts.map(p => p.text).join('')

  test('o mesmo desenho deslocado meia célula usa outros blocos', () => {
    const at = (left: number) => text(rasterRow({ layers: [spriteLayer(['####', '####'], left, 0, A)], row: 0, width: 6, over: none2, under: none2 }))
    expect(at(2)).toBe(' ██')
    expect(at(3)).toBe(' ▐█▌')
  })

  test('o texto fica por cima do desenho; o chão só aparece onde não há nada pintado', () => {
    const row = rasterRow({
      layers: [spriteLayer(['##'], 2, 0, A)],
      row: 0, width: 5,
      over: cell => (cell === 3 ? { text: '!', bold: true } : undefined),
      under: () => ({ text: '─', color: 'subtle' }),
    })
    expect(text(row)).toBe('─▀─!─')
    expect(row.find(p => p.text === '!')).toMatchObject({ bold: true })
  })

  test('trechos vizinhos de mesmo estilo viram um só, e o branco do fim é cortado', () => {
    const row = rasterRow({ layers: [dotsLayer([...brick(0, 0, A), ...brick(2, 0, A)])], row: 0, width: 12, over: none2, under: none2 })
    expect(row).toEqual([{ text: '▀▀▀▀', color: A }])
  })
})
