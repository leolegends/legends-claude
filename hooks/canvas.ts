// O quadro de pixels do palco em alta resolução. A cena é uma lista de retângulos de tinta, do fundo
// para a frente; daqui sai o quadro pronto (RGBA), que vira imagem, blocos de terminal ou SVG.
// Tudo puro: a lista não é tocada, e cada chamada devolve um quadro novo.

/** Um retângulo de tinta: posição e tamanho em pixels do quadro, a cor (0xRRGGBB) e a opacidade (0 a 1). */
export type Shape = { x: number; y: number; w: number; h: number; rgb: number; a: number }

/** Um quadro pronto: RGBA sem pré-multiplicar, 4 bytes por pixel, linha a linha. */
export type Frame = { width: number; height: number; data: Uint8ClampedArray }

/** A tinta de uma marca de um desenho: a cor e, se não for opaca, a opacidade. */
export type Ink = { rgb: number; a?: number }

/** Onde um desenho em marcas fica no quadro, e o tamanho de cada marca em pixels. */
export type Grid = { left: number; top: number; cellW: number; cellH: number }

const CHANNELS = 4
const OPAQUE = 255

export const box = (x: number, y: number, w: number, h: number, rgb: number, a = 1): Shape => ({ x, y, w, h, rgb, a })

const sizeOf = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)
const isSameInk = (a: Ink | null, b: Ink | null) => a !== null && b !== null && a.rgb === b.rgb && (a.a ?? 1) === (b.a ?? 1)

/**
 * Puro: um desenho em marcas (uma string por linha) virando retângulos. `inkOf` diz a tinta de cada
 * marca (`null` para vazio); marcas vizinhas de mesma tinta, na mesma linha, saem num retângulo só.
 */
export const bitmapShapes = (rows: readonly string[], { left, top, cellW, cellH }: Grid, inkOf: (mark: string, col: number, row: number) => Ink | null): Shape[] =>
  rows.flatMap((marks, row) => {
    const inks = [...marks].map((mark, col) => inkOf(mark, col, row))
    return inks.flatMap((ink, col): Shape[] => {
      if (ink === null || isSameInk(inks[col - 1] ?? null, ink)) return []
      const run = inks.slice(col).findIndex(next => !isSameInk(next, ink))
      const length = run < 0 ? inks.length - col : run
      return [box(left + col * cellW, top + row * cellH, length * cellW, cellH, ink.rgb, ink.a ?? 1)]
    })
  })

// Um retângulo sobre o que já está no quadro. `data` é o quadro em construção, só de `rasterize`.
const fill = (data: Uint8ClampedArray, width: number, height: number, { x, y, w, h, rgb, a }: Shape) => {
  if (!(Number.isFinite(x + y + w + h) && a > 0)) return
  const x0 = Math.max(0, Math.round(x))
  const x1 = Math.min(width, Math.round(x + w))
  const y0 = Math.max(0, Math.round(y))
  const y1 = Math.min(height, Math.round(y + h))
  const r = (rgb >> 16) & 0xff
  const g = (rgb >> 8) & 0xff
  const b = rgb & 0xff
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * width + px) * CHANNELS
      const under = (data[i + 3] ?? 0) / OPAQUE
      if (a >= 1 || under === 0) {
        data[i] = r
        data[i + 1] = g
        data[i + 2] = b
        data[i + 3] = Math.round(Math.min(1, a) * OPAQUE)
        continue
      }
      // "por cima": a tinta nova na frente, o que havia atrás aparecendo pelo que ela deixa passar
      const kept = under * (1 - a)
      const out = a + kept
      data[i] = Math.round((r * a + (data[i] ?? 0) * kept) / out)
      data[i + 1] = Math.round((g * a + (data[i + 1] ?? 0) * kept) / out)
      data[i + 2] = Math.round((b * a + (data[i + 2] ?? 0) * kept) / out)
      data[i + 3] = Math.round(out * OPAQUE)
    }
  }
}

/** Puro: os retângulos pintados num quadro novo, na ordem dada (o último fica na frente). */
export const rasterize = (shapes: readonly Shape[], width: number, height: number): Frame => {
  const w = sizeOf(width)
  const h = sizeOf(height)
  // o único lugar em que algo é alterado: um quadro que nasce aqui e só sai daqui pronto
  const data = new Uint8ClampedArray(w * h * CHANNELS)
  for (const shape of shapes) fill(data, w, h, shape)
  return { width: w, height: h, data }
}
