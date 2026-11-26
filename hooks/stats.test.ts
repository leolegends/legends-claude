import { describe, expect, test } from 'claude-code/testing'

import { stringsOf } from './i18n'
import {
  FLOOR_BRICKS, STALE_MS, absorb, after, countFail, countHelpers, countTool, countTurn, dayOf, floorsOf, freshStats, othersToday, readLifetime, readStats, spend, statsText,
  summarize, todayOf, usdOf,
} from './stats'
import type { SessionStats } from './stats'

// Meio-dia de 23/11/2026 na hora local, e o mesmo horário do dia seguinte.
const NOON = new Date(2026, 10, 23, 12).getTime()
const NEXT_NOON = new Date(2026, 10, 24, 12).getTime()
const TODAY = '2026-11-23'

const times = <T,>(count: number, change: (value: T) => T, value: T): T => Array.from({ length: count }).reduce<T>(v => change(v), value)
// Um valor em dólares em centavos inteiros: as somas de frações não fecham no último dígito.
const cents = (usd: number) => Math.round(usd * 100)
const session = (over: Partial<SessionStats> = {}): SessionStats => ({ ...freshStats(NOON, 0), ...over })

describe('as contas de uma sessão', () => {
  test('o dia de um instante é o da hora local', () => {
    expect(dayOf(NOON)).toBe(TODAY)
    expect(dayOf(new Date(2026, 0, 5, 0, 0, 1).getTime())).toBe('2026-01-05')
  })

  test('cada ferramenta é um tijolo, e cem tijolos fecham um andar', () => {
    expect(FLOOR_BRICKS).toBe(100)
    expect(floorsOf(99)).toBe(0)
    expect(floorsOf(100)).toBe(1)
    expect(floorsOf(250)).toBe(2)
    expect(floorsOf(Number.NaN)).toBe(0)
    expect(times(3, countTool, session()).bricks).toBe(3)
    expect(countFail(session()).fails).toBe(1)
  })

  test('um turno conta, e fica o mais longo e o que mais chamou ferramentas', () => {
    const stats = countTurn(countTurn(countTurn(session(), 60_000, 4), 300_000, 2), 10_000, 30)
    expect(stats).toMatchObject({ turns: 3, longestTurnMs: 300_000, mostTools: 30 })
  })

  test('o recorde de agentes de uma vez só sobe', () => {
    const three = countHelpers(session(), 3)
    expect(three.mostHelpers).toBe(3)
    expect(countHelpers(three, 2)).toBe(three) // o mesmo registro, sem copiar nada
  })

  test('uma sessão que a barra vê pela primeira vez não conta como de hoje o que ela já tinha gasto', () => {
    const stats = freshStats(NOON, 12.5) // uma sessão retomada, com o custo de ontem na conta
    expect(todayOf(stats, 12.5, NOON)).toBe(0)
    expect(cents(todayOf(stats, 13, NOON))).toBe(50)
    expect(cents(usdOf(spend(stats, 13, NOON)))).toBe(50)
  })

  test('o custo entra no dia em que foi gasto: uma sessão que vira a noite conta em dois dias', () => {
    const tonight = spend(session(), 2, NOON)
    const tomorrow = spend(tonight, 5, NEXT_NOON)
    expect(tomorrow.days).toEqual({ [TODAY]: 2, '2026-11-24': 3 })
    expect(tomorrow.lastCost).toBe(5)
    expect(tomorrow.updatedAt).toBe(NEXT_NOON)
    expect(usdOf(tomorrow)).toBe(5)
  })

  test('um custo que recomeçou (um /clear) segue contando do zero, sem descontar nada', () => {
    const before = spend(session(), 4, NOON)
    const after = spend(before, 1, NOON) // a conta da sessão voltou a zero e já gastou 1
    expect(after.days[TODAY]).toBe(5)
    expect(after.lastCost).toBe(1)
  })

  test('um registro guarda poucos dias: os mais antigos saem', () => {
    const many = Array.from({ length: 20 }).reduce<SessionStats>((stats, _, i) => spend(stats, i + 1, new Date(2026, 9, 1 + i, 12).getTime()), session())
    expect(Object.keys(many.days).length).toBe(14)
    expect(Object.keys(many.days)[0]).toBe('2026-10-07')
  })
})

describe('o que vem do store', () => {
  test('um registro é conferido campo a campo: o que não é número vale zero, um dia malformado sai', () => {
    const read = readStats({ updatedAt: NOON, startedAt: NOON - 5, bricks: 12, fails: 'três', turns: -4, lastCost: Infinity, days: { [TODAY]: 3, ontem: 9, '2026-11-22': '1' } })
    expect(read).toEqual({
      bricks: 12, fails: 0, turns: 0, longestTurnMs: 0, mostTools: 0, mostHelpers: 0, tokens: 0,
      startedAt: NOON - 5, updatedAt: NOON, lastCost: 0, days: { [TODAY]: 3, '2026-11-22': 0 },
    })
  })

  test('números absurdos de um store estragado não viram Infinity nem uma data inválida', () => {
    const read = readStats({ updatedAt: NOON, startedAt: 1e300, bricks: 1e308, lastCost: 1e308, days: { [TODAY]: 1e308 } })
    expect(read).toMatchObject({ bricks: Number.MAX_SAFE_INTEGER, startedAt: NOON, updatedAt: NOON })
    expect(Number.isFinite((read?.bricks ?? 0) + (read?.bricks ?? 0))).toBe(true)
    expect(readStats({ updatedAt: 1e300 })).toBeNull() // um instante que nenhuma data representa
    expect(readLifetime({ since: 1e300, bricks: 5 }, NOON)).toMatchObject({ since: NOON, bricks: 5 })
  })

  test('o que uma sessão fez depois de um registro já somado: contagens e custo descontados, recordes mantidos', () => {
    const saved = session({ bricks: 250, fails: 4, turns: 9, longestTurnMs: 90_000, mostTools: 40, days: { '2026-11-19': 7, [TODAY]: 1 } })
    const now = session({ ...saved, bricks: 253, fails: 4, turns: 10, days: { '2026-11-19': 7, [TODAY]: 1.5 } })
    const rest = after(now, saved, NOON)
    expect(rest).toMatchObject({ bricks: 3, fails: 0, turns: 1, longestTurnMs: 90_000, mostTools: 40, startedAt: NOON })
    expect(Object.keys(rest.days)).toEqual([TODAY])
    expect(cents(rest.days[TODAY] ?? 0)).toBe(50)
  })

  test('o que não é um registro não vira um', () => {
    expect(readStats(undefined)).toBeNull()
    expect(readStats('texto')).toBeNull()
    expect(readStats({ bricks: 5 })).toBeNull() // sem a hora da última gravação
  })

  test('sem total guardado, a conta de sempre começa agora', () => {
    expect(readLifetime(undefined, NOON)).toEqual({ bricks: 0, fails: 0, turns: 0, longestTurnMs: 0, mostTools: 0, mostHelpers: 0, tokens: 0, since: NOON, sessions: 0, usd: 0 })
    expect(readLifetime({ since: 5, sessions: 2, usd: 7.5, bricks: 300 }, NOON)).toMatchObject({ since: 5, sessions: 2, usd: 7.5, bricks: 300 })
  })

  test('um registro parado há dias é o que entra no total de sempre', () => {
    expect(STALE_MS).toBe(3 * 86_400_000)
    const old = session({ startedAt: 100, bricks: 250, fails: 4, turns: 9, longestTurnMs: 90_000, mostTools: 40, mostHelpers: 3, days: { '2026-11-01': 6 } })
    const life = absorb(readLifetime({ since: 500, sessions: 1, usd: 1, bricks: 50, mostTools: 60 }, NOON), old)
    expect(life).toEqual({ bricks: 300, fails: 4, turns: 9, longestTurnMs: 90_000, mostTools: 60, mostHelpers: 3, tokens: 0, since: 100, sessions: 2, usd: 7 })
  })
})

describe('as contas do dia e de sempre', () => {
  const mine = session({ bricks: 137, fails: 9, turns: 12, longestTurnMs: 252_000, mostTools: 31, mostHelpers: 2, lastCost: 4, days: { [TODAY]: 4 } })
  const others = [
    session({ bricks: 400, turns: 20, mostHelpers: 6, days: { [TODAY]: 10, '2026-11-22': 3 } }),
    session({ bricks: 10, turns: 1, days: { '2026-11-22': 2 } }), // não gastou hoje
  ]
  const life = readLifetime({ since: new Date(2026, 10, 12, 9).getTime(), sessions: 40, usd: 500, bricks: 11_856, turns: 277, longestTurnMs: 842_000, mostTools: 87 }, NOON)

  test('o custo de hoje soma as sessões que gastaram hoje, e o que esta ainda não gravou', () => {
    expect(othersToday(others, NOON)).toEqual({ usd: 10, sessions: 1 })
    expect(cents(todayOf(mine, 4.2, NOON))).toBe(420)
    const summary = summarize(mine, others, life, 4.2, NOON)
    expect(cents(summary.today.usd)).toBe(1420)
    expect(summary.today.sessions).toBe(2)
    expect(cents(summary.session.usd)).toBe(420)
  })

  test('o total de sempre é o guardado mais as sessões que ainda estão no store', () => {
    const { all } = summarize(mine, others, life, 4.2, NOON)
    expect(all).toMatchObject({ bricks: 12_403, turns: 310, sessions: 43, longestTurnMs: 842_000, mostTools: 87, mostHelpers: 6 })
    expect(cents(all.usd)).toBe(51_920)
  })

  test('o relatório do comando, em português', () => {
    const text = statsText(summarize(mine, others, life, 4.2, NOON), stringsOf('pt').stats)
    expect(text.split('\n')).toEqual([
      'estatísticas',
      'esta sessão       137 tijolos · 1 andar · 9 falhas · 12 turnos · $4.20',
      'hoje              $14.20 · 2 sessões',
      'desde 2026-11-12  12.403 tijolos · 124 andares · 9 falhas · 310 turnos · 43 sessões · $519.20',
      'recordes          turno mais longo 14m02s · 87 tools num turno · 6 agentes de uma vez',
    ])
  })

  test('um recorde de uma ferramenta só vai no singular, nos dois idiomas', () => {
    const one = summarize(session({ turns: 1, mostTools: 1, longestTurnMs: 5_000 }), [], readLifetime(undefined, NOON), undefined, NOON)
    expect(statsText(one, stringsOf('pt').stats)).toContain('turno mais longo 5s · 1 tool num turno')
    expect(statsText(one, stringsOf('en').stats)).toContain('longest turn 5s · 1 tool in one turn')
  })

  test('e em inglês, sem falhas nem recordes para contar', () => {
    const empty = summarize(session(), [], readLifetime(undefined, NOON), undefined, NOON)
    const lines = statsText(empty, stringsOf('en').stats).split('\n')
    expect(lines).toEqual([
      'stats',
      'this session      0 bricks · 0 turns · $0.00',
      'today             $0.00 · 1 session',
      `since ${TODAY}  0 bricks · 0 turns · 1 session · $0.00`,
    ])
  })
})
