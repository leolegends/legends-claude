import { describe, expect, test } from 'claude-code/testing'

import { EYE } from './pixels'
import { CLAWD, MINI, drawing } from './sprites'
import type { Art, Eyes, Stance } from './sprites'

const STAND: Stance = { eyes: 'open', isArmsUp: false, step: 0, isSitting: false }
const ARTS: readonly (readonly [string, Art])[] = [['mascote', CLAWD], ['ajudante', MINI]]
const LOOKS: readonly Eyes[] = ['open', 'closed', 'left', 'right']
const count = (rows: readonly string[], mark: string) => rows.join('').split(mark).length - 1

describe('o desenho de um bicho', () => {
  test('toda linha tem a largura do desenho, em qualquer postura', () => {
    for (const [, art] of ARTS)
      for (const eyes of LOOKS)
        for (const isArmsUp of [false, true])
          for (const isSitting of [false, true])
            for (const hasLitEyes of [false, true])
              for (const row of drawing(art, { eyes, isArmsUp, step: 1, isSitting, hasLitEyes })) expect(row.length).toBe(art.width)
  })

  test('sentado (ou voando) vai sem a linha das patas', () => {
    for (const [, art] of ARTS) {
      const standing = drawing(art, STAND)
      expect(drawing(art, { ...STAND, isSitting: true })).toEqual(standing.slice(0, -1))
    }
  })

  test('de olhos acesos, os dois vazios dos olhos viram pontos de luz, e só eles', () => {
    for (const [, art] of ARTS)
      for (const eyes of ['open', 'left', 'right'] as const) {
        const plain = drawing(art, { ...STAND, eyes })
        const lit = drawing(art, { ...STAND, eyes, hasLitEyes: true })
        expect(count(lit, EYE)).toBe(2)
        expect(count(plain, EYE)).toBe(0)
        // fora os olhos, o desenho é o mesmo
        expect(lit.map(row => row.replaceAll(EYE, '.'))).toEqual(plain)
        // os olhos ficam dentro da cabeça, na linha deles
        const face = lit[1] ?? ''
        expect([...face].every((mark, i) => mark !== EYE || (i >= art.headFrom && i < art.headFrom + art.headWidth))).toBe(true)
      }
  })

  test('de olhos fechados não há o que acender', () => {
    for (const [, art] of ARTS) expect(count(drawing(art, { ...STAND, eyes: 'closed', hasLitEyes: true }), EYE)).toBe(0)
  })

  test('de garras para cima, as mãos sobem ao lado da cabeça e os olhos seguem acesos', () => {
    const up = drawing(CLAWD, { ...STAND, isArmsUp: true, hasLitEyes: true })
    for (const hand of CLAWD.hands) {
      expect(up[0]?.[hand]).toBe('#')
      expect(up[1]?.[hand]).toBe('#')
    }
    expect(count(up, EYE)).toBe(2)
  })
})
