import { box } from './canvas'
import type { Frame, Shape } from './canvas'
import { fromBase64, toBase64 } from './png'

// Um quadro de pixels virando células de terminal. Cada célula mostra duas cores: a do bloco desenhado
// (▁▂▃▄▅▆▇ de baixo para cima, ▏▎▍▌▋▊▉ da esquerda para a direita, as metades, os oitavos de cima e da
// direita, os quadrantes) e a do fundo. Para cada célula, o bloco e as cores que menos se afastam dos
// pixels dela: uma borda cai em qualquer oitavo da célula, em vez de só na metade.
//
// O fundo do terminal não é uma cor que se possa pintar: onde não há tinta, fica o fundo da célula
// (a cor do terminal), e o desenho tem de ser o bloco. Por isso, sobre o vazio, uma borda esquerda ou
// de baixo só tem a metade e o oitavo; entre duas cores opacas, qualquer borda serve.

/** A cor do próprio terminal, de primeiro plano ou de fundo: o bit 24 sozinho, como o `Raster` a quer. */
export const DEFAULT_COLOR = 0x01000000

/** Uma célula: o caractere, a cor dele e a do fundo (0xRRGGBB, ou `DEFAULT_COLOR`). */
export type Cell = { code: number; fg: number; bg: number }

const SPACE = 0x20
export const BLANK: Cell = { code: SPACE, fg: DEFAULT_COLOR, bg: DEFAULT_COLOR }

const GRID = 8 // cada célula é lida como 8×8 amostras: os oitavos que os blocos desenham
const HALF = GRID / 2
const SIDE = GRID + 1 // a tabela de somas tem uma linha e uma coluna a mais, de zeros
const CHANNELS = 4
const OPAQUE = 255
const SEEN = 0.02 // a opacidade a partir da qual uma amostra tem tinta
const TIE = 1e-6 // dois ajustes mais próximos que isso valem o mesmo: fica o primeiro

/** Um pedaço de um bloco, em oitavos da célula: de onde, e quanto. */
type Area = readonly [x: number, y: number, w: number, h: number]
/** Um bloco: o caractere e a parte da célula que ele pinta. */
export type Glyph = { code: number; areas: readonly Area[] }

const QUARTERS: readonly Area[] = [[0, 0, HALF, HALF], [HALF, 0, HALF, HALF], [0, HALF, HALF, HALF], [HALF, HALF, HALF, HALF]]
const EIGHTHS = [1, 2, 3, 4, 5, 6, 7]
const quarters = (code: number, ...which: number[]): Glyph => ({ code, areas: which.flatMap(i => (QUARTERS[i] ? [QUARTERS[i]] : [])) })

/** Os blocos que o ajuste conhece, na ordem em que vencem um empate. */
export const GLYPHS: readonly Glyph[] = [
  { code: 0x2580, areas: [[0, 0, GRID, HALF]] }, // ▀
  { code: 0x2590, areas: [[HALF, 0, HALF, GRID]] }, // ▐
  ...EIGHTHS.map((k): Glyph => ({ code: 0x2580 + k, areas: [[0, GRID - k, GRID, k]] })), // ▁▂▃▄▅▆▇
  ...EIGHTHS.map((k): Glyph => ({ code: 0x2590 - k, areas: [[0, 0, k, GRID]] })), // ▏▎▍▌▋▊▉
  { code: 0x2594, areas: [[0, 0, GRID, 1]] }, // ▔
  { code: 0x2595, areas: [[GRID - 1, 0, 1, GRID]] }, // ▕
  quarters(0x2596, 2), quarters(0x2597, 3), quarters(0x2598, 0), quarters(0x2599, 0, 2, 3), quarters(0x259a, 0, 3), // ▖▗▘▙▚
  quarters(0x259b, 0, 1, 2), quarters(0x259c, 0, 1, 3), quarters(0x259d, 1), quarters(0x259e, 1, 2), quarters(0x259f, 1, 2, 3), // ▛▜▝▞▟
]
const GLYPH_BY_CODE = new Map(GLYPHS.map(g => [g.code, g]))

// O que se soma de uma região da célula: quantas amostras, a cor que ela deveria mostrar (já sobre o
// fundo suposto) e o quadrado dela, a cor da tinta pesada pela opacidade, a opacidade, e quantas têm tinta.
const N = 0, TR = 1, TG = 2, TB = 3, T2 = 4, WR = 5, WG = 6, WB = 7, WA = 8, COV = 9
const FIELDS = 10
type Sums = Float64Array
type Rgb = readonly [number, number, number]

const rgbOf = (color: number): Rgb => [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff]
const packed = ([r, g, b]: Rgb) => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
const field = (sums: Sums, i: number) => sums[i] ?? 0

// A cor que uma região mostra se pintada de uma cor só: a da tinta dela, na força da opacidade dela,
// sobre o fundo suposto. Uma borda (tinta opaca ao lado do vazio) fica com a cor pura; um clarão
// translúcido, com a mistura. `null` quando a região não tem tinta.
const colorOf = (sums: Sums, backdrop: Rgb): Rgb | null => {
  const seen = field(sums, COV)
  const weight = field(sums, WA)
  if (seen < 0.5 || weight <= 0) return null
  const strength = Math.min(1, weight / seen)
  const mixed = (ink: number, under: number) => Math.round(under + (ink / weight - under) * strength)
  return [mixed(field(sums, WR), backdrop[0]), mixed(field(sums, WG), backdrop[1]), mixed(field(sums, WB), backdrop[2])]
}

// Quanto uma região se afasta de uma cor: a soma dos quadrados das diferenças, amostra a amostra.
const costOf = (sums: Sums, [r, g, b]: Rgb) =>
  Math.max(0, field(sums, T2) - 2 * (r * field(sums, TR) + g * field(sums, TG) + b * field(sums, TB)) + field(sums, N) * (r * r + g * g + b * b))

/** Uma célula lida: a tabela de somas, e a cor mostrada e a opacidade de cada amostra. */
type Reading = { table: Float64Array; shown: Float64Array; opacity: Float64Array }

// As amostras de uma célula somadas de modo que qualquer retângulo delas saia em quatro leituras.
// A leitura nasce e é preenchida aqui; quem a recebe só lê.
const tableOf = (frame: Frame, left: number, top: number, cellW: number, cellH: number, backdrop: Rgb): Reading | null => {
  const table = new Float64Array(SIDE * SIDE * FIELDS)
  const shown = new Float64Array(GRID * GRID * 3)
  const opacity = new Float64Array(GRID * GRID)
  let ink = 0
  for (let sy = 0; sy < GRID; sy++) {
    const y0 = top + Math.floor((sy * cellH) / GRID)
    const y1 = Math.max(y0 + 1, top + Math.floor(((sy + 1) * cellH) / GRID))
    for (let sx = 0; sx < GRID; sx++) {
      const x0 = left + Math.floor((sx * cellW) / GRID)
      const x1 = Math.max(x0 + 1, left + Math.floor(((sx + 1) * cellW) / GRID))
      let r = 0, g = 0, b = 0, a = 0, count = 0
      for (let y = y0; y < y1 && y < frame.height; y++) {
        for (let x = x0; x < x1 && x < frame.width; x++) {
          const i = (y * frame.width + x) * CHANNELS
          const alpha = (frame.data[i + 3] ?? 0) / OPAQUE
          r += (frame.data[i] ?? 0) * alpha
          g += (frame.data[i + 1] ?? 0) * alpha
          b += (frame.data[i + 2] ?? 0) * alpha
          a += alpha
          count += 1
        }
      }
      const strength = count > 0 ? a / count : 0
      // a cor da tinta da amostra, e a que ela mostra sobre o fundo suposto
      const inkR = a > 0 ? r / a : 0
      const inkG = a > 0 ? g / a : 0
      const inkB = a > 0 ? b / a : 0
      const seenR = backdrop[0] + (inkR - backdrop[0]) * strength
      const seenG = backdrop[1] + (inkG - backdrop[1]) * strength
      const seenB = backdrop[2] + (inkB - backdrop[2]) * strength
      const index = sy * GRID + sx
      shown[index * 3] = seenR
      shown[index * 3 + 1] = seenG
      shown[index * 3 + 2] = seenB
      opacity[index] = strength
      ink += strength
      const at = ((sy + 1) * SIDE + sx + 1) * FIELDS
      const up = (sy * SIDE + sx + 1) * FIELDS
      const back = ((sy + 1) * SIDE + sx) * FIELDS
      const corner = (sy * SIDE + sx) * FIELDS
      // cada campo: o da amostra, mais o que está acima e atrás, menos o canto contado duas vezes
      table[at + N] = 1 + (table[up + N] ?? 0) + (table[back + N] ?? 0) - (table[corner + N] ?? 0)
      table[at + TR] = seenR + (table[up + TR] ?? 0) + (table[back + TR] ?? 0) - (table[corner + TR] ?? 0)
      table[at + TG] = seenG + (table[up + TG] ?? 0) + (table[back + TG] ?? 0) - (table[corner + TG] ?? 0)
      table[at + TB] = seenB + (table[up + TB] ?? 0) + (table[back + TB] ?? 0) - (table[corner + TB] ?? 0)
      table[at + T2] = seenR * seenR + seenG * seenG + seenB * seenB + (table[up + T2] ?? 0) + (table[back + T2] ?? 0) - (table[corner + T2] ?? 0)
      table[at + WR] = inkR * strength + (table[up + WR] ?? 0) + (table[back + WR] ?? 0) - (table[corner + WR] ?? 0)
      table[at + WG] = inkG * strength + (table[up + WG] ?? 0) + (table[back + WG] ?? 0) - (table[corner + WG] ?? 0)
      table[at + WB] = inkB * strength + (table[up + WB] ?? 0) + (table[back + WB] ?? 0) - (table[corner + WB] ?? 0)
      table[at + WA] = strength + (table[up + WA] ?? 0) + (table[back + WA] ?? 0) - (table[corner + WA] ?? 0)
      table[at + COV] = (strength > SEEN ? 1 : 0) + (table[up + COV] ?? 0) + (table[back + COV] ?? 0) - (table[corner + COV] ?? 0)
    }
  }
  return ink > 0 ? { table, shown, opacity } : null
}

// A soma de umas áreas da célula: cada retângulo sai de quatro cantos da tabela.
const sumOf = (table: Float64Array, areas: readonly Area[]): Sums => {
  const sums = new Float64Array(FIELDS)
  for (const [x, y, w, h] of areas) {
    const far = ((y + h) * SIDE + x + w) * FIELDS
    const above = (y * SIDE + x + w) * FIELDS
    const behind = ((y + h) * SIDE + x) * FIELDS
    const corner = (y * SIDE + x) * FIELDS
    for (let f = 0; f < FIELDS; f++) sums[f] = (sums[f] ?? 0) + (table[far + f] ?? 0) - (table[above + f] ?? 0) - (table[behind + f] ?? 0) + (table[corner + f] ?? 0)
  }
  return sums
}

// O que sobra de uma soma tirando outra: o resto da célula, fora da região de um bloco.
const restOf = (whole: Sums, part: Sums): Sums => {
  const rest = new Float64Array(FIELDS)
  for (let f = 0; f < FIELDS; f++) rest[f] = (whole[f] ?? 0) - (part[f] ?? 0)
  return rest
}

const WHOLE: readonly Area[] = [[0, 0, GRID, GRID]]

type Pick = Cell & { cost: number; areas: readonly Area[] }

// O fundo de uma célula para uma região: a cor do terminal, ou a cor da tinta dela: o que errar menos.
const groundOf = (sums: Sums, backdrop: Rgb): { bg: number; cost: number } => {
  const bare = costOf(sums, backdrop)
  const color = colorOf(sums, backdrop)
  const solid = color ? costOf(sums, color) : Infinity
  return color && solid < bare - TIE ? { bg: packed(color), cost: solid } : { bg: DEFAULT_COLOR, cost: bare }
}

// A célula que um bloco daria: ele pinta a região dele com a tinta dela; o resto é fundo. Sem tinta
// na região do bloco não há o que ele pintar: `null`.
const pickOf = (glyph: Glyph, table: Float64Array, whole: Sums, backdrop: Rgb): Pick | null => {
  const front = sumOf(table, glyph.areas)
  const color = colorOf(front, backdrop)
  if (!color) return null
  const ground = groundOf(restOf(whole, front), backdrop)
  return { code: glyph.code, fg: packed(color), bg: ground.bg, cost: costOf(front, color) + ground.cost, areas: glyph.areas }
}

const isInside = (areas: readonly Area[], sx: number, sy: number) => areas.some(([x, y, w, h]) => sx >= x && sx < x + w && sy >= y && sy < y + h)

// A cor de uma região acertada para uma cor que existe nela: a da amostra mais próxima da média. Onde
// duas tintas dividem a região fica a que mais pesa, e não uma mistura que o desenho não tem.
const settled = (color: number, { shown, opacity }: Reading, isMine: (sx: number, sy: number) => boolean): number => {
  if (color === DEFAULT_COLOR) return color
  const [r, g, b] = rgbOf(color)
  let best = color
  let nearest = Infinity
  for (let i = 0; i < GRID * GRID; i++) {
    if ((opacity[i] ?? 0) <= SEEN || !isMine(i % GRID, Math.floor(i / GRID))) continue
    const sr = shown[i * 3] ?? 0
    const sg = shown[i * 3 + 1] ?? 0
    const sb = shown[i * 3 + 2] ?? 0
    const distance = (sr - r) ** 2 + (sg - g) ** 2 + (sb - b) ** 2
    if (distance < nearest - TIE) {
      nearest = distance
      best = packed([sr, sg, sb])
    }
  }
  return best
}

// Uma célula cujos pixels são todos iguais dispensa o ajuste: vazia, fica em branco; de uma tinta só,
// é um espaço com essa cor de fundo. `null` quando há mais de uma tinta nela. É o caso da maioria.
const flatOf = (frame: Frame, left: number, top: number, cellW: number, cellH: number, backdrop: Rgb): Cell | null => {
  const { data, width } = frame
  const first = (top * width + left) * CHANNELS
  const r = data[first] ?? 0
  const g = data[first + 1] ?? 0
  const b = data[first + 2] ?? 0
  const a = data[first + 3] ?? 0
  for (let y = top; y < top + cellH; y++) {
    for (let i = (y * width + left) * CHANNELS, end = i + cellW * CHANNELS; i < end; i += CHANNELS) {
      if (data[i + 3] !== a || (a > 0 && (data[i] !== r || data[i + 1] !== g || data[i + 2] !== b))) return null
    }
  }
  const strength = a / OPAQUE
  if (strength <= SEEN) return BLANK
  return { code: SPACE, fg: DEFAULT_COLOR, bg: packed([backdrop[0] + (r - backdrop[0]) * strength, backdrop[1] + (g - backdrop[1]) * strength, backdrop[2] + (b - backdrop[2]) * strength]) }
}

const cellOf = (frame: Frame, left: number, top: number, cellW: number, cellH: number, backdrop: Rgb): Cell => {
  const flat = flatOf(frame, left, top, cellW, cellH, backdrop)
  if (flat) return flat
  const reading = tableOf(frame, left, top, cellW, cellH, backdrop)
  if (!reading) return BLANK
  const whole = sumOf(reading.table, WHOLE)
  const plain: Pick = { code: SPACE, fg: DEFAULT_COLOR, ...groundOf(whole, backdrop), areas: [] }
  const { code, fg, bg, areas } = GLYPHS.reduce<Pick>((best, glyph) => {
    const pick = pickOf(glyph, reading.table, whole, backdrop)
    return pick && pick.cost < best.cost - TIE ? pick : best
  }, plain)
  return {
    code,
    fg: settled(fg, reading, (sx, sy) => isInside(areas, sx, sy)),
    bg: settled(bg, reading, (sx, sy) => !isInside(areas, sx, sy)),
  }
}

const countOf = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)

/**
 * Puro: o quadro lido como `columns` por `rows` células, linha a linha. `backdrop` é o fundo que se
 * supõe atrás do palco (0xRRGGBB): com ele a tinta translúcida vira uma cor de verdade.
 */
export const fitCells = (frame: Frame, columns: number, rows: number, backdrop: number): Cell[] => {
  const across = countOf(columns)
  const down = countOf(rows)
  const cellW = Math.floor(frame.width / Math.max(1, across))
  const cellH = Math.floor(frame.height / Math.max(1, down))
  if (cellW < 1 || cellH < 1) return Array.from({ length: across * down }, () => BLANK)
  const under = rgbOf(backdrop)
  return Array.from({ length: across * down }, (_, i) => cellOf(frame, (i % across) * cellW, Math.floor(i / across) * cellH, cellW, cellH, under))
}

/**
 * Puro: as células de volta em retângulos, como um terminal as pintaria: o fundo, e por cima a parte
 * que o bloco desenha. Serve para conferir um ajuste; de uma célula de texto só o fundo aparece.
 */
export const cellShapes = (cells: readonly Cell[], columns: number, cellW: number, cellH: number): Shape[] =>
  cells.flatMap((cell, i): Shape[] => {
    const left = (i % Math.max(1, columns)) * cellW
    const top = Math.floor(i / Math.max(1, columns)) * cellH
    const areas = cell.fg === DEFAULT_COLOR ? [] : (GLYPH_BY_CODE.get(cell.code)?.areas ?? [])
    return [
      ...(cell.bg === DEFAULT_COLOR ? [] : [box(left, top, cellW, cellH, cell.bg)]),
      ...areas.map(([x, y, w, h]) => box(left + (x * cellW) / GRID, top + (y * cellH) / GRID, (w * cellW) / GRID, (h * cellH) / GRID, cell.fg)),
    ]
  })

const HALF_CELL = (GRID * GRID) / 2

/**
 * A cor que mais aparece numa célula, para servir de fundo a um texto posto sobre ela: a do bloco
 * quando ele cobre a metade da célula ou mais, senão a do fundo.
 */
export const groundColor = (cell: Cell): number => {
  const covered = (GLYPH_BY_CODE.get(cell.code)?.areas ?? []).reduce((n, [, , w, h]) => n + w * h, 0)
  return covered >= HALF_CELL && cell.fg !== DEFAULT_COLOR ? cell.fg : cell.bg
}

const BYTES_PER_CELL = 12

/** Puro: as células como o `Raster` as quer: três números de 32 bits cada (caractere, frente, fundo), em base64. */
export const packCells = (cells: readonly Cell[]): string => {
  const bytes = new Uint8Array(cells.length * BYTES_PER_CELL)
  const view = new DataView(bytes.buffer)
  cells.forEach((cell, i) => {
    view.setUint32(i * BYTES_PER_CELL, cell.code >>> 0, true)
    view.setUint32(i * BYTES_PER_CELL + 4, cell.fg >>> 0, true)
    view.setUint32(i * BYTES_PER_CELL + 8, cell.bg >>> 0, true)
  })
  return toBase64(bytes)
}

/** Puro: o caminho de volta de `packCells`, para conferir o que foi para o terminal. */
export const unpackCells = (packed: string): Cell[] => {
  const bytes = fromBase64(packed)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Array.from({ length: Math.floor(bytes.length / BYTES_PER_CELL) }, (_, i) => ({
    code: view.getUint32(i * BYTES_PER_CELL, true),
    fg: view.getUint32(i * BYTES_PER_CELL + 4, true),
    bg: view.getUint32(i * BYTES_PER_CELL + 8, true),
  }))
}
