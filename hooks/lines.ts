import type { SessionUsage } from 'claude-code'

import { contextLine, fromContext } from './context-line'
import type { CompactState } from './context-line'
import { levelLine } from './level'
import { IDLE_GLYPH, burst, reveal, seedOf, shimmer, trail } from './effects'
import { PENDING, fit, fmtCost, fmtEta, fmtSoon, fmtSpan, fmtSpark, fmtTokens, prettyModel } from './format'
import { stringsOf } from './i18n'
import type { Strings } from './i18n'
import { fullIn } from './pace'
import type { Window } from './pace'
import { TAIL_GAP, lineWidth, partsWidth } from './parts'
import type { Line, Part } from './parts'
import { DEFAULT_SETTINGS, FULL_EFFECTS, effectsOf } from './settings'
import type { Effects } from './settings'
import { tintOf } from './palette'
import { EFFORTS, idleSpark, sparkAt, tierOf } from './power'
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
const DESC_ROOM = 16 // com menos colunas que isso para a descrição, o gráfico de atividade do agente sai antes dela
const SPARK_WIDTH = 8 // as barras do gráfico de atividade de um agente
const MIN_AGENT_COST = 0.005 // abaixo disso arredonda para $0.00: não mostra
const MIN_DAY_GAP = 0.005 // o custo do dia só aparece quando difere do da sessão
const SOON_MS = 15 * 60_000 // uma janela de limite que enche em menos que isso é urgente
const DEPTH_MAX = 2 // um agente de agente recua até esse tanto
const VIEW_JOIN = ' · ' // entre o nome e a descrição do agente cuja transcrição está na tela
export { EFFORTS }

/**
 * O lugar do palco entre as linhas da barra, quando ele não é texto (uma imagem, uma grade de blocos,
 * um SVG): quem desenha a barra reconhece esta linha e põe ali o elemento dele.
 */
export const STAGE_SLOT: Line = { parts: [] }

// Os textos de quem chama uma linha sem dizer o idioma: os do idioma padrão.
const BASE = stringsOf(DEFAULT_SETTINGS.language)

const levelColor = (pct: number) => (pct >= 85 ? 'error' : pct >= 60 ? 'warning' : 'claude')

// Custo, limites e contexto, de session.measure ou de $.session.usage().
export const fromUsage = (u: Pick<SessionUsage, 'rateLimits' | 'cost'> & Partial<Pick<SessionUsage, 'context'>>): Pick<Figures, 'costUsd' | 'fiveHour' | 'week' | 'context'> => {
  const find = (kind: string) => {
    const r = u.rateLimits.find(l => l.kind === kind)
    return r ? { pct: r.percentUsed, resetsAt: r.resetsAt } : undefined
  }
  return { costUsd: u.cost?.usd, fiveHour: find('five_hour'), week: find('seven_day'), context: fromContext(u.context) }
}

// "❂ Fable 5.2 · high": a faísca é a da classe do modelo (do pontinho de Haiku ao selo de Fable); pulsa
// enquanto o turno roda e fica apagada fora dele. Modelo e effort são clicáveis: cada um abre o seu seletor.
const headLine = (f: Figures, isWorking: boolean, fr: number, fx: Effects, t: Strings): Line => {
  const tier = tierOf(f.model)
  return {
    parts: [
      !isWorking ? { text: `${idleSpark(tier)} `, dim: true }
        : { text: `${fx.isStill ? idleSpark(tier) : sparkAt(tier, fr)} `, color: 'claude', bold: true },
      { text: f.model ? prettyModel(f.model) : PENDING, color: 'claude', bold: true, action: 'model' },
      { text: ' · ', dim: true },
      f.effort
        ? { text: f.effort, ...(EFFORTS.includes(f.effort) && { color: 'claude' }), action: 'effort' }
        : { text: t.noEffort, dim: true, action: 'effort' },
    ],
  }
}

// "$1.23 sessão · turno +$0.04 · hoje $9.80": o total aceso por um instante quando cresce. O custo de
// hoje é o de todas as sessões somadas: só aparece quando difere do desta (outra sessão gastou, ou esta
// vem de ontem).
const costLine = (f: Figures, m: Main, now: number, showTurn: boolean, t: Strings, dayUsd: number | undefined): Line => {
  if (f.costUsd === undefined) return { parts: [{ text: t.noCost, dim: true }, { text: PENDING, dim: true }] }
  const isFresh = f.costMovedAt !== undefined && now >= f.costMovedAt && now - f.costMovedAt < FLASH_MS
  const turn = m.costAtStart === null ? 0 : f.costUsd - m.costAtStart
  const hasDay = dayUsd !== undefined && Math.abs(dayUsd - f.costUsd) >= MIN_DAY_GAP
  return {
    parts: [
      { text: fmtCost(f.costUsd), bold: true, ...(isFresh && { color: 'claude' }) },
      ...(isFresh ? [{ text: ' ▲', color: 'claude' }] : []),
      { text: t.session, dim: true },
      ...(showTurn && turn >= MIN_TURN_COST ? [{ text: ' · ', dim: true }, { text: `${t.turn}${fmtCost(turn)}` }] : []),
      ...(hasDay ? [{ text: ' · ', dim: true }, { text: `${t.today}${fmtCost(dayUsd)}`, dim: true }] : []),
    ],
  }
}

// " · 14 tools · 2 falhas · Bash": o que um turno conta depois do tempo dele.
const countParts = (tools: number, fails: number | undefined, lastTool: string | null, t: Strings): Part[] => [
  ...(tools > 0 ? [{ text: ` · ${t.tools(tools)}`, dim: true }] : []),
  ...(fails ? [{ text: ' · ', dim: true }, { text: t.fails(fails), color: 'error' }] : []),
  ...(lastTool ? [{ text: ' · ', dim: true }, { text: lastTool, color: 'claude' }] : []),
]

/** "1m12s · 14 tools · Bash": o placar do turno, para o canto do palco. */
export const hudParts = (m: Main, now: number, t: Strings = BASE): Part[] => [
  { text: fmtSpan(now - m.startedAt), dim: true },
  ...countParts(m.tools, m.fails, m.lastTool, t),
]

// "✳✶✻····· 1m12s · 14 tools · Bash": o turno do loop principal, enquanto roda.
const workLine = (m: Main, now: number, fr: number, fx: Effects, t: Strings): Line => ({
  parts: [
    ...(fx.isStill ? [{ text: IDLE_GLYPH, color: 'claude' }] : trail(fr)),
    { text: ` ${fmtSpan(now - m.startedAt)}` },
    ...countParts(m.tools, m.fails, m.lastTool, t),
  ],
})

// `window` diz qual janela é, para a previsão: no ritmo de agora, em quanto tempo ela enche.
const limitParts = (label: string, window: Window, l: Limit, now: number, t: Strings): Part[] => {
  const on = Math.min(LIMIT_GAUGE, Math.max(0, Math.round((l.pct * LIMIT_GAUGE) / 100)))
  const color = levelColor(l.pct)
  const eta = fmtEta(l.resetsAt, now)
  const full = fullIn(window, l, now)
  return [
    { text: `${label} `, dim: true },
    ...(on > 0 ? [{ text: '▰'.repeat(on), color }] : []),
    ...(on < LIMIT_GAUGE ? [{ text: '▱'.repeat(LIMIT_GAUGE - on), color: 'subtle' }] : []),
    { text: ` ${Math.round(l.pct)}%`, ...(color === 'claude' ? { dim: true } : { color }) },
    ...(eta ? [{ text: ` ↻${eta}`, dim: true }] : []),
    // só quando ela enche antes de zerar: senão não há o que avisar
    ...(full !== null ? [{ text: ` ${t.fullIn(fmtSoon(full))}`, color: full < SOON_MS ? 'error' : 'warning' }] : []),
  ]
}

// "5h ▰▰▱▱▱ 42% ↻2h10m enche em ~40m · 7d ▰▱▱▱▱ 18%": só as janelas que têm leitura.
const limitsLine = (f: Figures, now: number, t: Strings): Line | null => {
  const windows = [
    ...(f.fiveHour ? [limitParts('5h', 'fiveHour', f.fiveHour, now, t)] : []),
    ...(f.week ? [limitParts('7d', 'week', f.week, now, t)] : []),
  ]
  if (!windows.length) return null
  return { parts: windows.flatMap((w, n) => (n > 0 ? [{ text: ' · ', dim: true }, ...w] : w)) }
}

const GLYPH: Record<Exclude<AgentState, 'running'>, Part> = {
  waiting: { text: '◌', dim: true },
  done: { text: '✓', color: 'success' },
  failed: { text: '✗', color: 'error' },
}

// O que fica à direita na linha de um agente: o gráfico de atividade (as subidas dos tokens dele), o
// tempo, as ferramentas, as falhas, o custo e a última ferramenta; ou como terminou.
const agentTail = (a: Agent, now: number, t: Strings, hasSpark: boolean): Part[] => {
  if (a.state === 'waiting') return [{ text: t.waiting, dim: true }]
  const span = fmtSpan((a.endedAt ?? now) - a.startedAt)
  const cost = a.costUsd !== undefined && a.costUsd >= MIN_AGENT_COST ? fmtCost(a.costUsd) : ''
  if (a.state === 'failed') return [{ text: `${t.failed} · ${span}`, color: 'error' }]
  if (a.state === 'done') return [{ text: [span, a.tokens ? fmtTokens(a.tokens) : '', cost].filter(Boolean).join(' · '), dim: true }]
  const spark = hasSpark ? fmtSpark(a.samples ?? [], SPARK_WIDTH) : ''
  return [
    ...(spark ? [{ text: `${spark} `, dim: true }] : []),
    { text: span },
    ...(a.tools > 0 ? [{ text: ` · ${t.tools(a.tools)}`, dim: true }] : []),
    ...(a.fails ? [{ text: ' · ', dim: true }, { text: t.fails(a.fails), color: 'error' }] : []),
    ...(cost ? [{ text: ` · ${cost}`, dim: true }] : []),
    ...(a.lastTool ? [{ text: ' · ', dim: true }, { text: a.lastTool, color: 'claude' }] : []),
  ]
}

// "✶ Explore ✳✶✻··  buscar rotas HLS   ▂▅▇▃ 12s · 4 tools · $0.12 · Grep": a descrição cede espaço antes
// de tudo, e antes dela o gráfico de atividade. O que se lê depois do nome é o que o agente faz agora
// (o resumo que o engine guarda dele), ou a descrição da tarefa enquanto não há um.
// `isViewed`: a transcrição dele está na tela, no lugar da conversa principal: o nome vai sublinhado.
// `depth`: quantos agentes acima dele o chamaram: a linha recua, com `└` na frente.
export const agentLine = (
  a: Agent, now: number, fr: number, index: number, max: number, fx: Effects = FULL_EFFECTS, t: Strings = BASE, isViewed = false, depth = 0,
): Line => {
  const age = (since: number) => Math.floor((now - since) / fx.frameMs)
  const type = fit(a.type || t.agent, TYPE_MAX) // um agente cujo tipo ainda não chegou é só "agente"
  const tier = tierOf(a.model)
  const indent: Part[] = depth > 0 ? [{ text: `${'  '.repeat(Math.min(depth, DEPTH_MAX) - 1)}└ `, color: 'subtle' }] : []
  // o nome surge de faíscas quando o agente nasce; depois, o brilho passa por ele
  const name: Part[] = a.state !== 'running' ? [{ text: type, dim: a.state !== 'failed' }]
    : fx.isFull ? (reveal(type, age(a.startedAt), seedOf(a.id)) ?? shimmer(type, fr + index * 5))
    : [{ text: type, bold: true }]
  const named = isViewed ? name.map(p => ({ ...p, underline: true })) : name
  // cada agente pulsa e corre fora de fase do vizinho
  const head: Part[] = a.state === 'running'
    ? [
        ...indent,
        // a faísca é a da classe do modelo do agente; com o palco ligado, na cor do ajudante dele em cena
        { text: fx.isStill ? idleSpark(tier) : sparkAt(tier, fr, index * 3), color: fx.hasStage ? tintOf(a.id) : 'claude', bold: true },
        { text: ' ' },
        ...named,
        ...(fx.isStill ? [] : [{ text: ' ' }, ...trail(fr + index * 2, AGENT_TRAIL_WIDTH)]),
      ]
    : [
        ...indent,
        GLYPH[a.state],
        { text: ' ' },
        ...named,
        ...(fx.isFull && a.state === 'done' && a.endedAt !== undefined ? burst(age(a.endedAt)) : []),
      ]
  const roomBeside = (tail: readonly Part[]) => max - partsWidth(head) - 2 - TAIL_GAP - partsWidth(tail)
  const what = a.label || a.description
  const roomy = agentTail(a, now, t, true)
  const tail = !what || roomBeside(roomy) >= DESC_ROOM ? roomy : agentTail(a, now, t, false)
  const room = roomBeside(tail)
  const description = what && room >= DESC_MIN ? [{ text: `  ${fit(what, room)}`, dim: true }] : []
  return { parts: [...head, ...description], tail, agentId: a.id }
}

/**
 * "vendo Explore · buscar rotas HLS": de quem é a transcrição que está na tela, no lugar da conversa
 * principal. Cabe em `room` colunas: a descrição cede espaço, e sai quando não sobra nenhum. Um agente
 * que a barra já não tem (`undefined`) é só "agente".
 */
export const viewParts = (a: Agent | undefined, room: number, t: Strings = BASE): Part[] => {
  const head: Part[] = [{ text: t.viewing, dim: true }, { text: fit(a?.type || t.agent, TYPE_MAX), color: 'claude', bold: true }]
  const left = room - partsWidth(head) - VIEW_JOIN.length
  return a?.description && left >= DESC_MIN ? [...head, { text: VIEW_JOIN, dim: true }, { text: fit(a.description, left), dim: true }] : head
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

/** Um agente na ordem da barra, e quantos agentes acima dele o chamaram. */
export type Nested = { agent: Agent; depth: number }

/**
 * Puro: os agentes na ordem da barra, com os que um agente chamou logo abaixo dele. Quem foi chamado
 * por um agente que a barra já não mostra fica na raiz; e um agente nunca some por causa de um laço
 * na lista (dois que se dizem pais um do outro).
 */
export const nestAgents = (list: readonly Agent[]): Nested[] => {
  const sorted = sortAgents(list)
  const ids = new Set(sorted.map(a => a.id))
  const walk = (a: Agent, depth: number, above: readonly string[]): Nested[] =>
    above.includes(a.id) ? [] : [{ agent: a, depth }, ...sorted.filter(c => c.parentId === a.id).flatMap(c => walk(c, depth + 1, [...above, a.id]))]
  const tree = sorted.filter(a => !a.parentId || !ids.has(a.parentId)).flatMap(a => walk(a, 0, []))
  const placed = new Set(tree.map(n => n.agent.id))
  return [...tree, ...sorted.filter(a => !placed.has(a.id)).map(agent => ({ agent, depth: 0 }))]
}

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
  /**
   * O palco mostra o placar do turno. Uma imagem não leva texto: sem o placar nele, a linha de
   * trabalho volta, logo abaixo do palco.
   */
  hasStageHud?: boolean
  /** Quantas linhas de agente cabem na faixa; os ajustes mandam quando o número deles é menor. */
  agentRows?: number
  /** O agente cuja transcrição está na tela, no lugar da conversa principal: a linha dele vai marcada. */
  viewedId?: string
  /** O custo de hoje somado entre as sessões; ausente quando a barra não tem como saber. */
  dayUsd?: number
  /** Onde está o botão de compactar da linha do contexto. */
  compact?: CompactState
  /** Os tokens de sempre, de onde sai o nível; ausente quando a barra não tem como saber. */
  tokens?: number
}

// Puro: as linhas da barra, na largura `max`. Quando cabe, modelo fica à esquerda e custo e limites
// encostam à direita da mesma linha; senão, empilham. A linha do contexto vem logo abaixo, antes do palco.
export const cardLines = (input: CardInput): Line[] => {
  const { figures: f, main: m, agents: list, now, frame: fr, isWorking, max = DEFAULT_WIDTH, settings: s = DEFAULT_SETTINGS, stage = [], hasStageHud = true, agentRows = Infinity, viewedId, dayUsd, compact = 'idle', tokens } = input
  const fx = effectsOf(s)
  const t = stringsOf(s.language)
  const head = headLine(f, isWorking, fr, fx, t)
  const cost = costLine(f, m, now, s.showTurnCost, t, s.showDayCost ? dayUsd : undefined)
  const limits = s.showLimits ? limitsLine(f, now, t) : null
  const top: Line = { parts: head.parts, tail: [...cost.parts, ...(limits ? [{ text: '  ·  ', dim: true }, ...limits.parts] : [])] }
  const isOneRow = lineWidth(top) + BUTTONS_WIDTH <= max
  const work = isWorking && m.startedAt > 0 && (!stage.length || !hasStageHud) ? [workLine(m, now, fr, fx, t)] : []
  const nested = nestAgents(list)
  const shown = nested.slice(0, Math.max(0, Math.min(s.maxAgents, agentRows)))
  const hiddenCount = nested.length - shown.length
  const context = s.showContext && f.context ? [contextLine(f.context, compact, t)] : []
  const level = s.showLevel && tokens !== undefined ? [levelLine(tokens, t.levels, t.levels.decimal)] : []
  return [
    ...(isOneRow ? [top, ...context, ...level, ...stage, ...work] : [head, cost, ...context, ...level, ...stage, ...work, ...(limits ? [limits] : [])]),
    ...shown.map(({ agent, depth }, n) => agentLine(agent, now, fr, n, max, fx, t, agent.id === viewedId, depth)),
    ...(hiddenCount > 0 ? [{ parts: [{ text: t.more(hiddenCount), dim: true }] }] : []),
  ]
}
