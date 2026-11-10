import type { SessionUsage } from 'claude-code'

import { IDLE_GLYPH, burst, reveal, seedOf, shimmer, spin, trail } from './effects'
import { PENDING, fit, fmtCost, fmtEta, fmtSpan, fmtTokens, prettyModel } from './format'
import { TAIL_GAP, lineWidth, partsWidth } from './parts'
import type { Line, Part } from './parts'
import { DEFAULT_SETTINGS, FULL_EFFECTS, effectsOf } from './settings'
import type { Effects } from './settings'
import { tintOf } from './palette'
import type {
  StatusAgent as Agent,
  StatusAgentState as AgentState,
  StatusFigures as Figures,
  StatusLimit as Limit,
  StatusMain as Main,
  StatusSettings as Settings,
} from '../types'

// As linhas da barra, puras: cabeçalho, custo, trabalho, limites e uma por agente.

const DEFAULT_WIDTH = 100 // largura das linhas quando quem chama não diz (a barra passa a da faixa)
/** Os botões ' ⚙ ' e ' ▾ ' à direita da primeira linha. */
export const BUTTONS_WIDTH = 6
const FLASH_MS = 1_500 // quanto tempo o custo fica aceso depois de crescer
const MIN_TURN_COST = 0.005 // abaixo disso arredonda para $0.00: não mostra
const LIMIT_GAUGE = 5
const AGENT_TRAIL_WIDTH = 5 // o rastro de cada agente rodando
const TYPE_MAX = 20
const DESC_MIN = 6
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

export const LINE_STRINGS = {
  session: ' sessão', turn: 'turno +', noCost: 'custo ', noEffort: 'effort',
  waiting: 'aguardando', failed: 'falhou', more: (n: number) => `+${n} ${n === 1 ? 'agente' : 'agentes'}`,
  tools: (n: number) => `${n} ${n === 1 ? 'tool' : 'tools'}`,
} as const
const STRINGS = LINE_STRINGS

const levelColor = (pct: number) => (pct >= 85 ? 'error' : pct >= 60 ? 'warning' : 'claude')

// Custo e limites, de session.measure ou de $.session.usage().
export const fromUsage = (u: Pick<SessionUsage, 'rateLimits' | 'cost'>): Pick<Figures, 'costUsd' | 'fiveHour' | 'week'> => {
  const find = (kind: string) => {
    const r = u.rateLimits.find(l => l.kind === kind)
    return r ? { pct: r.percentUsed, resetsAt: r.resetsAt } : undefined
  }
  return { costUsd: u.cost?.usd, fiveHour: find('five_hour'), week: find('seven_day') }
}

// "✶ Fable 5.2 · high": a faísca pulsa enquanto o turno roda e fica apagada fora dele.
// Modelo e effort são clicáveis: cada um abre o seu seletor.
const headLine = (f: Figures, isWorking: boolean, fr: number, fx: Effects): Line => ({
  parts: [
    !isWorking ? { text: `${IDLE_GLYPH} `, dim: true }
      : { text: `${fx.isStill ? IDLE_GLYPH : spin(fr)} `, color: 'claude', bold: true },
    { text: f.model ? prettyModel(f.model) : PENDING, color: 'claude', bold: true, action: 'model' },
    { text: ' · ', dim: true },
    f.effort
      ? { text: f.effort, ...(EFFORTS.includes(f.effort) && { color: 'claude' }), action: 'effort' }
      : { text: STRINGS.noEffort, dim: true, action: 'effort' },
  ],
})

// "$1.23 sessão · turno +$0.04": o total aceso por um instante quando cresce.
const costLine = (f: Figures, m: Main, now: number, showTurn = true): Line => {
  if (f.costUsd === undefined) return { parts: [{ text: STRINGS.noCost, dim: true }, { text: PENDING, dim: true }] }
  const isFresh = f.costMovedAt !== undefined && now >= f.costMovedAt && now - f.costMovedAt < FLASH_MS
  const turn = m.costAtStart === null ? 0 : f.costUsd - m.costAtStart
  return {
    parts: [
      { text: fmtCost(f.costUsd), bold: true, ...(isFresh && { color: 'claude' }) },
      ...(isFresh ? [{ text: ' ▲', color: 'claude' }] : []),
      { text: STRINGS.session, dim: true },
      ...(showTurn && turn >= MIN_TURN_COST ? [{ text: ' · ', dim: true }, { text: `${STRINGS.turn}${fmtCost(turn)}` }] : []),
    ],
  }
}

/** "1m12s · 14 tools · Bash": o placar do turno, para o canto do palco. */
export const hudParts = (m: Main, now: number): Part[] => [
  { text: fmtSpan(now - m.startedAt), dim: true },
  ...(m.tools > 0 ? [{ text: ` · ${STRINGS.tools(m.tools)}`, dim: true }] : []),
  ...(m.lastTool ? [{ text: ' · ', dim: true }, { text: m.lastTool, color: 'claude' }] : []),
]

// "✳✶✻····· 1m12s · 14 tools · Bash": o turno do loop principal, enquanto roda.
const workLine = (m: Main, now: number, fr: number, fx: Effects): Line => ({
  parts: [
    ...(fx.isStill ? [{ text: IDLE_GLYPH, color: 'claude' }] : trail(fr)),
    { text: ` ${fmtSpan(now - m.startedAt)}` },
    ...(m.tools > 0 ? [{ text: ` · ${STRINGS.tools(m.tools)}`, dim: true }] : []),
    ...(m.lastTool ? [{ text: ' · ', dim: true }, { text: m.lastTool, color: 'claude' }] : []),
  ],
})

const limitParts = (label: string, l: Limit, now: number): Part[] => {
  const on = Math.min(LIMIT_GAUGE, Math.max(0, Math.round((l.pct * LIMIT_GAUGE) / 100)))
  const color = levelColor(l.pct)
  const eta = fmtEta(l.resetsAt, now)
  return [
    { text: `${label} `, dim: true },
    ...(on > 0 ? [{ text: '▰'.repeat(on), color }] : []),
    ...(on < LIMIT_GAUGE ? [{ text: '▱'.repeat(LIMIT_GAUGE - on), color: 'subtle' }] : []),
    { text: ` ${Math.round(l.pct)}%`, ...(color === 'claude' ? { dim: true } : { color }) },
    ...(eta ? [{ text: ` ↻${eta}`, dim: true }] : []),
  ]
}

// "5h ▰▰▱▱▱ 42% ↻2h10m · 7d ▰▱▱▱▱ 18%": só as janelas que têm leitura.
const limitsLine = (f: Figures, now: number): Line | null => {
  const windows = [
    ...(f.fiveHour ? [limitParts('5h', f.fiveHour, now)] : []),
    ...(f.week ? [limitParts('7d', f.week, now)] : []),
  ]
  if (!windows.length) return null
  return { parts: windows.flatMap((w, n) => (n > 0 ? [{ text: ' · ', dim: true }, ...w] : w)) }
}

const GLYPH: Record<Exclude<AgentState, 'running'>, Part> = {
  waiting: { text: '◌', dim: true },
  done: { text: '✓', color: 'success' },
  failed: { text: '✗', color: 'error' },
}

// O que fica à direita na linha de um agente: tempo, ferramentas e a última delas, ou como terminou.
const agentTail = (a: Agent, now: number): Part[] => {
  if (a.state === 'waiting') return [{ text: STRINGS.waiting, dim: true }]
  const span = fmtSpan((a.endedAt ?? now) - a.startedAt)
  if (a.state === 'failed') return [{ text: `${STRINGS.failed} · ${span}`, color: 'error' }]
  if (a.state === 'done') return [{ text: a.tokens ? `${span} · ${fmtTokens(a.tokens)}` : span, dim: true }]
  return [
    { text: span },
    ...(a.tools > 0 ? [{ text: ` · ${STRINGS.tools(a.tools)}`, dim: true }] : []),
    ...(a.lastTool ? [{ text: ' · ', dim: true }, { text: a.lastTool, color: 'claude' }] : []),
  ]
}

// "✶ Explore ✳✶✻··  buscar rotas HLS        12s · 4 tools · Grep": a descrição cede espaço antes de tudo.
export const agentLine = (a: Agent, now: number, fr: number, index: number, max: number, fx: Effects = FULL_EFFECTS): Line => {
  const age = (since: number) => Math.floor((now - since) / fx.frameMs)
  const type = fit(a.type, TYPE_MAX)
  const tail = agentTail(a, now)
  // cada agente pulsa e corre fora de fase do vizinho
  const head: Part[] = a.state === 'running'
    ? [
        // com o palco ligado, a faísca do agente tem a cor do ajudante dele em cena
        { text: fx.isStill ? IDLE_GLYPH : spin(fr, index * 3), color: fx.hasStage ? tintOf(a.id) : 'claude', bold: true },
        { text: ' ' },
        // o nome surge de faíscas quando o agente nasce; depois, o brilho passa por ele
        ...(fx.isFull ? (reveal(type, age(a.startedAt), seedOf(a.id)) ?? shimmer(type, fr + index * 5)) : [{ text: type, bold: true }]),
        ...(fx.isStill ? [] : [{ text: ' ' }, ...trail(fr + index * 2, AGENT_TRAIL_WIDTH)]),
      ]
    : [
        GLYPH[a.state],
        { text: ' ' },
        { text: type, dim: a.state !== 'failed' },
        ...(fx.isFull && a.state === 'done' && a.endedAt !== undefined ? burst(age(a.endedAt)) : []),
      ]
  const room = max - partsWidth(head) - 2 - TAIL_GAP - partsWidth(tail)
  const description = a.description && room >= DESC_MIN ? [{ text: `  ${fit(a.description, room)}`, dim: true }] : []
  return { parts: [...head, ...description], tail }
}

const RANK: Record<AgentState, number> = { running: 0, waiting: 1, failed: 2, done: 3 }

// Rodando primeiro (o mais antigo no topo), depois esperando, depois os que acabaram (o mais recente primeiro).
export const sortAgents = (list: readonly Agent[]): Agent[] =>
  [...list].sort(
    (a, b) =>
      RANK[a.state] - RANK[b.state] ||
      (a.endedAt !== undefined && b.endedAt !== undefined ? b.endedAt - a.endedAt : a.startedAt - b.startedAt) ||
      a.id.localeCompare(b.id),
  )

export type CardInput = {
  figures: Figures
  main: Main
  agents: readonly Agent[]
  now: number
  frame: number
  isWorking: boolean
  max?: number
  /** Os ajustes da aba ⚙; os padrões quando ausentes. */
  settings?: Settings
  /** As linhas do palco, já desenhadas; com elas, o placar do palco faz as vezes da linha de trabalho. */
  stage?: readonly Line[]
  /** Quantas linhas de agente cabem na faixa; os ajustes mandam quando o número deles é menor. */
  agentRows?: number
}

// Puro: as linhas da barra, na largura `max`. Não há linha de contexto: é sobre custo, modelo e quem trabalha.
// Quando cabe, modelo fica à esquerda e custo e limites encostam à direita da mesma linha; senão, empilham.
export const cardLines = (input: CardInput): Line[] => {
  const { figures: f, main: m, agents: list, now, frame: fr, isWorking, max = DEFAULT_WIDTH, settings: s = DEFAULT_SETTINGS, stage = [], agentRows = Infinity } = input
  const fx = effectsOf(s)
  const head = headLine(f, isWorking, fr, fx)
  const cost = costLine(f, m, now, s.showTurnCost)
  const limits = s.showLimits ? limitsLine(f, now) : null
  const top: Line = { parts: head.parts, tail: [...cost.parts, ...(limits ? [{ text: '  ·  ', dim: true }, ...limits.parts] : [])] }
  const isOneRow = lineWidth(top) + BUTTONS_WIDTH <= max
  const work = isWorking && m.startedAt > 0 && !stage.length ? [workLine(m, now, fr, fx)] : []
  const sorted = sortAgents(list)
  const shown = sorted.slice(0, Math.max(0, Math.min(s.maxAgents, agentRows)))
  const hiddenCount = sorted.length - shown.length
  return [
    ...(isOneRow ? [top, ...stage, ...work] : [head, cost, ...stage, ...work, ...(limits ? [limits] : [])]),
    ...shown.map((a, n) => agentLine(a, now, fr, n, max, fx)),
    ...(hiddenCount > 0 ? [{ parts: [{ text: STRINGS.more(hiddenCount), dim: true }] }] : []),
  ]
}
