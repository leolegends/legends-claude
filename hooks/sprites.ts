import { EYE } from './pixels'
import type { Bitmap } from './pixels'

// Os desenhos do palco, em subpixels (meia célula de largura, meia linha de altura).
// O mascote é o do logo do Claude Code, ponto a ponto: ▐▛███▜▌ / ▝▜█████▛▘ / ▘▘ ▝▝.

export type Eyes = 'open' | 'closed' | 'left' | 'right'

/** As peças de um bicho, cada uma uma linha de subpixels; todas com a mesma largura. */
export type Art = {
  width: number
  /** Onde a cabeça começa e quantos subpixels tem: é onde os tijolos carregados se apoiam. */
  headFrom: number
  headWidth: number
  top: string
  eyes: Record<Eyes, string>
  arms: string
  /** A linha do corpo, entre os braços e as patas; `null` para um bicho mais baixo, sem ela. */
  body: string | null
  /** As patas: paradas (e um passo), e o outro passo. */
  legs: readonly [string, string]
  /** As colunas das mãos quando os braços sobem: ficam acesas nas duas linhas da cabeça. */
  hands: readonly number[]
  /** A marca das mãos erguidas; sem ela, a do corpo (`#`). */
  hand?: string
  /** A paleta de um avatar colorido: a tinta (hex) de cada marca que não é `#` (a cor do bicho) nem um olho aceso. */
  paints?: Readonly<Record<string, string>>
  /** A marca das pupilas: são elas que acendem nos olhos acesos. Sem ela, acendem os vazios da cabeça. */
  pupil?: string
  /** O desenho fino, para o palco que mostra detalhe (pixels, vetor, blocos no tamanho grande). */
  detail?: Detail
}

/** Quantos pontos do desenho fino cabem num subpixel: na largura e na altura. */
export const FINE_X = 2
export const FINE_Y = 4
const KEEP = '.' // num remendo: deixa o que está no desenho
const CLEAR = '_' // num remendo: apaga o que está no desenho

/** Um remendo sobre o desenho fino: linhas a partir de `at`; `.` deixa o que está, `_` apaga, o resto pinta. */
export type Patch = { at: number; rows: readonly string[] }

/**
 * O desenho fino de um bicho: `FINE_X` pontos por subpixel de largura e `FINE_Y` por linha. `frame` é
 * ele de pé, de olhos abertos e braços baixos; as outras posturas são remendos sobre ele. As últimas
 * `FINE_Y` linhas são só as pernas: sentado (ou voando), elas saem.
 */
export type Detail = {
  frame: readonly string[]
  eyes: Record<Exclude<Eyes, 'open'>, Patch>
  /** Os braços para cima. */
  raised: Patch
  /** O outro passo das pernas. */
  stride: Patch
}

export const CLAWD: Art = {
  width: 18,
  headFrom: 3,
  headWidth: 12,
  top: '...############...',
  eyes: {
    open: '...##.######.##...',
    closed: '...############...',
    left: '...#.######.###...',
    right: '...###.######.#...',
  },
  arms: '.################.',
  body: '...############...',
  legs: ['....#.#....#.#....', '.....#.#..#.#.....'],
  hands: [1, 16],
}

/** Um ajudante: o mesmo bicho, bem menor e mais baixo. */
export const MINI: Art = {
  width: 10,
  headFrom: 1,
  headWidth: 8,
  top: '.########.',
  eyes: {
    open: '.#.####.#.',
    closed: '.########.',
    left: '.#.####.#.',
    right: '.#.####.#.',
  },
  arms: '##########',
  body: null,
  legs: ['.#.#..#.#.', '..#.##.#..'],
  hands: [0, 9],
}

const light = (row: string, columns: readonly number[], hand: string) => [...row].map((ch, i) => (columns.includes(i) ? hand : ch)).join('')

// Os olhos acesos: as pupilas (ou, num bicho sem elas, os vazios dentro da cabeça) viram pontos de luz.
const glare = (art: Art, row: string) =>
  [...row].map((ch, i) => {
    if (art.pupil) return ch === art.pupil ? EYE : ch
    return ch !== '#' && i >= art.headFrom && i < art.headFrom + art.headWidth ? EYE : ch
  }).join('')

export type Stance = {
  eyes: Eyes
  /** Braços para cima: carregando, comemorando, chamando. */
  isArmsUp: boolean
  /** Qual dos dois passos das patas. */
  step: 0 | 1
  /** Sentado: sem patas, o corpo no chão. Quem voa também vai sem patas. */
  isSitting: boolean
  /** Olhos acesos: os dois vazios dos olhos viram pontos de luz (`EYE`), para pintar de outra cor. */
  hasLitEyes?: boolean
}

/** Puro: o desenho de um bicho numa postura, de cima para baixo. Sentado tem uma linha a menos. */
export const drawing = (art: Art, { eyes, isArmsUp, step, isSitting, hasLitEyes = false }: Stance): Bitmap => {
  const hands = isArmsUp ? art.hands : []
  const hand = art.hand ?? '#'
  const face = hasLitEyes ? glare(art, art.eyes[eyes]) : art.eyes[eyes]
  const upper = [light(art.top, hands, hand), light(face, hands, hand), art.arms, ...(art.body ? [art.body] : [])]
  return isSitting ? upper : [...upper, art.legs[step]]
}

const patched = (rows: readonly string[], { at, rows: over }: Patch): string[] =>
  rows.map((row, y) => {
    const marks = over[y - at]
    if (marks === undefined) return row
    return [...row].map((ch, x) => {
      const mark = marks[x] ?? KEEP
      return mark === KEEP ? ch : mark === CLEAR ? '.' : mark
    }).join('')
  })

/**
 * Puro: o desenho fino de um bicho numa postura, de cima para baixo, ou `null` para quem não tem um.
 * Os olhos acesos não entram aqui: quem pinta dá a cor deles às pupilas.
 */
export const detailDrawing = (art: Art, { eyes, isArmsUp, step, isSitting }: Stance): Bitmap | null => {
  const { detail } = art
  if (!detail) return null
  const patches = [...(eyes === 'open' ? [] : [detail.eyes[eyes]]), ...(isArmsUp ? [detail.raised] : []), ...(step === 1 ? [detail.stride] : [])]
  const rows = patches.reduce<readonly string[]>(patched, detail.frame)
  return isSitting ? rows.slice(0, -FINE_Y) : rows
}
