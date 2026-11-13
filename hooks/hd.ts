import { bodyShade, eyesOf, isPainted, sheenOf } from './aura'
import type { Sheen } from './aura'
import { artOf } from './avatars'
import { bitmapShapes, box } from './canvas'
import type { Shape } from './canvas'
import { blend, rgbOf } from './color'
import { BRICK_SUBS, beltShapes, brickShapes, floorShapes, outlined, shoutIcon, snoreIcon, starShapes, thinkSpark, toolIcon, verdictIcon } from './hd-art'
import { boltShapes, fireworkShapes, haloShapes, jetShapes, moteShapes, streakShapes } from './hd-aura'
import type { Body, Light, Unit } from './hd-aura'
import { KIND_PAINT, kindOf } from './palette'
import type { Kind } from './palette'
import type { Part } from './parts'
import { EYE } from './pixels'
import type { Bitmap } from './pixels'
import { poseOf } from './pose'
import type { Pose } from './pose'
import { PLAIN } from './power'
import type { Power } from './power'
import { SCENE_ROWS, anchorsOf, backdropAt, cornerLabels, markLabels, scenePower, starAt, visibleWall } from './scene'
import type { Label } from './scene'
import { BELT_SPEED, FLOOR_Y, LOAD_LAYERS, MAIN, PILE_COLS, PILE_ROWS, WALL_ROWS, partyAge, wallFront } from './sim'
import type { Geo, Sim, Worker } from './sim'
import { CLAWD, FINE_X, FINE_Y, detailDrawing, drawing } from './sprites'
import type { Art } from './sprites'
import type { StatusAvatar as Avatar } from '../types'

// O palco em alta resolução: a mesma cena do palco de texto, do mesmo estado da simulação, desenhada
// em pixels (8 de largura por 16 de altura para cada célula do terminal) em vez de quadrantes de
// célula. Sai uma lista de retângulos de tinta, do fundo para a frente, que vira imagem, SVG ou blocos.
//
// A cena é desenhada entre dois quadros da simulação: `prev` é o estado mostrado e `cur` o seguinte;
// `alpha` (0 a 1) diz quanto do caminho já foi. Os bichos deslizam de onde estavam para onde vão, os
// tijolos correm na esteira e as faíscas voam, em vez de pular de um quadro para o outro.

/** Pixels de uma célula do terminal no quadro: a largura e a altura. */
export const CELL_W = 8
export const CELL_H = 16
const SUB_W = CELL_W / 2 // um subpixel do palco de texto: meia célula…
const SUB_H = CELL_H / 2 // …por meia linha
const ROLLER_GAP = 4 // células entre dois roletes da esteira
const BRICK_CELLS = 2
const FLASH_FRAMES = 2 // quadros que o tijolo recém-chegado ao mosaico leva apagando
const DIMMED = 0.5 // quanto um bicho que falhou esmaece para o fundo
const SHADE = 0.22 // quanto o topo do corpo clareia e a base escurece, no traço com relevo
const SPARK_SIZE = 0.75 // o lado de uma faísca no traço livre, em subpixels
const SHEEN_SLICE = 2 // a altura de cada fatia da faixa de brilho, em pixels: o degrau da inclinação dela
const SHEEN_ALPHA = 0.85
const FINE_SHEEN_ALPHA = 0.3 // sobre um desenho fino a faixa é mais leve: o avatar segue aparecendo por baixo dela
const SIGN_LIFT = 0.3 // quanto a faísca e o grito clareiam a cor de destaque, para saltarem da aura
const NIGHT = 0x0b0b10 // o fundo de um terminal escuro, aproximado
const DAY = 0xffffff
const GRAIN = { x: CELL_W / 2, y: CELL_H / 2 } // o grão do traço em blocos: meia célula por meia célula

/** O tamanho do palco: 1 é o de sempre (quatro linhas); 2, o dobro, com o mundo na metade da largura. */
export type Zoom = 1 | 2

/**
 * Como a cena é traçada. `pixels`: posições livres, relevo, ícones, chão e estrelas em pixels, para
 * quem desenha pixels de verdade. `blocks`: tudo na grade de meia célula e os sinais como texto, o que
 * cabe em blocos de terminal; no tamanho dobrado os blocos já mostram o relevo e a linha do chão.
 */
export type Trace = 'pixels' | 'blocks'

export type HdInput = {
  /** O estado mostrado e o seguinte; iguais quando não há para onde ir. */
  prev: Sim
  cur: Sim
  /** Quanto do caminho de `prev` a `cur` já foi, de 0 a 1. */
  alpha: number
  /** As medidas do mundo: no tamanho dobrado, as de uma barra com a metade das colunas. */
  geo: Geo
  /** O placar do canto, para quem desenha em células. */
  hud: readonly Part[]
  powers?: ReadonlyMap<string, Power>
  isLight?: boolean
  /** A cor de destaque dos ajustes: a do mascote. Uma cor do tema ou hex. */
  accent?: string
  /** O avatar do mascote; sem ele, o Clawd. */
  avatar?: Avatar
  trace: Trace
  zoom?: Zoom
}

export type HdScene = {
  /** O tamanho do palco, e as medidas dele em células do terminal e em pixels do quadro. */
  zoom: Zoom
  columns: number
  rows: number
  width: number
  height: number
  /** Os retângulos de tinta, do fundo para a frente. */
  shapes: Shape[]
  /** Os textos da cena (sinais dos bichos, placar), para quem desenha em células. */
  labels: Label[]
  /** O que aparece numa célula sem nada pintado (o chão, uma estrela), para quem desenha em células. */
  under: (cell: number, row: number) => Part | undefined
}

/** O fundo que se supõe atrás do palco, para misturar a tinta translúcida: escuro ou claro, pelo tema. */
export const backdropRgb = (isLight: boolean) => (isLight ? DAY : NIGHT)

const lerp = (from: number, to: number, t: number) => from + (to - from) * t
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)
const snap = (px: number, step: number) => Math.round(px / step) * step

/** O que a cena inteira sabe: o instante, o tema, as medidas e o jeito do traço. */
type View = Light & {
  accent: string
  alpha: number
  zoom: Zoom
  /** O desenho do mascote: o avatar escolhido nos ajustes. */
  mascot: Art
  unit: Unit
  /** Uma célula do mundo, em pixels: no tamanho dobrado, duas células do terminal. */
  cell: { w: number; h: number }
  /** Posições livres: os bichos param em qualquer pixel. Sem isso, na grade de meia célula. */
  isFree: boolean
  /** Relevo nos tijolos, volume no corpo, a faixa de brilho inclinada, a linha do chão em pixels. */
  hasDetail: boolean
}

// Uma posição do desenho (em subpixels, ou em sublinhas) posta onde o traço permite: livre em pixels,
// na grade de meia célula em blocos.
const placed = (value: number, unit: number, grain: number, view: View) => (view.isFree ? value : snap(value * unit, grain) / unit)

// A cor de uma tinta do palco: `claude` é a cor de destaque dos ajustes.
const toneOf = (paint: string, view: View) => rgbOf(paint === 'claude' ? view.accent : paint, view.isLight)

/** Um bicho num quadro: o que ele põe atrás de tudo, o corpo, o que solta na frente, e os sinais. */
type Cast = { glow: Shape[]; body: Shape[]; tiles: Shape[]; fore: Shape[]; signs: Shape[]; labels: Label[] }
const NO_CAST: Cast = { glow: [], body: [], tiles: [], fore: [], signs: [], labels: [] }

// No traço com relevo o topo do corpo clareia e a base (a linha acima das patas) escurece: um pouco de volume.
const volumeShapes = (rows: Bitmap, left: number, top: number, rgb: number, isSitting: boolean, { u, v }: Unit): Shape[] => {
  const edge = Math.max(1, Math.round(u / 2))
  const base = rows.length - (isSitting ? 1 : 2)
  const strip = (row: number, y: number, tone: number) =>
    bitmapShapes([rows[row] ?? ''], { left, top: y, cellW: u, cellH: edge }, mark => (mark === '#' ? { rgb: tone } : null))
  return [
    ...strip(0, top, blend(rgb, DAY, SHADE)),
    ...(base > 0 ? strip(base, top + (base + 1) * v - edge, blend(rgb, 0x000000, SHADE)) : []),
  ]
}

// Os trechos pintados de uma linha do desenho (só o corpo: os olhos acesos ficam de fora), em marcas.
const isBody = (mark: string | undefined) => isPainted(mark) && mark !== EYE
const runsOf = (marks: string): (readonly [from: number, to: number])[] =>
  [...marks].flatMap((mark, col): (readonly [number, number])[] => {
    if (!isBody(mark) || isBody(marks[col - 1])) return []
    const end = [...marks].findIndex((next, i) => i > col && !isBody(next))
    return [[col, end < 0 ? marks.length : end]]
  })

// A faixa de brilho no traço com relevo: a mesma do palco de texto, mas inclinada de verdade e cortada
// no corpo, em fatias finas, em vez de pintar células inteiras. `dot` é o tamanho de uma marca de
// `rows`, em pixels: um subpixel no desenho comum, um ponto no desenho fino.
const sheenShapes = (rows: Bitmap, left: number, top: number, sheen: Sheen, view: View, dot: Unit, alpha: number): Shape[] => {
  const { unit: { u }, cell, zoom } = view
  const slice = Math.min(dot.v, SHEEN_SLICE * zoom)
  return rows.flatMap((marks, row) => {
    const runs = runsOf(marks)
    return Array.from({ length: Math.max(1, Math.round(dot.v / slice)) }).flatMap((_, k): Shape[] => {
      const y = top + row * dot.v + k * slice
      const from = left + (sheen.front - (y + slice / 2) / cell.h) * cell.w
      const to = from + sheen.width * cell.w
      return runs.flatMap(([a, b]): Shape[] => {
        const x0 = Math.max(from, left + a * dot.u)
        const x1 = Math.min(to, left + b * dot.u)
        return x1 - x0 >= 1 ? [box(x0, y, x1 - x0, slice, rgbOf(sheen.paintAt(Math.floor((x0 + x1) / 2 / u)), view.isLight), alpha)] : []
      })
    })
  })
}

// Os sinais de um bicho em pixels: a faísca de quem pensa, o ícone da ferramenta, o grito, o ✓, o ✗, o z.
const signShapes = (pose: Pose, given: Power | undefined, left: number, top: number, view: View): Shape[] => {
  const { mark, art } = pose
  if (!mark) return []
  const { unit } = view
  const dot = Math.max(1, Math.round(unit.u / 4))
  const cx = left + (art.width / 2) * unit.u
  const beside = left + (art.width + 1.5) * unit.u
  const accent = blend(toneOf('claude', view), DAY, SIGN_LIFT)
  switch (mark.kind) {
    case 'shout':
      // com tijolos na cabeça o grito vai para o lado: em cima, ficaria por baixo deles
      return pose.isCarrying ? shoutIcon(beside, top - 4 * dot, unit, accent) : shoutIcon(cx, Math.max(dot, top - 12 * dot), unit, accent)
    case 'cheer':
      return verdictIcon(true, beside, top + 2 * dot, unit, view.isLight)
    case 'fail':
      return verdictIcon(false, beside, top + 2 * dot, unit, view.isLight)
    case 'sleep':
      return snoreIcon(mark.isLoud, cx, top - unit.v * 1.5, unit, toneOf('text', view), view.time)
    case 'tool': {
      const kind = kindOf(mark.tool)
      return toolIcon(kind, cx, Math.max(dot * 2, top - 12 * dot), unit, rgbOf(KIND_PAINT[kind]), view.time)
    }
    case 'think':
      return thinkSpark((given ?? PLAIN).tier, cx, Math.max(8 * dot, top - 8 * dot), unit, accent, view.time)
  }
}

// O sinal de um bicho como texto, nas células do palco: no tamanho dobrado, as posições dobram, e a
// linha é a de baixo de cada par (a mais perto da cabeça).
const signLabels = (pose: Pose, given: Power | undefined, x: number, tick: number, { zoom }: View): Label[] => {
  const at = anchorsOf(Math.round(x), pose.art.width)
  return markLabels(pose.mark, { above: at.above * zoom, beside: at.beside * zoom }, tick, given).map(label => ({ ...label, row: label.row * zoom + zoom - 1 }))
}

// Um bicho entre dois quadros: desenhado como está em `prev`, a caminho de onde `cur` o põe.
const castOf = (w: Worker, prev: Sim, cur: Sim, powers: ReadonlyMap<string, Power> | undefined, view: View): Cast => {
  const given = scenePower(prev, powers, w.id)
  const pose = poseOf(w, prev, given, view.mascot)
  if (pose.isUnseen) return NO_CAST
  const target = cur.workers.find(next => next.id === w.id)
  const after = target ? poseOf(target, cur, scenePower(cur, powers, w.id), view.mascot) : pose
  const { art, power } = pose
  const { unit, unit: { u, v }, isLight } = view
  // Em blocos, o bicho anda na grade de meia célula: fora dela, a borda dele não teria bloco que a desenhe.
  const x = placed(lerp(w.x, target?.x ?? w.x, view.alpha), u, view.grain.x, view)
  const lift = placed(lerp(pose.lift, after.isUnseen ? pose.lift : after.lift, view.alpha), v, view.grain.y, view)
  const stance = { eyes: pose.eyes, isArmsUp: pose.isArmsUp, step: pose.step, isSitting: pose.isSitting }
  const rows = drawing(art, { ...stance, hasLitEyes: eyesOf(power) !== null })
  // Onde há detalhe, um avatar com desenho fino é pintado com ele; o comum segue sendo a silhueta da aura.
  const fine = view.hasDetail ? detailDrawing(art, stance) : null
  const dot: Unit = fine ? { u: u / FINE_X, v: v / FINE_Y } : unit
  const topSub = FLOOR_Y + 1 - rows.length + lift
  const left = x * u
  const top = topSub * v
  const tint = pose.isMain ? view.accent : pose.tint
  const base = rgbOf(tint, isLight)
  const mood = { tick: view.time, isLight }
  const shade = bodyShade(power, { bitmap: rows, left: Math.round(x), top: Math.round(topSub), floor: FLOOR_Y, tint, paints: art.paints, strength: pose.strength }, mood)
  const lit = eyesOf(power)
  // A tinta chapada de uma marca: a cor do bicho, a da paleta dele, ou a dos olhos acesos (nas pupilas).
  const flat = (mark: string) => {
    if (lit && (mark === EYE || mark === art.pupil)) return rgbOf(lit, isLight)
    const own = art.paints?.[mark]
    return own ? rgbOf(own, isLight) : base
  }
  const inkOf = (mark: string, col: number, row: number) => {
    if (!isPainted(mark)) return null
    if (pose.isFailed) return { rgb: blend(flat(mark), backdropRgb(isLight), DIMMED) }
    // com relevo o corpo é chapado (a faixa de brilho vem por cima, inclinada); sem ele, a tinta é a da célula
    if (view.hasDetail) return { rgb: flat(mark) }
    return { rgb: rgbOf(typeof shade === 'string' ? shade : shade(Math.round(x) + col, Math.round(topSub) + row, mark), isLight) }
  }
  const sheen = view.hasDetail && !pose.isFailed ? sheenOf(power, tint, mood) : null
  const body: Body = { rows, left, top, feet: FLOOR_Y * v, unit, power, strength: pose.strength }
  // Os tijolos na cabeça: lado a lado na camada de baixo, e os seguintes empilhados em cima. No palco
  // de blocos do tamanho de sempre ficam na grade das células: dois tijolos não dividem uma célula.
  const perLayer = Math.max(1, Math.floor(art.headWidth / BRICK_SUBS))
  const headSub = view.isFree || view.zoom > 1 ? x + art.headFrom : Math.round((x + art.headFrom) / 2) * 2
  const tiles = [...w.load].slice(0, perLayer * LOAD_LAYERS).flatMap((kind, i) =>
    brickShapes((headSub + (i % perLayer) * BRICK_SUBS) * u, top - (1 + Math.floor(i / perLayer)) * v, unit, rgbOf(KIND_PAINT[kind as Kind] ?? KIND_PAINT.o), view.hasDetail))
  return {
    glow: haloShapes(body, view),
    body: [
      ...bitmapShapes(fine ?? rows, { left, top, cellW: dot.u, cellH: dot.v }, inkOf),
      // o volume é do desenho comum: o fino já traz as próprias cores
      ...(view.hasDetail && !fine && !pose.isFailed ? volumeShapes(rows, left, top, base, pose.isSitting, unit) : []),
      ...(sheen ? sheenShapes(fine ?? rows, left, top, sheen, view, dot, fine ? FINE_SHEEN_ALPHA : SHEEN_ALPHA) : []),
    ],
    tiles,
    fore: [
      ...moteShapes(body, view),
      ...boltShapes(body, view),
      ...(pose.wake === 0 ? [] : streakShapes(body, view, pose.wake)),
      ...(pose.isFlying ? jetShapes(body, view) : []),
    ],
    signs: view.isFree ? outlined(signShapes(pose, given, left, top, view), Math.max(1, Math.round(u / 4)), backdropRgb(isLight)) : [],
    labels: view.isFree ? [] : signLabels(pose, given, x, prev.tick, view),
  }
}

// Os tijolos parados e os da esteira: a pilha à esquerda, o mosaico à direita, e os que estão a caminho.
const brickwork = (prev: Sim, geo: Geo, wall: string, view: View): Shape[] => {
  const { unit, cell } = view
  const paintOf = (kind: string) => rgbOf(KIND_PAINT[kind as Kind] ?? KIND_PAINT.o)
  const lit = toneOf('text', view)
  const pile = prev.workers.map(w => w.queue).join('').slice(0, PILE_COLS * PILE_ROWS)
  const front = wallFront(wall, geo)
  // o tijolo recém-chegado acende e, no traço com relevo, apaga aos poucos
  const flash = view.hasDetail ? clamp01((prev.flash - view.alpha) / FLASH_FRAMES) : prev.flash > 0 ? 1 : 0
  return [
    ...[...pile].flatMap((kind, i) => brickShapes(Math.floor(i / PILE_ROWS) * BRICK_CELLS * cell.w, (FLOOR_Y - (i % PILE_ROWS)) * unit.v, unit, paintOf(kind), view.hasDetail)),
    ...prev.belt.flatMap(b => {
      // corre até encostar na frente do mosaico; em blocos, na grade de meia célula
      const at = Math.min(b.x + BELT_SPEED * view.alpha, front - BRICK_CELLS) * cell.w
      return brickShapes(view.isFree ? at : snap(at, view.grain.x), FLOOR_Y * unit.v, unit, paintOf(b.kind), view.hasDetail)
    }),
    ...[...wall].flatMap((kind, i) => {
      // fiadas alternadas, como numa parede: as ímpares começam uma célula antes
      const column = geo.wallRight - 1 - Math.floor(i / WALL_ROWS) * BRICK_CELLS - ((i % WALL_ROWS) % 2)
      const rgb = i === wall.length - 1 && flash > 0 ? blend(paintOf(kind), lit, flash) : paintOf(kind)
      return brickShapes(column * cell.w, (FLOOR_Y - (i % WALL_ROWS)) * unit.v, unit, rgb, view.hasDetail)
    }),
  ]
}

// As faíscas da simulação (a nuvem de um ajudante, o confete) seguindo o próprio voo até o quadro seguinte.
const sparkShapes = (prev: Sim, view: View): Shape[] => {
  const { unit: { u, v }, grain } = view
  return prev.sparks.map(s => {
    const x = (s.x + s.vx * view.alpha) * u
    const y = Math.min(FLOOR_Y, s.y + s.vy * view.alpha) * v // o confete para no chão
    const rgb = rgbOf(s.paint, view.isLight)
    if (!view.isFree) return box(snap(x, grain.x), snap(y, grain.y), grain.x, grain.y, rgb)
    const side = u * SPARK_SIZE
    return box(x + (u - side) / 2, y + (v - side) / 2, side, side, rgb)
  })
}

// As estrelas no ar, em pixels: só no traço livre (em blocos elas são caracteres).
const starField = (prev: Sim, geo: Geo, view: View): Shape[] => {
  const subtle = toneOf('subtle', view)
  return Array.from({ length: (SCENE_ROWS - 1) * geo.width }).flatMap((_, i): Shape[] => {
    const column = i % geo.width
    const row = Math.floor(i / geo.width)
    const star = starAt(column, row, prev.tick)
    return star ? starShapes(star.text === '✦', (column + 0.5) * view.cell.w, (row + 0.5) * view.cell.h, view.unit, subtle) : []
  })
}

// O chão em pixels: a linha da pista e a esteira, com os roletes andando.
const groundwork = (geo: Geo, wall: string, view: View): Shape[] => {
  const { unit, cell } = view
  const subtle = toneOf('subtle', view)
  const ground = (FLOOR_Y + 1) * unit.v
  const beltFrom = (geo.beltFrom - 1) * cell.w
  const beltTo = (wallFront(wall, geo) + 1) * cell.w
  // os roletes andam uma célula por quadro, um a cada quatro células
  const span = Math.max(1, Math.ceil((beltTo - beltFrom) / (ROLLER_GAP * cell.w)) + 1)
  const offset = ((view.time % ROLLER_GAP) + ROLLER_GAP) % ROLLER_GAP
  const first = Math.ceil((geo.beltFrom - 1 - offset) / ROLLER_GAP)
  const rollers = Array.from({ length: span }, (_, k) => (offset + (first + k) * ROLLER_GAP + 0.5) * cell.w)
  return [...floorShapes(0, beltFrom, ground, unit, subtle), ...beltShapes(beltFrom, beltTo, ground, unit, subtle, rollers)]
}

// O que aparece numa célula vazia do palco em blocos. No tamanho de sempre, o chão e as estrelas do
// palco de texto; no dobrado o chão já vem desenhado, e ficam só as estrelas, cada uma na sua célula.
const underOf = (prev: Sim, geo: Geo, wall: string, zoom: Zoom) => (cell: number, row: number): Part | undefined => {
  if (zoom === 1) return backdropAt(cell, row, prev.tick, geo, wall)
  const isStarCell = cell % zoom === 0 && row % zoom === 0 && row < (SCENE_ROWS - 1) * zoom
  return isStarCell ? starAt(cell / zoom, row / zoom, prev.tick) : undefined
}

/** Puro: a cena do palco em pixels, entre dois quadros da simulação. */
export const hdScene = ({ prev: shown, cur, alpha, geo, hud, powers, isLight = false, accent = 'claude', avatar, trace, zoom = 1 }: HdInput): HdScene => {
  // Com o caminho todo percorrido, o que se mostra é o estado seguinte, inteiro: o bicho que chegou já
  // está na pose de quem chegou, e a cena pode parar ali.
  const isThere = !(alpha < 1)
  const prev = isThere ? cur : shown
  const t = isThere ? 0 : clamp01(alpha)
  const isFree = trace === 'pixels'
  const view: View = {
    time: prev.tick + t, isLight, isFine: isFree, grain: GRAIN, accent, alpha: t, zoom, mascot: artOf(avatar),
    unit: { u: SUB_W * zoom, v: SUB_H * zoom },
    cell: { w: CELL_W * zoom, h: CELL_H * zoom },
    isFree,
    hasDetail: isFree || zoom > 1,
  }
  const wall = visibleWall(prev.wall, geo)
  const casts = prev.workers.map(w => castOf(w, prev, cur, powers, view))
  // Os fogos da festa do fim, em volta do mascote.
  const party = partyAge(prev)
  const host = prev.workers.find(w => w.id === MAIN)
  const hostNext = cur.workers.find(w => w.id === MAIN)
  const center = host ? (lerp(host.x, hostNext?.x ?? host.x, t) + CLAWD.width / 2) * view.unit.u : 0
  const fireworks = party !== null && host ? fireworkShapes(scenePower(prev, powers, MAIN) ?? PLAIN, party + t, center, view.unit, view) : []
  const columns = geo.width * zoom
  return {
    zoom,
    columns,
    rows: SCENE_ROWS * zoom,
    width: columns * CELL_W,
    height: SCENE_ROWS * zoom * CELL_H,
    shapes: [
      ...(isFree ? starField(prev, geo, view) : []),
      ...(view.hasDetail ? groundwork(geo, wall, view) : []),
      ...casts.flatMap(c => c.glow),
      ...brickwork(prev, geo, wall, view),
      ...casts.flatMap(c => c.body), // os ajudantes, menores, passam na frente do mascote
      ...casts.flatMap(c => c.tiles),
      ...fireworks,
      ...casts.flatMap(c => c.fore),
      ...sparkShapes(prev, view),
      ...casts.flatMap(c => c.signs),
    ],
    labels: isFree ? [] : [...casts.flatMap(c => c.labels), ...cornerLabels(prev, { ...geo, width: columns }, hud)],
    under: underOf(prev, geo, wall, zoom),
  }
}
