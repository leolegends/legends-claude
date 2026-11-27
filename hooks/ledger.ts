import type { EngineInterface } from 'claude-code'

import { STALE_MS, absorb, after, freshStats, floorsOf, othersToday, readLifetime, readStats, spend, statsText, summarize, todayOf } from './stats'
import type { Lifetime, SessionStats } from './stats'
import { BADGE_COUNT, earnedBadges, newBadges } from './badges'
import type { Badge, BadgeFacts, BadgeStrings } from './badges'
import type { Strings } from './i18n'

// O livro de contas da barra: o registro da sessão de agora, os das outras sessões e o total de
// sempre, no store do plugin (o mesmo arquivo dos ajustes, que vale para todas as sessões). Cada
// sessão escreve só a chave dela, `stats:<id da sessão>`: duas sessões abertas ao mesmo tempo não
// disputam um valor. O total de sempre (`stats`) só é escrito ao abrir o livro, quando um registro
// parado há dias é somado a ele e apagado. O store não tem operação atômica: duas sessões que abram
// o livro no mesmo instante, com registros parados para somar, podem perder ou repetir uma soma. É
// raro, e o que erra é uma contagem de enfeite.

const PREFIX = 'stats:'
const LIFETIME_KEY = 'stats'
const REFRESH_MS = 60_000 // os registros das outras sessões são relidos no máximo uma vez por minuto

type Book = {
  /** A chave do registro desta sessão. */
  key: string
  mine: SessionStats
  /**
   * O custo da sessão já foi visto alguma vez. Sem isso não há de onde contar o que ela gasta: o
   * primeiro custo que chegar é a base (o que ela já tinha gasto), não um gasto de hoje.
   */
  hasBase: boolean
  /** O registro como está no store (o que foi lido ao abrir, ou a última gravação); `null` enquanto a sessão não gravou nenhum. */
  saved: SessionStats | null
  /** Os registros das outras sessões ainda no store, como estavam na última leitura. */
  others: readonly SessionStats[]
  life: Lifetime
  readAt: number
}

/** Um pedido de gravação: o custo da sessão naquele instante. */
type Save = { cost: number | undefined; now: number }

// O livro aberto: uma variável do módulo, como a cena do palco. Um reload a zera, e a sessão o reabre do store.
let book: Book | null = null
// As contas da última olhada nas insígnias (freshBadges): o que já estava conquistado ali não é avisado de novo.
let badgeBase: BadgeFacts | null = null
let isSaving = false
let queued: Save | null = null // a gravação pedida enquanto outra estava em curso: roda em seguida

// O custo da sessão chegou pela primeira vez: vira a base das contas, sem contar como gasto.
const withBase = (open: Book, cost: number | undefined): Book =>
  open.hasBase || cost === undefined ? open : { ...open, hasBase: true, mine: { ...open.mine, lastCost: cost } }

// Os registros das outras sessões: os que valem, com a chave de cada um. (Uma função que recebe `$`
// fora do register.tsx tem de ser uma declaração `function`: o engine não carrega o módulo de outro jeito.)
async function readOthers($: EngineInterface, own: string): Promise<(readonly [string, SessionStats])[]> {
  const keys = (await $.store.keys()).filter(key => key.startsWith(PREFIX) && key !== own)
  const read = await Promise.all(keys.map(async key => [key, readStats(await $.store.get(key))] as const))
  return read.flatMap(([key, stats]) => (stats ? [[key, stats] as const] : []))
}

/**
 * Abre o livro da sessão: o registro dela (o do store, se a barra já a acompanhava antes de um
 * reload; senão um novo, a partir do custo de agora, se ele já é conhecido), os das outras e o total
 * de sempre. Um registro parado há dias entra no total e sai do store. Devolve o id da sessão.
 */
export async function openLedger($: EngineInterface, now: number, cost: number | undefined): Promise<string> {
  const id = await $.session.id()
  const key = `${PREFIX}${id}`
  const stored = readStats(await $.store.get(key))
  const all = await readOthers($, key)
  const stale = all.filter(([, stats]) => now - stats.updatedAt > STALE_MS)
  const saved = readLifetime(await $.store.get(LIFETIME_KEY), now)
  const life = stale.reduce((sum, [, stats]) => absorb(sum, stats), saved)
  if (stale.length) {
    // Primeiro o total, depois as chaves: uma queda no meio conta um registro duas vezes, nunca o perde.
    await $.store.set(LIFETIME_KEY, life)
    await Promise.all(stale.map(([staleKey]) => $.store.delete(staleKey)))
  }
  book = {
    key, life, readAt: now, mine: stored ?? freshStats(now, cost ?? 0), hasBase: stored !== null || cost !== undefined, saved: stored,
    others: all.filter(([, stats]) => now - stats.updatedAt <= STALE_MS).map(([, stats]) => stats),
  }
  badgeBase = factsOf(book) // o que a pessoa já tinha ao abrir a sessão não vira aviso
  return id
}

/** Fecha o livro: sem ele, nada é contado nem gravado (a sessão recomeçou, ou não há como saber quem ela é). */
export const closeLedger = () => {
  book = null
  badgeBase = null
}

/**
 * Uma conta da sessão mudou (uma ferramenta, uma falha, um turno). Devolve quantos andares fecharam
 * com a mudança: zero quase sempre, um quando os tijolos passam de uma centena.
 */
export const tally = (change: (stats: SessionStats) => SessionStats): number => {
  if (!book) return 0
  const before = floorsOf(book.mine.bricks)
  book = { ...book, mine: change(book.mine) }
  return floorsOf(book.mine.bricks) - before
}

// Uma gravação: lança o custo de agora no dia de hoje, escreve o registro da sessão e, de tempos em
// tempos, relê os das outras. O livro é relido da variável do módulo depois de cada espera: uma conta
// que mudou no meio (uma ferramenta chamada enquanto o store respondia) não se perde, e uma sessão que
// recomeçou no meio não recebe o que era da anterior.
async function writeBook($: EngineInterface, { cost, now }: Save): Promise<void> {
  const key = book?.key
  if (!book || key === undefined) return
  // Parada há dias, a sessão pode ter tido o registro somado ao total de sempre por outra sessão, que
  // o apagou. Se ele já não está no store, o que foi somado lá sai das contas daqui: fica só o que a
  // sessão fez depois da última gravação.
  const absorbed = book.saved && now - book.saved.updatedAt > STALE_MS && readStats(await $.store.get(key)) === null ? book.saved : null
  if (!book || book.key !== key) return
  const based = withBase(book, cost)
  const mine = spend(absorbed ? after(based.mine, absorbed, now) : based.mine, cost ?? based.mine.lastCost, now)
  book = { ...based, mine, saved: mine }
  const isDue = now - based.readAt >= REFRESH_MS
  await $.store.set(key, mine)
  if (!isDue) return
  const others = (await readOthers($, key)).map(([, stats]) => stats)
  if (book && book.key === key) book = { ...book, others, readAt: now }
}

/**
 * Grava as contas da sessão com o custo de agora. Uma gravação pedida enquanto outra está em curso
 * não é descartada: fica na fila (só a mais nova, que já leva tudo o que mudou) e roda em seguida.
 */
export async function saveLedger($: EngineInterface, cost: number | undefined, now: number): Promise<void> {
  if (!book) return
  if (isSaving) {
    queued = { cost, now }
    return
  }
  isSaving = true
  try {
    for (let next: Save | null = { cost, now }; next && book; next = queued) {
      queued = null
      await writeBook($, next)
    }
  } finally {
    isSaving = false
    queued = null
  }
}

/** O custo de hoje somado entre as sessões, ou `undefined` sem livro aberto. */
export const dayCost = (cost: number | undefined, now: number): number | undefined => {
  if (!book) return undefined
  book = withBase(book, cost)
  return todayOf(book.mine, cost, now) + othersToday(book.others, now).usd
}

/**
 * O relatório do comando de estatísticas, com os registros das outras sessões relidos agora (os
 * parados há dias também: só entram no total de sempre quando alguma sessão abre o livro, e até lá
 * contam daqui); `null` sem livro aberto.
 */
export async function ledgerReport($: EngineInterface, cost: number | undefined, now: number, t: Strings['stats'], lv?: Strings['levels'], bd?: BadgeStrings): Promise<string | null> {
  const key = book?.key
  if (key === undefined) return null
  const others = (await readOthers($, key)).map(([, stats]) => stats)
  if (!book || book.key !== key) return null
  book = { ...withBase(book, cost), others, readAt: now }
  return statsText(summarize(book.mine, others, book.life, cost, now), t, lv, bd)
}

/**
 * Os tokens de sempre, de onde sai o nível: o total guardado, as outras sessões (como na última
 * leitura, no máximo um minuto atrás) e esta; `undefined` sem livro aberto.
 */
export const totalTokens = (): number | undefined =>
  book ? book.life.tokens + book.others.reduce((sum, s) => sum + s.tokens, 0) + book.mine.tokens : undefined

// As contas de sempre de onde saem as insígnias: o total guardado, as outras sessões (como na última leitura) e esta.
const factsOf = (open: Book): BadgeFacts => [...open.others, open.mine].reduce(absorb, open.life)


/**
 * As insígnias que vieram desde a última olhada (ou desde que o livro abriu). Sem livro aberto, nenhuma.
 */
export const freshBadges = (): Badge[] => {
  if (!book) return []
  const now = factsOf(book)
  const before = badgeBase
  badgeBase = now
  return before ? newBadges(before, now) : []
}

/** Quantas insígnias as contas de sempre já dão, e quantas existem; `undefined` sem livro aberto. */
export const badgeTally = (): { earned: number; total: number } | undefined =>
  book ? { earned: earnedBadges(factsOf(book)).length, total: BADGE_COUNT } : undefined
