import { SPINNER, noise } from './effects'
import { cols } from './format'
import { KIND_PAINT, tintOf } from './palette'
import type { Kind } from './palette'
import { partsWidth } from './parts'
import type { Part } from './parts'
import { BRICK_CELLS, brick, dotKey, dotsLayer, rasterRow, spriteLayer } from './pixels'
import type { Layer, Paint } from './pixels'
import { FLOOR_Y, LOAD_LAYERS, MAIN, PILE_COLS, PILE_ROWS, SPAWN, WALL_ROWS, wallFront } from './sim'
import type { Geo, Sim, Worker } from './sim'
import { CLAWD, MINI, drawing } from './sprites'
import type { Eyes } from './sprites'

// O desenho de um quadro da cena: do estado da simulação às quatro linhas de células do palco.
// Linha 0 é o ar (balões, tijolos na cabeça, placar); 1 e 2, cabeças e corpos; 3, patas e chão.

export const SCENE_ROWS = 4
const TEXT_STRIDE = 4096 // a chave de uma célula de texto: linha * TEXT_STRIDE + célula
const JUMP = [0, -1, -2, -2, -1, 0] // os pulos de quem comemora, em sublinhas
const FALL = [-2, -1] // um ajudante recém-brotado cai até o chão
const BLINK_EVERY = 31 // a cada tantos quadros, um quadro de olhos fechados
const LOOK: readonly Eyes[] = ['open', 'open', 'left', 'open', 'open', 'right'] // quem pensa olha para os lados
const LOOK_HOLD = 6 // quadros em cada olhar
const SNORE = 5 // quadros entre um z e o seguinte de quem dorme
const WAVE_PERIOD = 4 // quem espera uma ferramenta sobe e desce os braços neste ritmo
const ROLLER_GAP = 4 // células entre dois roletes da esteira
const STAR_DENSITY = 0.045 // a fração das células do ar que tem uma estrela
const TWINKLE = 40 // o ciclo de uma estrela, em quadros
const STAR_FLASH = 3 // quadros do ciclo em que ela brilha
const STAR_DARK = 7 // quadros do ciclo em que ela some

type Dot = readonly [number | undefined, Paint]
/** Um texto posto numa linha, a partir de uma célula. */
type Label = { row: number; cell: number; parts: readonly Part[] }

const FLOOR: Part = { text: '─', color: 'subtle' }
const BELT: Part = { text: '═', color: 'subtle' }
const ROLLER: Part = { text: '╪', color: 'subtle' }

const seedOf = (id: string) => [...id].reduce((n, ch) => (n * 31 + (ch.codePointAt(0) ?? 0)) >>> 0, 7) % 997
const mod = (n: number, by: number) => ((n % by) + by) % by

// Um bicho num quadro: a camada do desenho dele, os tijolos na cabeça e o balão.
const actorOf = (w: Worker, sim: Sim): { layer: Layer | null; tiles: Dot[]; labels: Label[] } => {
  const isMain = w.id === MAIN
  const art = isMain ? CLAWD : MINI
  const tint = isMain ? 'claude' : tintOf(w.id)
  const x = Math.round(w.x)
  const isUnseen = w.act === 'poof' || (!isMain && w.act === 'enter' && w.t < SPAWN)
  if (isUnseen) return { layer: null, tiles: [], labels: [] }

  const isWalking = w.shout === 0 && (w.act === 'fetch' || w.act === 'haul' || w.act === 'home' || (isMain && w.act === 'enter'))
  const isCarrying = w.load.length > 0
  const isResting = w.act === 'idle' && w.shout === 0
  const isWaving = isResting && w.busy > 0 && sim.tick % WAVE_PERIOD < WAVE_PERIOD / 2
  const isArmsUp = isCarrying || w.act === 'lift' || w.act === 'drop' || w.act === 'cheer' || w.shout > 0 || isWaving
  const phase = sim.tick + seedOf(w.id)
  const eyes: Eyes =
    w.act === 'sleep' || w.act === 'fail' || phase % BLINK_EVERY === 0 ? 'closed'
    : isResting && w.thinking > 0 ? (LOOK[Math.floor(phase / LOOK_HOLD) % LOOK.length] ?? 'open')
    : 'open'
  const lift =
    w.act === 'cheer' ? (JUMP[w.t % JUMP.length] ?? 0)
    : w.act === 'enter' && !isMain ? (FALL[w.t - SPAWN] ?? 0)
    : isWalking && !isCarrying ? -(sim.tick % 2) // de mãos vazias vai aos pulinhos
    : 0
  const bitmap = drawing(art, { eyes, isArmsUp, step: isWalking && sim.tick % 2 === 1 ? 1 : 0, isSitting: w.act === 'sleep' })
  // A última linha do desenho (as patas, ou o corpo de quem está sentado) fica no chão.
  const top = FLOOR_Y + 1 - bitmap.length + lift
  const layer = spriteLayer(bitmap, x, top, w.act === 'fail' ? `~${tint}` : tint)

  // Os tijolos na cabeça: lado a lado na camada de baixo, e os seguintes empilhados em cima.
  const headCell = Math.round((x + art.headFrom) / 2)
  const perLayer = Math.max(1, Math.floor(art.headWidth / (BRICK_CELLS * 2)))
  const tiles = [...w.load].slice(0, perLayer * LOAD_LAYERS).flatMap((kind, i) =>
    brick(headCell + (i % perLayer) * BRICK_CELLS, top - 1 - Math.floor(i / perLayer), KIND_PAINT[kind as Kind] ?? KIND_PAINT.o),
  )
  const above = Math.floor((x + art.width / 2) / 2)
  const beside = Math.ceil((x + art.width) / 2)
  const label = (row: number, cell: number, ...parts: Part[]): Label[] => [{ row, cell, parts }]
  const dots = '·'.repeat(1 + (Math.floor(sim.tick / 2) % 3))
  const labels: Label[] =
    w.shout > 0 ? label(0, above, { text: '!', color: 'claude', bold: true })
    : w.act === 'cheer' ? label(1, beside, { text: '✓', color: 'success', bold: true })
    : w.act === 'fail' ? label(1, beside, { text: '✗', color: 'error', bold: true })
    // quem dorme solta um z, e depois outro mais alto
    : w.act === 'sleep' ? [...label(1, above, { text: 'z', dim: true }), ...(Math.floor(sim.tick / SNORE) % 2 ? label(0, above + 1, { text: 'Z', dim: true }) : [])]
    : !isResting || isCarrying ? []
    // esperando uma ferramenta: o nome dela; pensando: a faísca do Claude pulsando
    : w.busy > 0 && w.tool ? label(0, Math.max(0, above - Math.floor((cols(w.tool) + 1) / 2)), { text: w.tool, dim: true }, { text: dots, color: 'claude' })
    : w.thinking > 0 ? label(0, above, { text: SPINNER[sim.tick % SPINNER.length] ?? '✻', color: 'claude', bold: true })
    : []
  return { layer, tiles, labels }
}

// O mosaico que cabe em cena: quando passa do tamanho, as colunas mais antigas ficam de fora.
const visibleWall = (wall: string, geo: Geo) => {
  const spare = wall.length - geo.wallCols * WALL_ROWS
  return spare > 0 ? wall.slice(Math.ceil(spare / WALL_ROWS) * WALL_ROWS) : wall
}

// Os tijolos parados e os da esteira: a pilha à esquerda, o mosaico à direita, e os que estão a caminho.
const bricksOf = (sim: Sim, geo: Geo, wall: string): Dot[] => {
  const pile = sim.workers.map(w => w.queue).join('').slice(0, PILE_COLS * PILE_ROWS)
  return [
    ...[...pile].flatMap((kind, i) => brick(Math.floor(i / PILE_ROWS) * BRICK_CELLS, FLOOR_Y - (i % PILE_ROWS), KIND_PAINT[kind as Kind] ?? KIND_PAINT.o)),
    ...sim.belt.flatMap(b => brick(Math.round(b.x), FLOOR_Y, KIND_PAINT[b.kind])),
    ...[...wall].flatMap((kind, i) =>
      brick(
        // fiadas alternadas, como numa parede: as ímpares começam uma célula antes
        geo.wallRight - 1 - Math.floor(i / WALL_ROWS) * BRICK_CELLS - ((i % WALL_ROWS) % 2),
        FLOOR_Y - (i % WALL_ROWS),
        sim.flash > 0 && i === wall.length - 1 ? 'text' : (KIND_PAINT[kind as Kind] ?? KIND_PAINT.o), // o recém-chegado acende
      ),
    ),
  ]
}

// Uma estrela no ar: fica num lugar fixo, quase sempre um ponto, de vez em quando um brilho, às vezes some.
const starAt = (cell: number, row: number, tick: number): Part | undefined => {
  if (noise(cell * 3 + row * 977, 5) >= STAR_DENSITY) return undefined
  const phase = (tick + Math.floor(noise(cell, row + 11) * TWINKLE)) % TWINKLE
  if (phase < STAR_FLASH) return { text: '✦', color: 'subtle' }
  return phase < TWINKLE - STAR_DARK ? { text: '·', color: 'subtle' } : undefined
}

const textCells = (labels: readonly Label[]): Map<number, Part> =>
  new Map(
    labels.flatMap(({ row, cell, parts }) => {
      const chars = parts.flatMap(({ text, ...style }) => [...text].map((ch): Part => ({ ...style, text: cols(ch) === 1 ? ch : '?' })))
      return chars.map((part, i) => [row * TEXT_STRIDE + cell + i, part] as const)
    }),
  )

export type SceneInput = {
  sim: Sim
  geo: Geo
  /** O placar do canto de cima à direita: tempo do turno, ferramentas, a última delas. */
  hud: readonly Part[]
}

/** Puro: as quatro linhas do palco para um estado da simulação. */
export const sceneRows = ({ sim, geo, hud }: SceneInput): Part[][] => {
  const actors = sim.workers.map(w => actorOf(w, sim))
  const wall = visibleWall(sim.wall, geo)
  const waiting = sim.workers.reduce((n, w) => n + w.queue.length, 0) - PILE_COLS * PILE_ROWS
  const layers: Layer[] = [
    dotsLayer(sim.sparks.map(s => [dotKey(Math.round(s.x), Math.round(s.y)), s.paint] as const)),
    dotsLayer(actors.flatMap(a => a.tiles)),
    ...actors.flatMap(a => (a.layer ? [a.layer] : [])).reverse(), // os ajudantes, menores, passam na frente do mascote
    dotsLayer(bricksOf(sim, geo, wall)),
  ]
  const texts = textCells([
    ...actors.flatMap(a => a.labels),
    ...(waiting > 0 ? [{ row: 0, cell: 0, parts: [{ text: `+${waiting}`, dim: true }] }] : []),
    { row: 0, cell: Math.max(0, geo.width - partsWidth(hud)), parts: hud },
  ])
  const wallLeft = wallFront(wall, geo)
  const ground = (cell: number): Part | undefined => {
    if (cell < geo.beltFrom - 1) return FLOOR
    // A esteira vai até encostar no mosaico: a fiada de baixo dele começa uma célula depois da frente.
    if (cell > wallLeft) return undefined
    return mod(cell - sim.tick, ROLLER_GAP) === 0 ? ROLLER : BELT
  }
  return Array.from({ length: SCENE_ROWS }, (_, row) =>
    rasterRow({
      layers, row, width: geo.width,
      over: cell => (cell < geo.width ? texts.get(row * TEXT_STRIDE + cell) : undefined),
      under: cell => (row === SCENE_ROWS - 1 ? ground(cell) : starAt(cell, row, sim.tick)),
    }),
  )
}
