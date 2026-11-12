import { bodyShade, eyesOf, fireworksOf, glowOf, jetsOf, sparksOf, streaksOf } from './aura'
import type { Figure } from './aura'
import { SPINNER, noise } from './effects'
import { cols } from './format'
import { KIND_PAINT } from './palette'
import type { Kind } from './palette'
import { partsWidth } from './parts'
import type { Part } from './parts'
import { BRICK_CELLS, brick, dotKey, dotsLayer, rasterRow, spriteLayer } from './pixels'
import type { Glow, Layer, Paint } from './pixels'
import { poseOf } from './pose'
import type { Mark } from './pose'
import { PLAIN, sparkAt } from './power'
import type { Power } from './power'
import { FLOOR_Y, LOAD_LAYERS, MAIN, PILE_COLS, PILE_ROWS, WALL_ROWS, partyAge, wallFront } from './sim'
import type { Geo, Sim, Worker } from './sim'
import { CLAWD, drawing } from './sprites'

// O desenho de um quadro da cena: do estado da simulação às quatro linhas de células do palco.
// Linha 0 é o ar (balões, tijolos na cabeça, placar); 1 e 2, cabeças e corpos; 3, patas e chão.

export const SCENE_ROWS = 4
const TEXT_STRIDE = 4096 // a chave de uma célula de texto: linha * TEXT_STRIDE + célula
const ROLLER_GAP = 4 // células entre dois roletes da esteira
const STAR_DENSITY = 0.045 // a fração das células do ar que tem uma estrela
const TWINKLE = 40 // o ciclo de uma estrela, em quadros
const STAR_FLASH = 3 // quadros do ciclo em que ela brilha
const STAR_DARK = 7 // quadros do ciclo em que ela some

type Dot = readonly [number | undefined, Paint]
/** Um texto posto numa linha, a partir de uma célula. */
export type Label = { row: number; cell: number; parts: readonly Part[] }

const FLOOR: Part = { text: '─', color: 'subtle' }
const BELT: Part = { text: '═', color: 'subtle' }
const ROLLER: Part = { text: '╪', color: 'subtle' }

const mod = (n: number, by: number) => ((n % by) + by) % by

/** Um bicho num quadro: o desenho dele, o que leva na cabeça, o balão, e o que o poder dele acrescenta. */
type Actor = {
  layer: Layer | null
  tiles: Dot[]
  labels: Label[]
  /** A aura: o clarão atrás dele. */
  glow: Glow | null
  /** O que a aura solta na frente da cena: fagulhas, raios, os riscos de quem corre, os jatos de quem voa. */
  fore: Dot[]
}

const NO_ACTOR: Actor = { layer: null, tiles: [], labels: [], glow: null, fore: [] }

/** As células em volta de um bicho onde o sinal dele aparece: sobre o meio da cabeça, e logo ao lado. */
export const anchorsOf = (x: number, width: number) => ({ above: Math.floor((x + width / 2) / 2), beside: Math.ceil((x + width) / 2) })

/**
 * Puro: o sinal de um bicho como texto, nas células em volta dele. Pensando, a faísca é a da classe
 * dele; sem poder dito, a do próprio Claude Code.
 */
export const markLabels = (mark: Mark | null, at: { above: number; beside: number }, tick: number, power: Power | undefined): Label[] => {
  if (!mark) return []
  const label = (row: number, cell: number, ...parts: Part[]): Label[] => [{ row, cell, parts }]
  switch (mark.kind) {
    case 'shout':
      return label(0, at.above, { text: '!', color: 'claude', bold: true })
    case 'cheer':
      return label(1, at.beside, { text: '✓', color: 'success', bold: true })
    case 'fail':
      return label(1, at.beside, { text: '✗', color: 'error', bold: true })
    case 'sleep':
      // quem dorme solta um z, e depois outro mais alto
      return [...label(1, at.above, { text: 'z', dim: true }), ...(mark.isLoud ? label(0, at.above + 1, { text: 'Z', dim: true }) : [])]
    case 'tool':
      // esperando uma ferramenta: o nome dela
      return label(0, Math.max(0, at.above - Math.floor((cols(mark.tool) + 1) / 2)), { text: mark.tool, dim: true }, { text: '·'.repeat(mark.dots), color: 'claude' })
    case 'think':
      // pensando: a faísca da classe dele pulsando
      return label(0, at.above, { text: power ? sparkAt(power.tier, tick) : (SPINNER[tick % SPINNER.length] ?? '✻'), color: 'claude', bold: true })
  }
}

// Um bicho num quadro: a camada do desenho dele, os tijolos na cabeça, o balão e o poder. Sem poder
// (`undefined`: quem desenha não disse nenhum), é o bicho de sempre, com a faísca do próprio Claude Code.
const actorOf = (w: Worker, sim: Sim, power: Power | undefined, isLight: boolean): Actor => {
  const pose = poseOf(w, sim, power)
  if (pose.isUnseen) return NO_ACTOR
  const { art, tint, power: p } = pose
  const x = Math.round(w.x)
  const bitmap = drawing(art, { eyes: pose.eyes, isArmsUp: pose.isArmsUp, step: pose.step, isSitting: pose.isSitting, hasLitEyes: eyesOf(p) !== null })
  // A última linha do desenho (as patas, ou o corpo de quem está sentado) fica no chão.
  const top = FLOOR_Y + 1 - bitmap.length + pose.lift
  const figure: Figure = { bitmap, left: x, top, floor: FLOOR_Y, tint, strength: pose.strength }
  const mood = { tick: sim.tick, isLight }
  const layer = spriteLayer(bitmap, x, top, pose.isFailed ? `~${tint}` : bodyShade(p, figure, mood))
  const glow = glowOf(p, figure, mood)
  const fore = [
    ...sparksOf(p, figure, mood),
    ...(pose.wake === 0 ? [] : streaksOf(p, figure, mood, pose.wake)),
    ...(pose.isFlying ? jetsOf(p, figure, mood) : []),
  ]

  // Os tijolos na cabeça: lado a lado na camada de baixo, e os seguintes empilhados em cima.
  const headCell = Math.round((x + art.headFrom) / 2)
  const perLayer = Math.max(1, Math.floor(art.headWidth / (BRICK_CELLS * 2)))
  const tiles = [...w.load].slice(0, perLayer * LOAD_LAYERS).flatMap((kind, i) =>
    brick(headCell + (i % perLayer) * BRICK_CELLS, top - 1 - Math.floor(i / perLayer), KIND_PAINT[kind as Kind] ?? KIND_PAINT.o),
  )
  const labels = markLabels(pose.mark, anchorsOf(x, art.width), sim.tick, power)
  return { layer, tiles, labels, glow, fore }
}

/** O mosaico que cabe em cena: quando passa do tamanho, as colunas mais antigas ficam de fora. */
export const visibleWall = (wall: string, geo: Geo) => {
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

/** Uma estrela no ar: fica num lugar fixo, quase sempre um ponto, de vez em quando um brilho, às vezes some. */
export const starAt = (cell: number, row: number, tick: number): Part | undefined => {
  if (noise(cell * 3 + row * 977, 5) >= STAR_DENSITY) return undefined
  const phase = (tick + Math.floor(noise(cell, row + 11) * TWINKLE)) % TWINKLE
  if (phase < STAR_FLASH) return { text: '✦', color: 'subtle' }
  return phase < TWINKLE - STAR_DARK ? { text: '·', color: 'subtle' } : undefined
}

/**
 * O chão numa célula da última linha: a pista à esquerda, e a esteira, com os roletes andando, até
 * encostar no mosaico (a fiada de baixo dele começa uma célula depois da frente).
 */
export const groundAt = (cell: number, tick: number, geo: Geo, wall: string): Part | undefined => {
  if (cell < geo.beltFrom - 1) return FLOOR
  if (cell > wallFront(wall, geo)) return undefined
  return mod(cell - tick, ROLLER_GAP) === 0 ? ROLLER : BELT
}

/** O que aparece numa célula sem nada pintado: o chão na última linha, uma estrela nas outras. */
export const backdropAt = (cell: number, row: number, tick: number, geo: Geo, wall: string): Part | undefined =>
  row === SCENE_ROWS - 1 ? groundAt(cell, tick, geo, wall) : starAt(cell, row, tick)

/** Os textos do canto do palco: quantos tijolos esperam além da pilha, e o placar do turno. */
export const cornerLabels = (sim: Sim, geo: Geo, hud: readonly Part[]): Label[] => {
  const waiting = sim.workers.reduce((n, w) => n + w.queue.length, 0) - PILE_COLS * PILE_ROWS
  return [
    ...(waiting > 0 ? [{ row: 0, cell: 0, parts: [{ text: `+${waiting}`, dim: true }] }] : []),
    { row: 0, cell: Math.max(0, geo.width - partsWidth(hud)), parts: hud },
  ]
}

/** Os textos da cena, um caractere por célula: a chave de cada um é `textKey(linha, célula)`. */
export const textCells = (labels: readonly Label[]): Map<number, Part> =>
  new Map(
    labels.flatMap(({ row, cell, parts }) => {
      const chars = parts.flatMap(({ text, ...style }) => [...text].map((ch): Part => ({ ...style, text: cols(ch) === 1 ? ch : '?' })))
      return chars.map((part, i) => [row * TEXT_STRIDE + cell + i, part] as const)
    }),
  )

export const textKey = (row: number, cell: number) => row * TEXT_STRIDE + cell

export type SceneInput = {
  sim: Sim
  geo: Geo
  /** O placar do canto de cima à direita: tempo do turno, ferramentas, a última delas. */
  hud: readonly Part[]
  /** O poder de cada bicho em cena, pelo id dele; quem não está aqui é desenhado como sempre foi. */
  powers?: ReadonlyMap<string, Power>
  /** O tema é claro: a aura esmaece para branco, não para preto. */
  isLight?: boolean
}

/**
 * O poder de um bicho como a cena o desenha. Fora de um turno (só os ajudantes ainda trabalham) o
 * mascote descansa: segue quem é, sem a energia do effort.
 */
export const scenePower = (sim: Sim, powers: ReadonlyMap<string, Power> | undefined, id: string): Power | undefined => {
  const power = powers?.get(id)
  const isResting = !sim.isOn && sim.finale === 0
  return power && id === MAIN && isResting ? { ...power, level: 0 } : power
}

/** Puro: as quatro linhas do palco para um estado da simulação. */
export const sceneRows = ({ sim, geo, hud, powers, isLight = false }: SceneInput): Part[][] => {
  const powerOf = (id: string) => scenePower(sim, powers, id)
  const actors = sim.workers.map(w => actorOf(w, sim, powerOf(w.id), isLight))
  const wall = visibleWall(sim.wall, geo)
  // Os fogos da festa do fim, em volta do mascote.
  const party = partyAge(sim)
  const host = sim.workers.find(w => w.id === MAIN)
  const fireworks = party !== null && host ? fireworksOf(powerOf(MAIN) ?? PLAIN, party, Math.round(host.x) + CLAWD.width / 2) : []
  // As auras: a de quem está na frente vale primeiro.
  const glows = actors.flatMap(a => (a.glow ? [a.glow] : [])).reverse()
  const glow: Glow | undefined = glows.length
    ? (x, y) => {
        for (const lit of glows) {
          const paint = lit(x, y)
          if (paint !== undefined) return paint
        }
        return undefined
      }
    : undefined
  const layers: Layer[] = [
    dotsLayer(sim.sparks.map(s => [dotKey(Math.round(s.x), Math.round(s.y)), s.paint] as const)),
    dotsLayer([...fireworks, ...actors.flatMap(a => a.fore)]),
    dotsLayer(actors.flatMap(a => a.tiles)),
    ...actors.flatMap(a => (a.layer ? [a.layer] : [])).reverse(), // os ajudantes, menores, passam na frente do mascote
    dotsLayer(bricksOf(sim, geo, wall)),
  ]
  const texts = textCells([...actors.flatMap(a => a.labels), ...cornerLabels(sim, geo, hud)])
  return Array.from({ length: SCENE_ROWS }, (_, row) =>
    rasterRow({
      layers, row, width: geo.width, glow,
      over: cell => (cell < geo.width ? texts.get(textKey(row, cell)) : undefined),
      under: cell => backdropAt(cell, row, sim.tick, geo, wall),
    }),
  )
}
