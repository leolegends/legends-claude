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

const light = (row: string, columns: readonly number[]) => [...row].map((ch, i) => (columns.includes(i) ? '#' : ch)).join('')

// Os olhos acesos: os vazios dentro da cabeça viram pontos de luz.
const glare = (art: Art, row: string) =>
  [...row].map((ch, i) => (ch !== '#' && i >= art.headFrom && i < art.headFrom + art.headWidth ? EYE : ch)).join('')

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
  const face = hasLitEyes ? glare(art, art.eyes[eyes]) : art.eyes[eyes]
  const upper = [light(art.top, hands), light(face, hands), art.arms, ...(art.body ? [art.body] : [])]
  return isSitting ? upper : [...upper, art.legs[step]]
}
