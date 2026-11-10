import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register, RenderElement, SessionUsage } from 'claude-code'

import { SettingsPanel } from './settings-panel'
import { DEFAULT_SETTINGS, FULL_EFFECTS, accentColor, effectsOf, sanitize } from './settings'
import type { Effects } from './settings'
import type {
  StatusAgent as Agent,
  StatusAgentState as AgentState,
  StatusFigures as Figures,
  StatusLimit as Limit,
  StatusMain as Main,
  StatusPicker as Picker,
  StatusSettings as Settings,
} from '../types'

const EMPTY: Figures = { model: null, effort: null }
const IDLE: Main = { startedAt: 0, tools: 0, lastTool: null, costAtStart: null }
const NO_AGENTS: Agent[] = []

const figures = atom({ plugin: 'legends-claude', key: 'figures' } as const, EMPTY)
const main = atom({ plugin: 'legends-claude', key: 'main' } as const, IDLE)
const agents = atom({ plugin: 'legends-claude', key: 'agents' } as const, NO_AGENTS)
const frame = atom({ plugin: 'legends-claude', key: 'frame' } as const, 0)
const isHidden = atom({ plugin: 'legends-claude', key: 'isHidden' } as const, false)
const picker = atom({ plugin: 'legends-claude', key: 'picker' } as const, null as Picker)
const settings = atom({ plugin: 'legends-claude', key: 'settings' } as const, DEFAULT_SETTINGS)
const SETTINGS_KEY = 'settings' // a chave no $.store: os ajustes valem para todas as sessões

const COMMAND = 'legends-claude'
const MIN_COLUMNS = 60 // mais estreito que isso o card cobriria a conversa: não desenha
const DEFAULT_WIDTH = 100 // largura das linhas quando quem chama não diz (a barra passa a da faixa)
const BAR_RIGHT_PAD = 1 // a barra vai de ponta a ponta da faixa, menos essa folga à direita
const BUTTONS_WIDTH = 6 // os botões ' ⚙ ' e ' ▾ ' à direita da primeira linha
const TAIL_GAP = 2 // colunas entre o texto de uma linha e o que fica encostado à direita
const HIDDEN_RIGHT_PAD = 5 // livre do [-] que o Claude Code desenha no canto da faixa
const RECONCILE_MS = 1_000 // a lista de agentes do engine é conferida no máximo uma vez por segundo
const FRAME_WRAP = 1_000_000
const LINGER_MS = 8_000 // um agente terminado fica esse tempo no card
const STALE_MS = 600_000 // um agente fora da lista do engine e mudo por esse tempo é dado como perdido
const FLASH_MS = 1_500 // quanto tempo o custo fica aceso depois de crescer
const COST_DECIMALS = 2 // $1.75, como um preço
const MIN_TURN_COST = 0.005 // abaixo disso arredonda para $0.00: não mostra
const LIMIT_GAUGE = 5
const TRAIL_WIDTH = 8 // o rastro de faíscas da linha de trabalho
const AGENT_TRAIL_WIDTH = 5 // o rastro de cada agente rodando
const WAVE_SPEED = 4 // colunas que o pulso da régua anda por quadro
const WAVE_WIDTH = 4 // colunas acesas de cada lado da frente do pulso
const WAVE_REST = 8 // colunas "fora da régua" que o pulso percorre antes de recomeçar: a pausa
const REVEAL_LEAD = 1 // quadros de faíscas antes de a primeira letra assentar
const REVEAL_JITTER = 0.35 // fração das letras que assenta um quadro depois da vizinha
const SHIMMER_GAP = 6 // quadros de pausa entre uma passada do brilho e a seguinte
const TYPE_MAX = 20
const TOOL_MAX = 14
const DESC_MIN = 6
const PENDING = '—'
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
// Os apelidos que o /model aceita: cada um aponta sempre para a versão mais nova da família.
const MODELS = [
  { value: 'fable', label: 'Fable' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
] as const

// A faísca do Claude pulsando: cresce de · até ✽ e volta, como o giro do próprio Claude Code.
export const SPINNER = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']
const IDLE_GLYPH = '✻'

export const STRINGS = {
  hide: ' ▾ ', show: '◂ status', settings: ' ⚙ ', saveFailed: (why: string) => `Não deu para salvar os ajustes: ${why}`,
  opened: 'Ajustes abertos na barra.', session: ' sessão', turn: 'turno +', noCost: 'custo ',
  noEffort: 'effort', pickModel: 'modelo ', pickEffort: 'effort ', current: '● ', close: ' ✕ ',
  switchFailed: (what: string, why: string) => `Não deu para trocar ${what}: ${why}`,
  waiting: 'aguardando', failed: 'falhou', more: (n: number) => `+${n} ${n === 1 ? 'agente' : 'agentes'}`,
  tools: (n: number) => `${n} ${n === 1 ? 'tool' : 'tools'}`,
  hidden: 'Card de status escondido.', shown: 'Card de status visível.',
  tooNarrow: `Card de status visível; ele desenha quando o terminal tiver pelo menos ${MIN_COLUMNS} colunas.`,
  commandDescription: 'Mostra ou esconde a barra de status; "ajustes" abre a aba de ajustes',
} as const

/** Um trecho de linha; com `action`, um clique nele abre o seletor de modelo ou de effort. */
export type Part = { text: string; color?: string; dim?: boolean; bold?: boolean; action?: Switch }
/** O que um clique no cabeçalho troca: o modelo ou o effort. */
type Switch = 'model' | 'effort'
/** Uma linha do card: o texto e, opcionalmente, um trecho encostado à direita. */
export type Line = { parts: Part[]; tail?: Part[] }

// Colunas de terminal que um texto ocupa: caracteres largos (CJK, emoji) ocupam duas.
export const cols = (s: string) => {
  let n = 0
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    const isWide =
      (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1faff) || (c >= 0x20000 && c <= 0x3fffd)
    n += isWide ? 2 : 1
  }
  return n
}

// Corta o texto em `max` colunas, com reticências no fim.
export const fit = (s: string, max: number) => {
  if (cols(s) <= max) return s
  const out: string[] = []
  let n = 1 // as reticências
  for (const ch of s) {
    if (n + cols(ch) > max) break
    n += cols(ch)
    out.push(ch)
  }
  return `${out.join('')}…`
}

// Texto que vem do modelo (descrição de agente, nome de ferramenta): sem controles, escapes ou marcas bidi.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g
export const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? [...v.replace(UNSAFE, ' ')].slice(0, max).join('').replace(/\s+/g, ' ').trim() : ''

// O custo com duas casas e milhares agrupados: $1,234.57.
export const fmtCost = (usd: number) => {
  if (!Number.isFinite(usd)) return PENDING
  const [int = '0', frac = ''] = Math.abs(usd).toFixed(COST_DECIMALS).split('.')
  return `${usd < 0 ? '-' : ''}$${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`
}

// Duração: 12s, 1m02s, 1h05m.
export const fmtSpan = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000)), m = Math.floor(s / 60), h = Math.floor(m / 60)
  if (s < 60) return `${s}s`
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`
  return `${h}h${String(m % 60).padStart(2, '0')}m`
}

export const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M tok` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k tok` : `${n} tok`

export const fmtEta = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return ''
  const s = Math.floor((Date.parse(resetsAt) - now) / 1000)
  if (!(s > 0)) return ''
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d${h}h` : `${h}h${m}m`
}

// "claude-fable-5-2[1m]" -> "Fable 5.2 (1M)", "claude-opus-4-20250514" -> "Opus 4"; o resto como veio.
export const prettyModel = (id: string) => {
  const m = /^claude-([a-z]+)-(\d{1,2})(?:-(\d{1,2}))?(?:-\d{8})?(\[1m\])?$/.exec(id)
  if (!m || !m[1]) return id
  return `${m[1][0]?.toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}${m[4] ? ' (1M)' : ''}`
}

// "mcp__servidor__ferramenta" -> "ferramenta"; os outros nomes como vieram.
export const shortTool = (tool: string) => fit(clean(tool.split('__').pop() ?? tool, 80), TOOL_MAX)

export const spin = (f: number, offset = 0) => SPINNER[(f + offset) % SPINNER.length] ?? IDLE_GLYPH

// A cauda de um cometa de faíscas, da cabeça para trás.
const COMET: Part[] = [
  { text: '✻', color: 'claude', bold: true },
  { text: '✶', color: 'claude' },
  { text: '✳', color: 'claude', dim: true },
  { text: '✢', color: 'subtle' },
]
const TRAIL_DOT: Part = { text: '·', color: 'subtle' }

// Um cometa de faíscas que atravessa a trilha da esquerda para a direita e sai antes de voltar:
// ✻······· → ✶✻······ → ✳✶✻····· → … → ·······✢ → ✻·······
export const trail = (f: number, width = TRAIL_WIDTH): Part[] => {
  const head = f % (width + COMET.length)
  return Array.from({ length: width }, (_, i) => COMET[head - i] ?? TRAIL_DOT)
}

const isSameStyle = (a: Part, b: Part) => a.color === b.color && a.dim === b.dim && a.bold === b.bold && a.action === b.action

// Junta trechos vizinhos de mesmo estilo: menos pedaços para desenhar, o mesmo texto.
export const merge = (parts: readonly Part[]): Part[] =>
  parts.reduce<Part[]>((out, p) => {
    const last = out[out.length - 1]
    return last && isSameStyle(last, p) ? [...out.slice(0, -1), { ...last, text: last.text + p.text }] : [...out, p]
  }, [])

// Um número em [0, 1) que depende só das entradas: o "acaso" das animações, igual a cada redesenho.
export const noise = (a: number, b = 0) => {
  const mixed = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0
  const folded = Math.imul(mixed ^ (mixed >>> 15), 0x2c1b3c6d) >>> 0
  return ((folded ^ (folded >>> 12)) >>> 0) / 4294967296
}

const seedOf = (id: string) => [...id].reduce((n, ch) => (n * 31 + (ch.codePointAt(0) ?? 0)) | 0, 7)

// A régua de cima. Parada, é uma linha fina; com trabalho em curso, um pulso nasce no centro e corre
// para as duas pontas: grosso na frente, aceso logo atrás, e a régua volta a apagar depois que ele passa.
export const ruleParts = (width: number, fr: number, isActive: boolean): Part[] => {
  if (!isActive || width <= 0) return [{ text: '─'.repeat(Math.max(0, width)), color: 'subtle' }]
  const mid = (width - 1) / 2
  const front = (fr * WAVE_SPEED) % (mid + WAVE_WIDTH + WAVE_REST)
  return merge(
    Array.from({ length: width }, (_, i): Part => {
      const delta = Math.abs(Math.abs(i - mid) - front)
      if (delta < 1) return { text: '━', color: 'claude', bold: true }
      return delta <= WAVE_WIDTH ? { text: '─', color: 'claude' } : { text: '─', color: 'subtle' }
    }),
  )
}

// Um nome que surge de faíscas: cada letra ferve por alguns quadros e assenta, da esquerda para a
// direita com um atraso irregular. `null` quando todas já assentaram.
export const reveal = (text: string, age: number, seed = 0): Part[] | null => {
  const chars = [...text]
  const settlesAt = (i: number) => REVEAL_LEAD + Math.floor(i / 2) + (noise(i, seed) < REVEAL_JITTER ? 1 : 0)
  if (age < 0 || chars.every((_, i) => age >= settlesAt(i))) return null
  return merge(
    chars.map((ch, i): Part =>
      age >= settlesAt(i)
        ? { text: ch, bold: true }
        : { text: SPINNER[Math.floor(noise(i * 31 + age, seed) * 6)] ?? '·', color: 'claude', dim: true },
    ),
  )
}

// Um estouro de faíscas ao lado do ✓ de quem acabou de terminar: denso no começo, ralo no fim.
const BURST = ['✽  ', '✻✶ ', '✶✳✢', '✳✢·', '✢· ', '·  ']
export const burst = (age: number): Part[] => {
  const sparks = age >= 0 ? BURST[age] : undefined
  return sparks ? [{ text: ' ' }, { text: sparks, color: 'success' }] : []
}

// Um brilho que percorre o texto, uma letra por quadro, e descansa antes de voltar.
export const shimmer = (text: string, f: number): Part[] => {
  const chars = [...text]
  const at = f % (chars.length + SHIMMER_GAP)
  if (at >= chars.length) return [{ text, bold: true }]
  return [
    { text: chars.slice(0, at).join(''), bold: true },
    { text: chars[at] ?? '', color: 'claude', bold: true },
    { text: chars.slice(at + 1).join(''), bold: true },
  ].filter(p => p.text)
}

const levelColor = (pct: number) => (pct >= 85 ? 'error' : pct >= 60 ? 'warning' : 'claude')

const partsWidth = (parts: Part[]) => parts.reduce((n, p) => n + cols(p.text), 0)
export const lineWidth = (l: Line) => partsWidth(l.parts) + (l.tail?.length ? TAIL_GAP + partsWidth(l.tail) : 0)

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
        { text: fx.isStill ? IDLE_GLYPH : spin(fr, index * 3), color: 'claude', bold: true },
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
}

// Puro: as linhas da barra, na largura `max`. Não há linha de contexto: é sobre custo, modelo e quem trabalha.
// Quando cabe, modelo fica à esquerda e custo e limites encostam à direita da mesma linha; senão, empilham.
export const cardLines = (input: CardInput): Line[] => {
  const { figures: f, main: m, agents: list, now, frame: fr, isWorking, max = DEFAULT_WIDTH, settings: s = DEFAULT_SETTINGS } = input
  const fx = effectsOf(s)
  const head = headLine(f, isWorking, fr, fx)
  const cost = costLine(f, m, now, s.showTurnCost)
  const limits = s.showLimits ? limitsLine(f, now) : null
  const top: Line = { parts: head.parts, tail: [...cost.parts, ...(limits ? [{ text: '  ·  ', dim: true }, ...limits.parts] : [])] }
  const isOneRow = lineWidth(top) + BUTTONS_WIDTH <= max
  const work = isWorking && m.startedAt > 0 ? [workLine(m, now, fr, fx)] : []
  const sorted = sortAgents(list)
  const shown = sorted.slice(0, s.maxAgents)
  const hiddenCount = sorted.length - shown.length
  return [
    ...(isOneRow ? [top, ...work] : [head, cost, ...work, ...(limits ? [limits] : [])]),
    ...shown.map((a, n) => agentLine(a, now, fr, n, max, fx)),
    ...(hiddenCount > 0 ? [{ parts: [{ text: STRINGS.more(hiddenCount), dim: true }] }] : []),
  ]
}

const isLive = (a: Agent) => a.state === 'running' || a.state === 'waiting'
const isExpired = (a: Agent, now: number) => a.endedAt !== undefined && now - a.endedAt > LINGER_MS

const STATE_OF: Record<AgentInfo['status'], AgentState> = {
  pending: 'running', running: 'running', waiting: 'waiting', idle: 'waiting', completed: 'done', failed: 'failed', killed: 'failed',
}

const newAgent = (id: string, now: number): Agent => ({
  id, type: 'agente', description: '', model: null, state: 'running', startedAt: now, seenAt: now, tools: 0, lastTool: null,
})

// Puro: aplica `fn` ao agente `id`, criando a linha quando ainda não existe.
export const upsert = (rows: readonly Agent[], id: string, now: number, fn: (a: Agent) => Agent): Agent[] =>
  rows.some(a => a.id === id) ? rows.map(a => (a.id === id ? fn(a) : a)) : [...rows, fn(newAgent(id, now))]

// Puro: as linhas conferidas com a lista do engine. Quem acabou há tempo sai, quem a lista dá como
// terminado termina, quem roda sem linha ganha uma, e quem sumiu da lista e está mudo há muito é largado.
export const reconcileRows = (rows: readonly Agent[], listed: readonly AgentInfo[], now: number): Agent[] => {
  const byId = new Map(listed.map(i => [i.id, i]))
  const kept = rows
    .filter(a => !isExpired(a, now))
    .filter(a => !isLive(a) || byId.has(a.id) || now - a.seenAt <= STALE_MS)
    .map(a => {
      const info = byId.get(a.id)
      if (!info || !isLive(a)) return a
      const state = STATE_OF[info.status]
      return {
        ...a,
        state,
        type: a.type === 'agente' ? clean(info.type, 40) || a.type : a.type,
        description: a.description || clean(info.description, 120),
        ...(!isLive({ ...a, state }) && { endedAt: now }),
      }
    })
  const adopted = listed
    .filter(i => (i.status === 'running' || i.status === 'pending') && !rows.some(a => a.id === i.id))
    .map(i => ({ ...newAgent(i.id, now), type: clean(i.type, 40) || 'agente', description: clean(i.description, 120) }))
  return [...kept, ...adopted]
}

type Timer = ReturnType<EngineInterface['clock']['every']>

// Variáveis do módulo: um reload zera todas, e os timers do módulo anterior caem junto.
let ticker: Timer | null = null
let isTickBusy = false
let isBandWorking = false
let lastBandColumns = Infinity
let tickerMs = 0 // a cadência do ticker em curso: muda com a velocidade dos ajustes
let lastReconcileAt = -Infinity
let fx: Effects = FULL_EFFECTS // os efeitos em vigor, lidos dos ajustes
const reported = new Set<string>()

// Um erro de fundo aparece uma vez por origem, numa linha discreta: nunca é engolido, nunca vira enxurrada.
const report = ($: EngineInterface, where: string, err: unknown) => {
  if (reported.has(where)) return
  reported.add(where)
  $.ui.log(`legends-claude: ${where}: ${clean(err instanceof Error ? err.message : String(err), 200)}`)
}

const stopTicker = () => {
  ticker?.cancel()
  ticker = null
  tickerMs = 0
}

// Há o que animar: o turno, um agente rodando, ou o estouro de faíscas de quem acabou de terminar.
const hasWork = (list: readonly Agent[], now: number) =>
  isBandWorking ||
  list.some(a => a.state === 'running' || (fx.isFull && a.endedAt !== undefined && now - a.endedAt < BURST.length * fx.frameMs))

async function reconcile($: EngineInterface, now: number) {
  const listed = await $.agent.list()
  return update($, agents, rows => reconcileRows(rows, listed, now))
}

// Tira do card quem terminou há mais de LINGER_MS; fica marcado de novo enquanto restar alguém terminado.
async function purge($: EngineInterface) {
  try {
    const now = await $.clock.now()
    const rest = await update($, agents, rows => rows.filter(a => !isExpired(a, now)))
    if (!ticker && rest.some(a => a.endedAt !== undefined)) $.clock.after(LINGER_MS, () => void purge($))
  } catch (err) {
    report($, 'purge', err)
  }
}

// Um quadro: avança a animação, confere os agentes a cada segundo e para quando não há mais trabalho.
async function tick($: EngineInterface) {
  if (isTickBusy) return
  isTickBusy = true
  try {
    await update($, frame, f => (f + 1) % FRAME_WRAP)
    const now = await $.clock.now()
    const isDue = now - lastReconcileAt >= RECONCILE_MS
    if (isDue) lastReconcileAt = now
    const list = isDue ? await reconcile($, now) : await read($, agents)
    if (hasWork(list, now)) return
    stopTicker()
    if (list.length) $.clock.after(LINGER_MS, () => void purge($))
  } catch (err) {
    report($, 'tick', err)
  } finally {
    isTickBusy = false
  }
}

// Um ticker só, na cadência dos ajustes: trocar a velocidade troca o ticker em curso.
const ensureTicker = ($: EngineInterface) => {
  if (ticker && tickerMs === fx.frameMs) return
  stopTicker()
  tickerMs = fx.frameMs
  ticker = $.clock.every(fx.frameMs, () => void tick($))
}

async function touchAgent($: EngineInterface, id: string, fn: (a: Agent, now: number) => Agent) {
  const now = await $.clock.now()
  await update($, agents, rows => upsert(rows, id, now, a => fn(a, now)))
  ensureTicker($)
}

// Uma chamada de ferramenta: conta para o agente que a fez, ou para o turno principal.
async function noteTool($: EngineInterface, agentId: string | undefined, tool: string) {
  try {
    const lastTool = shortTool(tool)
    if (agentId) await touchAgent($, agentId, (a, now) => ({ ...a, tools: a.tools + 1, lastTool, seenAt: now }))
    else await update($, main, m => ({ ...m, tools: m.tools + 1, lastTool }))
  } catch (err) {
    report($, 'tool.call', err)
  }
}

// Um clique num item do seletor: roda /model ou /effort como se a pessoa tivesse digitado. O comando
// entra na fila e roda quando a sessão fica ociosa; a troca é a da sessão, não um desvio do mod.
async function switchTo($: EngineInterface, command: Switch, value: string) {
  try {
    await update($, picker, () => null)
    await $.command.run({ command, args: value })
    const model = await $.session.model()
    await update($, figures, f => ({ ...f, model: model || f.model, ...(command === 'effort' && { effort: value }) }))
  } catch (err) {
    $.ui.toast(STRINGS.switchFailed(command, clean(err instanceof Error ? err.message : String(err), 120)))
  }
}

// Uma mudança na aba de ajustes: vale na hora nesta sessão e fica salva para as próximas.
async function applySettings($: EngineInterface, change: (s: Settings) => Settings) {
  try {
    const next = await update($, settings, s => sanitize(change(s)))
    fx = effectsOf(next)
    if (ticker) ensureTicker($) // a velocidade pode ter mudado
    await $.store.set(SETTINGS_KEY, next)
  } catch (err) {
    $.ui.toast(STRINGS.saveFailed(clean(err instanceof Error ? err.message : String(err), 120)))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      isBandWorking = false
      await $.command.register({ name: COMMAND, description: STRINGS.commandDescription, argumentHint: '[ajustes]' })
      // Os ajustes salvos valem antes do primeiro desenho; um valor estragado volta ao padrão campo a campo.
      const saved = await update($, settings, () => sanitize(undefined))
      fx = effectsOf(saved)
      try {
        const stored = sanitize(await $.store.get(SETTINGS_KEY))
        fx = effectsOf(await update($, settings, () => stored))
      } catch (err) {
        report($, 'settings', err)
      }
      const model = await $.session.model()
      const usage = fromUsage(await $.session.usage())
      await update($, figures, f => ({ ...f, ...usage, model: model || f.model }))
      // O que o módulo anterior deixou (o estado sobrevive ao reload) é conferido com o engine.
      const startedAt = await $.clock.now()
      const list = await reconcile($, startedAt)
      if (hasWork(list, startedAt)) ensureTicker($)
      else if (list.length) $.clock.after(LINGER_MS, () => void purge($))
    } catch (err) {
      report($, 'session.start', err)
    }
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    if (/^\s*(ajustes|settings|config)\s*$/i.test(e.args)) {
      await update($, isHidden, () => false)
      await update($, picker, () => 'settings')
      return { text: STRINGS.opened }
    }
    const hidden = await update($, isHidden, h => !h)
    if (hidden) return { text: STRINGS.hidden }
    return { text: lastBandColumns < MIN_COLUMNS ? STRINGS.tooNarrow : STRINGS.shown }
  })

  on('turn.start', async ($, e, next) => {
    try {
      if (e.agentId) {
        // Um agente que volta a rodar (acordado por uma mensagem) recomeça a contagem.
        await touchAgent($, e.agentId, (a, now) => ({
          ...a, state: 'running', seenAt: now, endedAt: undefined, tokens: undefined,
          ...(a.endedAt !== undefined && { startedAt: now, tools: 0, lastTool: null }),
        }))
      } else {
        isBandWorking = true
        const now = await $.clock.now()
        const costAtStart = (await read($, figures)).costUsd ?? 0
        await update($, main, () => ({ startedAt: now, tools: 0, lastTool: null, costAtStart }))
        ensureTicker($)
      }
    } catch (err) {
      report($, 'turn.start', err)
    }
    return next(e)
  })

  // O modelo e o effort de cada pedido: do loop principal para o cabeçalho, de um agente para a linha dele.
  on('turn.step', async function* ($, e, next) {
    try {
      if (e.agentId) {
        const row = (await read($, agents)).find(a => a.id === e.agentId)
        if (row?.model !== e.model) await touchAgent($, e.agentId, (a, now) => ({ ...a, model: e.model, seenAt: now }))
      } else {
        const effort = e.effort === undefined ? null : String(e.effort)
        const f = await read($, figures)
        if (f.model !== e.model || f.effort !== effort) await update($, figures, g => ({ ...g, model: e.model, effort }))
      }
    } catch (err) {
      report($, 'turn.step', err)
    }
    return yield* next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    try {
      if (result.agentId) {
        const model = result.model
        await touchAgent($, result.agentId, (a, now) => ({
          ...a, type: clean(e.subagentType, 40) || a.type, description: clean(e.description, 120), model, seenAt: now,
        }))
      }
    } catch (err) {
      report($, 'agent.spawn', err)
    }
    return result
  })

  on('tool.call', ($, e, next) => {
    void noteTool($, e.agentId, String(e.tool)) // sem esperar: a chamada não fica atrás do card
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      if (e.agentId) {
        const state: AgentState = e.isAborted || e.reason === 'error' ? 'failed' : 'done'
        const u = e.usage
        const tokens = u ? u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens : undefined
        await touchAgent($, e.agentId, (a, now) => ({ ...a, state, endedAt: now, seenAt: now, tokens }))
      } else {
        isBandWorking = false
        ensureTicker($) // o próximo quadro vê que o trabalho acabou, redesenha e para
      }
    } catch (err) {
      report($, 'turn.complete', err)
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    try {
      const usage = fromUsage(e)
      const hasCostMoved = e.changed.includes('cost')
      const now = hasCostMoved ? await $.clock.now() : undefined
      await update($, figures, f => ({ ...f, ...usage, ...(now !== undefined && { costMovedAt: now }) }))
      // Fora de um turno ninguém redesenha sozinho: um quadro a mais apaga o destaque do custo.
      if (hasCostMoved) $.clock.after(FLASH_MS + 50, () => void update($, frame, f => (f + 1) % FRAME_WRAP).catch(err => report($, 'flash', err)))
    } catch (err) {
      report($, 'session.measure', err)
    }
    return next(e)
  })

  // A faixa acima do prompt vira uma barra na largura toda.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    lastBandColumns = e.props.bodyColumns
    isBandWorking = e.props.isWorking
    if (e.props.hasSurvey || e.props.bodyColumns < MIN_COLUMNS) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    // O que os plugins abaixo desenharam aqui fica, acima do card.
    const below = await next(e).catch(() => null)
    const withBelow = (ours: RenderElement): RenderElement => (below ? <Box flexDirection="column">{below}{ours}</Box> : ours)
    const setHidden = (hidden: boolean) => update($, isHidden, () => hidden)

    if (await read($, isHidden))
      return withBelow(
        <Box justifyContent="flex-end" paddingRight={HIDDEN_RIGHT_PAD}>
          <Button key="show" label={STRINGS.show} dimColor onPress={() => setHidden(false)} />
        </Box>,
      )

    const list = await read($, agents)
    const now = await $.clock.now()
    const isActive = hasWork(list, now)
    if (isActive) ensureTicker($)
    // A barra ocupa a faixa toda, de ponta a ponta.
    const width = e.props.bodyColumns - BAR_RIGHT_PAD
    const f = await read($, figures)
    const s = await read($, settings)
    const fr = await read($, frame)
    const lines = cardLines({ figures: f, main: await read($, main), agents: list, now, frame: fr, isWorking: e.props.isWorking, max: width, settings: s })
    const open = await read($, picker)
    const toggle = (kind: Exclude<Picker, null>) => update($, picker, p => (p === kind ? null : kind))
    // A cor de destaque dos ajustes entra aqui, no desenho: as linhas falam 'claude', a barra pinta com a escolhida.
    const accent = accentColor(s)
    const paint = (color: string | undefined) => (color === 'claude' ? accent : color)
    const run = (q: Part) => <Text color={paint(q.color)} dimColor={q.dim} bold={q.bold}>{q.text}</Text>
    const gap = (l: Line, room: number) =>
      ' '.repeat(Math.max(l.tail?.length ? TAIL_GAP : 0, room - lineWidth(l) + (l.tail?.length ? TAIL_GAP : 0)))
    // Uma linha é um Text só, cortado na borda da barra; o trecho da direita encosta na borda.
    const row = (l: Line, room: number) => (
      <Text wrap="truncate-end">
        {l.parts.map(run)}
        {gap(l, room)}
        {(l.tail ?? []).map(run)}
      </Text>
    )
    const [first = { parts: [] }, ...rest] = lines
    // Na primeira linha, modelo e effort são botões: um clique abre o seletor logo abaixo.
    const headParts = first.parts.map(q => {
      const action = q.action
      return action ? <Button key={action} plain onPress={() => void toggle(action)}>{run(q)}</Button> : run(q)
    })
    const current = f.model ? prettyModel(f.model).toLowerCase() : ''
    const choices =
      open === 'settings' ? []
      : open === 'model'
        ? MODELS.map(m => ({ value: m.value, label: m.label, isCurrent: current.startsWith(m.value) }))
        : EFFORTS.map(level => ({ value: level, label: level, isCurrent: f.effort === level }))
    const pickerRow = open === 'model' || open === 'effort' ? (
      <Box key="picker">
        <Text dimColor>{open === 'model' ? STRINGS.pickModel : STRINGS.pickEffort}</Text>
        {choices.flatMap(c => [
          <Text> </Text>,
          <Button key={`pick-${c.value}`} plain onPress={() => void switchTo($, open, c.value)}>
            <Text color={c.isCurrent ? accent : undefined} bold={c.isCurrent}>{c.isCurrent ? `${STRINGS.current}${c.label}` : c.label}</Text>
          </Button>,
        ])}
        <Button key="pick-close" label={STRINGS.close} plain dimColor onPress={() => void toggle(open)} />
      </Box>
    ) : null

    return withBelow(
      <Box paddingRight={BAR_RIGHT_PAD}>
        <Box width={width} flexDirection="column">
          {s.showRule ? <Text key="rule" wrap="truncate-end">{ruleParts(width, fr, isActive && fx.isFull).map(run)}</Text> : null}
          <Box key="head">
            {headParts}
            <Text wrap="truncate-end">
              {gap(first, width - BUTTONS_WIDTH)}
              {(first.tail ?? []).map(run)}
            </Text>
            <Button key="settings" label={STRINGS.settings} plain dimColor={open !== 'settings'} hover={{ color: accent }} onPress={() => void toggle('settings')} />
            <Button key="hide" label={STRINGS.hide} plain dimColor hover={{ color: accent }} onPress={() => setHidden(true)} />
          </Box>
          {open === 'settings'
            ? SettingsPanel({
                el: { Box, Button, Text } as never, settings: s, accent,
                onChange: patch => void applySettings($, cur => ({ ...cur, ...patch })),
                onReset: () => void applySettings($, () => DEFAULT_SETTINGS),
                onClose: () => void update($, picker, () => null),
              })
            : [...(pickerRow ? [pickerRow] : []), ...rest.map(l => row(l, width))]}
        </Box>
      </Box>,
    )
  })
}
