// Gera os quadros do GIF do README: a barra inteira (régua, cabeçalho, palco, linhas de agente) ao longo
// de um turno de mentira, com as mesmas funções que desenham a barra de verdade. Sai JSON no stdout.
//
//   bun run scripts/demo-frames.ts [colunas] [en|pt] [modelo] [effort] [blocos|texto] | python3 scripts/demo-gif.py docs/demo.gif
//
// O idioma é o dos textos da barra no GIF: `en` (o padrão, para o README.md) ou `pt` (para o README.pt-BR.md).
// O modelo (`fable`, `opus`, `sonnet`, `haiku`; o padrão é `fable`) e o effort (`low` a `max`; o padrão é
// `high`) são os do turno de mentira: deles sai a aparência do mascote. O palco sai em `blocos` (o padrão:
// o que a maioria dos terminais mostra, repintado entre dois quadros da simulação) ou em `texto` (o palco
// clássico, de quadrantes).
//
// Não faz parte do mod: roda fora do Claude Code, só para documentação.
import { DEFAULT_COLOR } from '../hooks/blocks'
import type { Cell } from '../hooks/blocks'
import { ruleParts } from '../hooks/effects'
import { hdScene } from '../hooks/hd'
import { stringsOf } from '../hooks/i18n'
import { cardLines, hudParts } from '../hooks/lines'
import { kindOf } from '../hooks/palette'
import { levelOf, powerOf } from '../hooks/power'
import { TAIL_GAP, lineWidth } from '../hooks/parts'
import type { Line, Part } from '../hooks/parts'
import { sceneRows } from '../hooks/scene'
import { DEFAULT_SETTINGS } from '../hooks/settings'
import { rasterCells } from '../hooks/stage'
import { EMPTY_SIM, MAIN, begin, enqueue, finish, geometry, hasScene, isAnimating, settle, step, syncHelpers, think } from '../hooks/sim'
import type { Sim } from '../hooks/sim'
import type { StatusAgent } from '../types'

const WIDTH = Number(process.argv[2] ?? 100)
const LANGUAGE = process.argv[3] === 'pt' ? 'pt' : 'en'
const SETTINGS = { ...DEFAULT_SETTINGS, language: LANGUAGE } as const
const MODELS: Record<string, string> = { fable: 'claude-fable-5-2', opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5' }
const MODEL = MODELS[process.argv[4] ?? 'fable'] ?? 'claude-fable-5-2'
const EFFORT = process.argv[5] ?? 'high'
const IS_BLOCKS = process.argv[6] !== 'texto'
const STRINGS = stringsOf(LANGUAGE)
const FRAME_MS = 125
// Em blocos, o palco é repintado entre dois quadros da simulação, como na barra de verdade (lá, perto de
// 25 vezes por segundo; no GIF, 16): o resto da barra segue a 8 quadros por segundo.
const PAINTS = IS_BLOCKS ? 2 : 1
const LOOK = { isLight: false, accent: 'claude' }
const T0 = 1_000_000
const LAST_FRAME = 232
const TURN_ENDS = 190
const BUTTONS = 6 // ' ⚙ ' e ' ▾ '

const geo = geometry(WIDTH)
if (!geo) throw new Error(`o palco não cabe em ${WIDTH} colunas`)

type Cue = (sim: Sim) => Sim
/** Uma leva de ferramentas de alguém, num quadro: entra na cena e conta nas linhas da barra. */
type Batch = { at: number; who: string; tools: string[]; busy?: number }

const BATCHES: Batch[] = [
  { at: 18, who: MAIN, tools: ['Read', 'Read', 'Grep'] },
  { at: 52, who: MAIN, tools: ['Read', 'Edit', 'Read', 'Write', 'Glob', 'WebFetch', 'Edit', 'Bash'], busy: 1 },
  { at: 82, who: MAIN, tools: ['Agent'], busy: 1 },
  { at: 90, who: 'a1', tools: ['Grep', 'Read', 'Read'] },
  { at: 96, who: MAIN, tools: ['Agent'], busy: 1 },
  { at: 104, who: 'b2', tools: ['Read', 'Edit'] },
  { at: 112, who: 'a1', tools: ['Bash'], busy: 1 },
  { at: 118, who: 'b2', tools: ['Write', 'Edit', 'Read'] },
  { at: 126, who: 'a1', tools: ['Read', 'Read'] },
  { at: 150, who: MAIN, tools: ['Read', 'Edit', 'mcp__docs__search', 'Bash'] },
]
// Quando o modelo começa e para de pensar (o turno principal).
const THINKING: [number, boolean][] = [[0, true], [18, false], [20, true], [52, false], [160, true], [TURN_ENDS, false]]
// Os agentes: quando nascem e quando terminam.
const TASKS = LANGUAGE === 'pt' ? ['mapear as rotas de vídeo', 'revisar o diff do palco'] : ['map the video routes', 'review the stage diff']
const AGENTS = [
  { id: 'a1', type: 'Explore', description: TASKS[0] ?? '', model: 'claude-haiku-5-5', effort: 'max', from: 84, to: 146, tokens: 18_400 },
  { id: 'b2', type: 'code-reviewer', description: TASKS[1] ?? '', model: 'claude-sonnet-5-5', effort: 'high', from: 98, to: 156, tokens: 9_700 },
]
const LINGER_FRAMES = 64 // quanto uma linha de agente terminado fica na barra

const cuesAt = (frame: number): Cue[] => [
  ...(frame === 0 ? [begin] : []),
  ...THINKING.filter(([at]) => at === frame).map(([, isOn]): Cue => sim => think(sim, MAIN, isOn)),
  ...BATCHES.filter(b => b.at === frame).map(({ who, tools }): Cue => sim => tools.reduce((s, name) => enqueue(s, who, kindOf(name), name), sim)),
  // dois quadros depois, as ferramentas rápidas da leva já terminaram
  ...BATCHES.filter(b => b.at + 2 === frame).map(({ who, tools, busy = 0 }): Cue => sim =>
    Array.from({ length: tools.length - busy }).reduce<Sim>(s => settle(s, who), sim)),
  ...(frame === TURN_ENDS ? [finish] : []),
]

const countOf = (who: string, frame: number) => BATCHES.filter(b => b.who === who && b.at <= frame).reduce((n, b) => n + b.tools.length, 0)
const lastOf = (who: string, frame: number) => BATCHES.filter(b => b.who === who && b.at <= frame).at(-1)?.tools.at(-1) ?? null

const agentsAt = (frame: number): StatusAgent[] =>
  AGENTS.filter(a => frame >= a.from && frame <= a.to + LINGER_FRAMES).map(a => ({
    id: a.id, type: a.type, description: a.description, model: a.model, effort: a.effort,
    state: frame >= a.to ? 'done' : 'running',
    startedAt: T0 + a.from * FRAME_MS, seenAt: T0 + frame * FRAME_MS,
    endedAt: frame >= a.to ? T0 + a.to * FRAME_MS : undefined,
    tools: countOf(a.id, frame), lastTool: lastOf(a.id, frame),
    tokens: frame >= a.to ? a.tokens : undefined,
  }))

// Uma linha da barra como a tela a mostra: o texto, o espaço, e o que fica encostado à direita.
const laidOut = (line: Line, room: number): Part[] => {
  const gap = Math.max(line.tail?.length ? TAIL_GAP : 0, room - lineWidth(line) + (line.tail?.length ? TAIL_GAP : 0))
  return [...line.parts, { text: ' '.repeat(gap) }, ...(line.tail ?? [])]
}

const hex = (rgb: number) => `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`

// Uma célula do palco em blocos como um pedaço de linha: o caractere, a cor dele e a do fundo.
const cellPart = ({ code, fg, bg }: Cell): Part => ({
  text: String.fromCodePoint(code),
  ...(fg === DEFAULT_COLOR ? {} : { color: hex(fg) }),
  ...(bg === DEFAULT_COLOR ? {} : { bg: hex(bg) }),
})

// O palco num instante: em texto, as linhas de quadrantes; em blocos, a cena entre o estado mostrado e o
// seguinte, ajustada em células como o `Raster` as recebe.
const stageAt = (prev: Sim, sim: Sim, alpha: number, hud: Part[], powers: Map<string, ReturnType<typeof powerOf>>): Line[] => {
  if (!hasScene(sim)) return []
  if (!IS_BLOCKS) return sceneRows({ sim, geo, hud, powers }).map(parts => ({ parts }))
  const scene = hdScene({ prev, cur: sim, alpha, geo, hud, powers, ...LOOK, trace: 'blocks', zoom: 1 })
  const cells = rasterCells(scene, LOOK)
  return Array.from({ length: scene.rows }, (_, row) => ({ parts: cells.slice(row * scene.columns, (row + 1) * scene.columns).map(cellPart) }))
}

const barAt = (prev: Sim, sim: Sim, frame: number, alpha: number): Part[][] => {
  const now = T0 + frame * FRAME_MS
  const isWorking = frame < TURN_ENDS
  const agents = agentsAt(frame)
  const main = { startedAt: T0, tools: countOf(MAIN, frame), lastTool: lastOf(MAIN, frame), costAtStart: 1.5 }
  const costSteps = Math.floor(frame / 14) // o custo cresce de tempos em tempos, e acende quando cresce
  const figures = {
    model: MODEL, effort: EFFORT, costUsd: 1.5 + costSteps * 0.03, costMovedAt: T0 + costSteps * 14 * FRAME_MS,
    fiveHour: { pct: 42, resetsAt: new Date(now + 7_800_000).toISOString() }, week: { pct: 18 },
  }
  // o poder de cada um em cena, como a barra de verdade o tira do modelo e do effort
  const powers = new Map([[MAIN, powerOf(MODEL, EFFORT)], ...agents.map(a => [a.id, powerOf(a.model, a.effort)] as const)])
  const stage = stageAt(prev, sim, alpha, isWorking ? hudParts(main, now, STRINGS) : [], powers)
  const [head = { parts: [] }, ...rest] = cardLines({ figures, main, agents, now, frame, isWorking, max: WIDTH, settings: SETTINGS, stage })
  return [
    ruleParts(WIDTH, frame, isWorking || agents.some(a => a.state === 'running') || isAnimating(sim), levelOf(EFFORT)),
    [...laidOut(head, WIDTH - BUTTONS), { text: ' ⚙ ', dim: true }, { text: ' ▾ ', dim: true }],
    ...rest.map(line => laidOut(line, WIDTH)),
  ]
}

const frames = Array.from({ length: LAST_FRAME + 1 }).reduce<{ sim: Sim; rows: Part[][][] }>(
  (acc, _, frame) => {
    const cued = cuesAt(frame).reduce((s, cue) => cue(s), acc.sim)
    const sim = step(syncHelpers(cued, agentsAt(frame)), geo)
    const paints = Array.from({ length: PAINTS }, (_, paint) => barAt(acc.sim, sim, frame, PAINTS > 1 ? paint / PAINTS : 1))
    return { sim, rows: [...acc.rows, ...paints] }
  },
  { sim: EMPTY_SIM, rows: [] },
).rows

console.log(JSON.stringify({ width: WIDTH, frameMs: Math.round(FRAME_MS / PAINTS), frames }))
