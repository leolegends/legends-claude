import { merge } from './parts'
import type { Part } from './parts'

// O desenhador do palco. Cada célula do terminal vale 2×2 subpixels: os blocos de quadrante (▘▝▖▗…)
// desenham qualquer combinação deles, e a cor de fundo permite duas cores na mesma célula.
// Assim um desenho anda de meia em meia célula e sobe de meia em meia linha.

/** Uma tinta: uma cor do tema ou hex; com `~` na frente, apagada. */
export type Paint = string

/**
 * Uma camada do desenho: para um subpixel, a tinta que ela põe ali, `null` quando tapa o que está
 * atrás sem pintar, ou nada quando é transparente.
 */
export type Layer = (x: number, y: number) => Paint | null | undefined

/** Um desenho em subpixels: `#` pintado, qualquer outra coisa vazio. */
export type Bitmap = readonly string[]

// O índice soma 1 (cima-esquerda), 2 (cima-direita), 4 (baixo-esquerda) e 8 (baixo-direita).
const QUADRANTS = [' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛', '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█']
const BITS = [1, 2, 4, 8]
const FULL = 15
const DOT_STRIDE = 4096 // a chave de um ponto: y * DOT_STRIDE + x

const styleOf = (paint: Paint): Pick<Part, 'color' | 'dim'> =>
  paint.startsWith('~') ? { color: paint.slice(1), dim: true } : { color: paint }

/** A tinta da frente num subpixel: a primeira camada, da frente para o fundo, que diz algo. */
export const pixelAt = (layers: readonly Layer[], x: number, y: number): Paint | undefined => {
  for (const layer of layers) {
    const paint = layer(x, y)
    if (paint !== undefined) return paint ?? undefined
  }
  return undefined
}

/**
 * Uma célula a partir dos seus quatro subpixels (cima-esquerda, cima-direita, baixo-esquerda,
 * baixo-direita), ou `null` quando nenhum está pintado.
 */
export const cellOf = (quad: readonly (Paint | undefined)[]): Part | null => {
  const paints = [...new Set(quad.filter((p): p is Paint => p !== undefined))]
  const [first, second] = paints
  if (first === undefined) return null
  const maskOf = (isIn: (p: Paint | undefined) => boolean) => quad.reduce((mask, p, i) => (isIn(p) ? mask + (BITS[i] ?? 0) : mask), 0)
  const covered = maskOf(p => p !== undefined)
  // Duas cores cobrindo a célula inteira: uma desenha o bloco, a outra é o fundo.
  if (paints.length === 2 && second !== undefined && covered === FULL)
    return { text: QUADRANTS[maskOf(p => p === first)] ?? ' ', ...styleOf(first), bg: styleOf(second).color }
  // Uma cor, ou um caso que a célula não comporta: o desenho todo na cor que mais aparece ali.
  const countOf = (paint: Paint) => quad.filter(p => p === paint).length
  const dominant = paints.reduce((best, p) => (countOf(p) > countOf(best) ? p : best), first)
  return { text: QUADRANTS[covered] ?? ' ', ...styleOf(dominant) }
}

/**
 * Um desenho posto em (`left`, `top`), em subpixels. É opaco no retângulo que ocupa, com um subpixel
 * de margem de cada lado: o que passa atrás fica escondido, sem as cores se misturarem na borda.
 */
export const spriteLayer = (bitmap: Bitmap, left: number, top: number, paint: Paint): Layer => (x, y) => {
  const row = bitmap[y - top]
  const col = x - left
  if (row === undefined || col < -1 || col > row.length) return undefined
  return row[col] === '#' ? paint : null
}

/** A chave de um subpixel numa camada de pontos; `undefined` fora da área. */
export const dotKey = (x: number, y: number) => (x >= 0 && x < DOT_STRIDE && y >= 0 ? y * DOT_STRIDE + x : undefined)

/** Uma camada de pontos soltos (tijolos, faíscas): cada entrada é a chave de um subpixel e a tinta dele. */
export const dotsLayer = (dots: readonly (readonly [number | undefined, Paint])[]): Layer => {
  const byKey = new Map(dots.filter((d): d is readonly [number, Paint] => d[0] !== undefined))
  return (x, y) => byKey.get(y * DOT_STRIDE + x)
}

/** Células de largura de um tijolo. */
export const BRICK_CELLS = 2

/** Um tijolo: duas células de largura, meia linha de altura (quatro subpixels lado a lado). */
export const brick = (cell: number, y: number, paint: Paint): (readonly [number | undefined, Paint])[] =>
  Array.from({ length: BRICK_CELLS * 2 }, (_, i) => [dotKey(cell * 2 + i, y), paint] as const)

export type RowInput = {
  /** As camadas de subpixels, da frente para o fundo. */
  layers: readonly Layer[]
  /** A linha de células a desenhar. */
  row: number
  width: number
  /** Texto por cima de tudo, por célula (um balão, um placar). */
  over: (cell: number) => Part | undefined
  /** O que aparece numa célula sem nada pintado (o chão, uma estrela). */
  under: (cell: number) => Part | undefined
}

/** Puro: uma linha de células já resolvida em trechos, sem o branco do fim. */
export const rasterRow = ({ layers, row, width, over, under }: RowInput): Part[] => {
  const y = row * 2
  const cells = Array.from({ length: width }, (_, cell): Part => {
    const x = cell * 2
    return (
      over(cell) ??
      cellOf([pixelAt(layers, x, y), pixelAt(layers, x + 1, y), pixelAt(layers, x, y + 1), pixelAt(layers, x + 1, y + 1)]) ??
      under(cell) ?? { text: ' ' }
    )
  })
  const runs = merge(cells)
  const last = runs[runs.length - 1]
  return last && !last.text.trim() && last.bg === undefined ? runs.slice(0, -1) : runs
}
