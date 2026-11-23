import { CLAWD, FINE_X } from './sprites'
import type { Patch } from './sprites'

// O que os desenhos finos dos avatares têm em comum: as medidas do quadro, como pôr linhas e remendos
// nele, e as duas tintas que todos usam.

const FINE_WIDTH = CLAWD.width * FINE_X
/** Onde o corpo do desenho fino começa, em pontos: ele ocupa os 20 do meio. */
export const BODY_LEFT = 8
/** Onde começa um remendo que passa do corpo (os braços para cima). */
export const REACH_LEFT = 4

/** Linhas de um desenho fino postas a partir de `left`, completadas com vazio até a largura dele. */
export const framed = (rows: readonly string[], left: number, fill = '.'): string[] =>
  rows.map(row => `${fill.repeat(left)}${row}${fill.repeat(Math.max(0, FINE_WIDTH - left - row.length))}`)

/** Um remendo: as linhas dele a partir de `at`, postas como as de um desenho fino. */
export const patch = (at: number, rows: readonly string[], left = BODY_LEFT): Patch => ({ at, rows: framed(rows, left) })

/** As pernas do outro passo: o pé esquerdo sobe uma linha. `foot` é a marca dele. */
export const strideOf = (foot: string, thigh = foot): Patch =>
  patch(17, [`...${thigh}${foot.repeat(4)}`, `..${foot.repeat(6)}`, '..______'])

/** As pupilas: escuras nos dois temas, sobre a pele ou o pelo. */
export const INK = '#26262B'
export const WHITE = '#FFFFFF'
