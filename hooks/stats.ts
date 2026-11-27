import { fmtCost, fmtSpan } from './format'
import type { Strings } from './i18n'
import { badgeRows } from './badges'
import type { BadgeStrings } from './badges'
import { fmtTokens, levelOf } from './level'

// O que a barra lembra de uma sessão para a outra: quantos tijolos (uma ferramenta chamada é um
// tijolo) cada sessão assentou, as falhas, os turnos, os recordes e o custo por dia. Cada sessão
// escreve só o registro dela (não há disputa entre sessões abertas ao mesmo tempo); quem lê soma os
// registros. Um registro parado há dias é somado ao total de sempre e apagado. Tudo aqui é puro: quem
// fala com o store é ledger.ts.

/** Tijolos de um andar: uma parede cheia numa barra larga. */
export const FLOOR_BRICKS = 100
const DAY_MS = 86_400_000
/** Um registro de sessão parado há mais tempo que isso entra no total de sempre e sai do store. */
export const STALE_MS = 3 * DAY_MS
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
const DAYS_MAX = 14 // dias de custo que um registro guarda: uma sessão não dura mais que isso

/** As contas de uma sessão, ou de todas somadas. */
export type Tally = {
  /** Ferramentas chamadas: cada uma é um tijolo. */
  bricks: number
  /** As que terminaram em erro, ou foram recusadas. */
  fails: number
  turns: number
  longestTurnMs: number
  /** O turno que mais chamou ferramentas. */
  mostTools: number
  /** O maior número de agentes rodando ao mesmo tempo. */
  mostHelpers: number
  /** Tokens que contam para o nível (level.ts): entrada, saída e escrita no cache, agentes incluídos. */
  tokens: number
}

/** O registro de uma sessão no store. */
export type SessionStats = Tally & {
  startedAt: number
  updatedAt: number
  /** O custo da sessão quando o registro foi escrito: o que ela gastar a mais entra no dia em que for gasto. */
  lastCost: number
  /** O custo por dia (`AAAA-MM-DD`, na hora local): uma sessão que vira a noite conta em dois dias. */
  days: Record<string, number>
}

/** O total das sessões que já saíram do store. */
export type Lifetime = Tally & {
  /** Desde quando se conta. */
  since: number
  sessions: number
  usd: number
}

const NO_TALLY: Tally = { bricks: 0, fails: 0, turns: 0, longestTurnMs: 0, mostTools: 0, mostHelpers: 0, tokens: 0 }

const COUNT_MAX = Number.MAX_SAFE_INTEGER
const TIME_MAX = 8.64e15 // o maior instante que uma data representa

// Um número de contagem vindo de fora: finito, não negativo e dentro do que se soma sem perder a conta; ou zero.
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, COUNT_MAX) : 0)
// Um instante vindo de fora: um que uma data representa, ou zero.
const stamp = (v: unknown): number => {
  const at = count(v)
  return at <= TIME_MAX ? at : 0
}
const pad = (n: number) => String(n).padStart(2, '0')

/** O dia de um instante, na hora local: `2026-11-23`. */
export const dayOf = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Quantos andares fechados há em tantos tijolos. */
export const floorsOf = (bricks: number): number => Math.floor(count(bricks) / FLOOR_BRICKS)

/** O registro de uma sessão que a barra vê pela primeira vez. O que ela já tinha gasto antes não conta como gasto de hoje. */
export const freshStats = (now: number, cost: number): SessionStats => ({ ...NO_TALLY, startedAt: now, updatedAt: now, lastCost: count(cost), days: {} })

const tallyOf = (r: Record<string, unknown>): Tally => ({
  bricks: count(r.bricks), fails: count(r.fails), turns: count(r.turns),
  longestTurnMs: count(r.longestTurnMs), mostTools: count(r.mostTools), mostHelpers: count(r.mostHelpers), tokens: count(r.tokens),
})

/** O registro de uma sessão como veio do store, conferido campo a campo; `null` quando não é um registro. */
export const readStats = (raw: unknown): SessionStats | null => {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const updatedAt = stamp(r.updatedAt)
  if (!(updatedAt > 0)) return null
  const days = r.days && typeof r.days === 'object' ? Object.entries(r.days as Record<string, unknown>) : []
  return {
    ...tallyOf(r), startedAt: stamp(r.startedAt) || updatedAt, updatedAt, lastCost: count(r.lastCost),
    days: Object.fromEntries(days.filter(([day]) => DAY_KEY.test(day)).map(([day, usd]) => [day, count(usd)])),
  }
}

/** O total de sempre como veio do store; sem um, começa agora. */
export const readLifetime = (raw: unknown, now: number): Lifetime => {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return { ...tallyOf(r), since: stamp(r.since) || now, sessions: count(r.sessions), usd: count(r.usd) }
}

/** O que uma sessão gastou enquanto a barra a acompanhou. */
export const usdOf = (stats: SessionStats): number => Object.values(stats.days).reduce((sum, usd) => sum + usd, 0)

// O que a sessão gastou desde a última gravação. Um custo menor que o gravado é o de uma conta que recomeçou (um /clear).
const unspent = (stats: SessionStats, cost: number): number => (cost >= stats.lastCost ? cost - stats.lastCost : count(cost))

/** Puro: o registro com o custo de agora lançado no dia de hoje. */
export const spend = (stats: SessionStats, cost: number, now: number): SessionStats => {
  const today = dayOf(now)
  const days = { ...stats.days, [today]: (stats.days[today] ?? 0) + unspent(stats, count(cost)) }
  const kept = Object.keys(days).sort().slice(-DAYS_MAX)
  return { ...stats, updatedAt: now, lastCost: count(cost), days: Object.fromEntries(kept.map(day => [day, days[day] ?? 0])) }
}

export const countTool = (stats: SessionStats): SessionStats => ({ ...stats, bricks: stats.bricks + 1 })
/** Tokens de um turno (da conversa principal ou de um agente) somados à conta. */
export const countTokens = (stats: SessionStats, tokens: number): SessionStats => ({ ...stats, tokens: stats.tokens + count(tokens) })
export const countFail = (stats: SessionStats): SessionStats => ({ ...stats, fails: stats.fails + 1 })
export const countHelpers = (stats: SessionStats, running: number): SessionStats =>
  running > stats.mostHelpers ? { ...stats, mostHelpers: running } : stats
/** Um turno acabou: quanto durou e quantas ferramentas chamou. */
export const countTurn = (stats: SessionStats, ms: number, tools: number): SessionStats => ({
  ...stats, turns: stats.turns + 1, longestTurnMs: Math.max(stats.longestTurnMs, count(ms)), mostTools: Math.max(stats.mostTools, count(tools)),
})

/**
 * Puro: o que a sessão fez depois do registro `saved`, que já foi somado ao total de sempre: as
 * contagens e o custo de cada dia descontados dele. Os recordes ficam: somar um recorde de novo não o muda.
 */
export const after = (stats: SessionStats, saved: SessionStats, now: number): SessionStats => ({
  ...stats, startedAt: now,
  bricks: Math.max(0, stats.bricks - saved.bricks), fails: Math.max(0, stats.fails - saved.fails), turns: Math.max(0, stats.turns - saved.turns),
  tokens: Math.max(0, stats.tokens - saved.tokens),
  days: Object.fromEntries(
    Object.entries(stats.days).map(([day, usd]) => [day, Math.max(0, usd - (saved.days[day] ?? 0))] as const).filter(([, usd]) => usd > 0),
  ),
})

const sum = (a: Tally, b: Tally): Tally => ({
  bricks: a.bricks + b.bricks, fails: a.fails + b.fails, turns: a.turns + b.turns,
  longestTurnMs: Math.max(a.longestTurnMs, b.longestTurnMs), mostTools: Math.max(a.mostTools, b.mostTools), mostHelpers: Math.max(a.mostHelpers, b.mostHelpers),
  tokens: a.tokens + b.tokens,
})

/** Puro: o total de sempre com uma sessão que saiu do store somada a ele. */
export const absorb = (life: Lifetime, stats: SessionStats): Lifetime => ({
  ...sum(life, stats), since: Math.min(life.since, stats.startedAt), sessions: life.sessions + 1, usd: life.usd + usdOf(stats),
})

/** O que a sessão de agora gastou hoje, contando o que ainda não foi gravado. */
export const todayOf = (mine: SessionStats, cost: number | undefined, now: number): number =>
  (mine.days[dayOf(now)] ?? 0) + (cost === undefined ? 0 : unspent(mine, count(cost)))

/** O que as outras sessões gastaram hoje, e quantas foram. */
export const othersToday = (others: readonly SessionStats[], now: number): { usd: number; sessions: number } => {
  const today = dayOf(now)
  const spent = others.map(s => s.days[today] ?? 0).filter(usd => usd > 0)
  return { usd: spent.reduce((a, b) => a + b, 0), sessions: spent.length }
}

/** As contas que o comando de estatísticas mostra: a sessão, o dia e o total de sempre. */
export type Summary = {
  session: Tally & { usd: number }
  today: { usd: number; sessions: number }
  all: Tally & { usd: number; sessions: number; since: number }
}

/** Puro: as contas da sessão de agora, do dia e de sempre (o total guardado mais as sessões ainda no store). */
export const summarize = (mine: SessionStats, others: readonly SessionStats[], life: Lifetime, cost: number | undefined, now: number): Summary => {
  const session = { ...mine, usd: usdOf(mine) + (cost === undefined ? 0 : unspent(mine, count(cost))) }
  const rest = othersToday(others, now)
  const stored = [...others, mine].reduce(absorb, life)
  return {
    session,
    today: { usd: todayOf(mine, cost, now) + rest.usd, sessions: rest.sessions + 1 },
    all: { ...stored, usd: stored.usd + (session.usd - usdOf(mine)) },
  }
}

const LABEL_GAP = 2 // colunas entre o rótulo mais comprido do relatório e as contas

/** Puro: o relatório do comando de estatísticas, uma linha por conta, no idioma dado. */
export const statsText = (s: Summary, t: Strings['stats'], lv?: Strings['levels'], bd?: BadgeStrings): string => {
  const work = (tally: Tally) => [
    t.bricks(tally.bricks),
    floorsOf(tally.bricks) > 0 ? t.floors(floorsOf(tally.bricks)) : '',
    tally.fails > 0 ? t.fails(tally.fails) : '',
    t.turns(tally.turns),
  ]
  const { all } = s
  const records = [
    all.longestTurnMs > 0 ? t.longest(fmtSpan(all.longestTurnMs)) : '',
    all.mostTools > 0 ? t.mostTools(all.mostTools) : '',
    all.mostHelpers > 0 ? t.mostHelpers(all.mostHelpers) : '',
  ]
  const rows: (readonly [label: string, items: readonly string[]])[] = [
    [t.session, [...work(s.session), fmtCost(s.session.usd)]],
    [t.today, [fmtCost(s.today.usd), t.sessions(s.today.sessions)]],
    [t.since(dayOf(all.since)), [...work(all), t.sessions(all.sessions), fmtCost(all.usd)]],
    ...(records.some(Boolean) ? [[t.records, records] as const] : []),
    ...(lv ? [[lv.level.trim(), [t.level(levelOf(all.tokens).level, lv.titles[levelOf(all.tokens).title] ?? '', fmtTokens(all.tokens, lv.decimal))]] as const] : []),
    ...(bd ? badgeRows(all, bd) : []),
  ]
  // a coluna dos rótulos tem a largura do mais comprido deles: as contas começam alinhadas
  const width = Math.max(...rows.map(([label]) => label.length)) + LABEL_GAP
  return [t.title, ...rows.map(([label, items]) => `${label.padEnd(width)}${items.filter(Boolean).join(' · ')}`)].join('\n')
}
