import { describe, expect, test } from 'claude-code/testing'

import { stringsOf } from './i18n'
import { closeLedger, dayCost, freshBadges, ledgerReport, openLedger, saveLedger, tally } from './ledger'
import { countTool, countTurn, dayOf } from './stats'

// O livro de contas diante do store, com um store de mentira que o teste controla: o que já havia
// nele, o que outra sessão fez no meio, e uma gravação que demora.

const NOW = new Date(2026, 10, 23, 12).getTime()
const TODAY = dayOf(NOW)
const DAY = 86_400_000
const KEY = 'stats:esta'
const cents = (usd: number | undefined) => Math.round((usd ?? Number.NaN) * 100)
const T = stringsOf('pt').stats

type Stored = Record<string, unknown>
// O `$` de que o livro precisa: o id da sessão e o store. `slow` segura as gravações até o teste as soltar.
const engine = (store: Stored, slow?: { wait: () => Promise<void> }) =>
  ({
    session: { id: async () => 'esta' },
    store: {
      get: async (key: string) => store[key],
      set: async (key: string, value: unknown) => {
        await slow?.wait()
        store[key] = JSON.parse(JSON.stringify(value))
      },
      delete: async (key: string) => void delete store[key],
      keys: async () => Object.keys(store),
    },
  }) as never

// Uma espera que o teste solta: `reached` resolve quando alguém chegou a ela.
const hold = () => {
  let open = () => {}
  let arrive = () => {}
  const gate = new Promise<void>(resolve => (open = resolve))
  const reached = new Promise<void>(resolve => (arrive = resolve))
  return { reached, open: () => open(), wait: async () => (arrive(), await gate) }
}
const record = (over: Stored = {}) => ({ startedAt: NOW - 3_600_000, updatedAt: NOW - 60_000, bricks: 0, fails: 0, turns: 0, longestTurnMs: 0, mostTools: 0, mostHelpers: 0, lastCost: 0, days: {}, ...over })
const mine = (store: Stored) => store[KEY] as { bricks: number; turns: number; lastCost: number; days: Record<string, number> }
const bricks = (count: number) => Array.from({ length: count }).forEach(() => tally(countTool))

describe('o livro de contas', () => {
  test('sem livro aberto nada é contado, gravado nem relatado', async () => {
    closeLedger()
    const store: Stored = {}
    expect(tally(countTool)).toBe(0)
    await saveLedger(engine(store), 1, NOW)
    expect(store).toEqual({})
    expect(dayCost(1, NOW)).toBeUndefined()
    expect(await ledgerReport(engine(store), 1, NOW, T)).toBeNull()
  })

  test('aberto, conta, grava na chave da sessão e volta do store depois de um reload', async () => {
    closeLedger()
    const store: Stored = {}
    expect(await openLedger(engine(store), NOW, 2)).toBe('esta')
    bricks(3)
    await saveLedger(engine(store), 2.5, NOW + 1_000)
    expect(mine(store)).toMatchObject({ bricks: 3, lastCost: 2.5 })
    expect(cents(mine(store).days[TODAY])).toBe(50) // os $2 de antes de a barra ver a sessão não são gasto de hoje
    closeLedger() // um reload: as variáveis do módulo zeram
    await openLedger(engine(store), NOW + 2_000, 2.5)
    bricks(1)
    await saveLedger(engine(store), 2.5, NOW + 3_000)
    expect(mine(store).bricks).toBe(4)
  })

  test('fechar um andar: a conta que passa de cem tijolos diz que um andar fechou', async () => {
    closeLedger()
    await openLedger(engine({}), NOW, 0)
    bricks(99)
    expect(tally(countTool)).toBe(1)
    expect(tally(countTool)).toBe(0)
  })

  test('uma gravação pedida enquanto outra está em curso roda em seguida, com o que mudou', async () => {
    closeLedger()
    const store: Stored = {}
    const slow = hold()
    await openLedger(engine(store), NOW, 0)
    bricks(2)
    const first = saveLedger(engine(store, slow), 1, NOW + 1_000) // presa no store
    await slow.reached
    tally(stats => countTurn(stats, 5_000, 2)) // o turno acaba enquanto a primeira gravação não voltou
    const second = saveLedger(engine(store), 1.5, NOW + 2_000)
    slow.open()
    await Promise.all([first, second])
    expect(mine(store)).toMatchObject({ bricks: 2, turns: 1, lastCost: 1.5 })
    expect(cents(mine(store).days[TODAY])).toBe(150)
  })

  test('uma conta que muda enquanto o store responde não se perde', async () => {
    closeLedger()
    const store: Stored = {}
    const slow = hold()
    await openLedger(engine(store), NOW, 0)
    bricks(1)
    const saving = saveLedger(engine(store, slow), 0, NOW + 1_000)
    await slow.reached
    bricks(4) // ferramentas chamadas com a gravação em curso
    slow.open()
    await saving
    await saveLedger(engine(store), 0, NOW + 2_000)
    expect(mine(store).bricks).toBe(5)
  })

  test('a sessão recomeça com a gravação em curso: nada estoura, e o livro fica fechado', async () => {
    closeLedger()
    const store: Stored = { 'stats:outra': record({ days: { [TODAY]: 3 } }) }
    const slow = hold()
    await openLedger(engine(store), NOW, 0)
    const saving = saveLedger(engine(store, slow), 1, NOW + 120_000) // hora de reler as outras sessões também
    await slow.reached
    closeLedger()
    slow.open()
    await saving
    expect(dayCost(1, NOW)).toBeUndefined()
  })

  test('parada há dias, com o registro já somado ao total por outra sessão: só o que veio depois entra de novo', async () => {
    closeLedger()
    const old = record({ startedAt: NOW - 5 * DAY, updatedAt: NOW - 4 * DAY, bricks: 250, turns: 9, lastCost: 7, days: { '2026-11-19': 7 } })
    const store: Stored = { [KEY]: old }
    await openLedger(engine(store), NOW, 7) // a barra recarregou: o registro da sessão volta do store
    delete store[KEY] // outra sessão abriu o livro, somou este registro ao total de sempre e o apagou
    store.stats = { since: NOW - 30 * DAY, sessions: 1, usd: 7, bricks: 250, turns: 9 }
    bricks(3)
    tally(stats => countTurn(stats, 5_000, 3))
    await saveLedger(engine(store), 7.4, NOW + 1_000)
    expect(mine(store)).toMatchObject({ bricks: 3, turns: 1, lastCost: 7.4 })
    expect(Object.keys(mine(store).days)).toEqual([TODAY])
    expect(cents(mine(store).days[TODAY])).toBe(40)
  })

  test('parada há dias mas com o registro ainda no store, as contas seguem de onde estavam', async () => {
    closeLedger()
    const store: Stored = { [KEY]: record({ updatedAt: NOW - 4 * DAY, bricks: 250, turns: 9, lastCost: 7, days: { '2026-11-19': 7 } }) }
    await openLedger(engine(store), NOW, 7)
    bricks(3)
    await saveLedger(engine(store), 7, NOW + 1_000)
    expect(mine(store)).toMatchObject({ bricks: 253, turns: 9 })
  })

  test('sem saber o custo ao abrir, o primeiro que chega é a base, não um gasto de hoje', async () => {
    closeLedger()
    const store: Stored = {}
    await openLedger(engine(store), NOW, undefined)
    expect(cents(dayCost(undefined, NOW))).toBe(0)
    expect(cents(dayCost(12, NOW))).toBe(0) // a sessão já tinha $12 na conta
    expect(cents(dayCost(12.5, NOW))).toBe(50)
    await saveLedger(engine(store), 12.5, NOW + 1_000)
    expect(cents(mine(store).days[TODAY])).toBe(50)
  })

  test('o custo de hoje soma as outras sessões, relidas no máximo uma vez por minuto', async () => {
    closeLedger()
    const store: Stored = { 'stats:outra': record({ days: { [TODAY]: 3 } }) }
    await openLedger(engine(store), NOW, 0)
    expect(cents(dayCost(1, NOW))).toBe(400)
    store['stats:outra'] = record({ days: { [TODAY]: 5 } }) // a outra sessão gastou mais
    await saveLedger(engine(store), 1, NOW + 30_000)
    expect(cents(dayCost(1, NOW + 30_000))).toBe(400) // ainda não deu um minuto
    await saveLedger(engine(store), 1, NOW + 61_000)
    expect(cents(dayCost(1, NOW + 61_000))).toBe(600)
  })

  test('ao abrir, um registro parado há dias entra no total de sempre e sai do store; o relatório conta os que ainda estão lá', async () => {
    closeLedger()
    const store: Stored = {
      'stats:velha': record({ startedAt: NOW - 6 * DAY, updatedAt: NOW - 5 * DAY, bricks: 250, turns: 9 }),
      'stats:recente': record({ bricks: 5, turns: 1 }),
    }
    await openLedger(engine(store), NOW, 0)
    expect(Object.keys(store).sort()).toEqual(['stats', 'stats:recente'])
    expect(store.stats).toMatchObject({ bricks: 250, turns: 9, sessions: 1 })
    // um registro que fica parado depois de o livro abrir ainda não entrou no total: o relatório o conta do store
    store['stats:parada'] = record({ updatedAt: NOW - 4 * DAY, bricks: 40, turns: 2 })
    bricks(2)
    const report = await ledgerReport(engine(store), 0, NOW, T)
    expect(report).toContain('297 tijolos · 2 andares · 12 turnos · 4 sessões')
    expect(report).toContain('esta sessão')
  })
})

describe('as insígnias do livro', () => {
  test('sem livro aberto, nenhuma', () => {
    closeLedger()
    expect(freshBadges()).toEqual([])
  })

  test('a que vem durante a sessão aparece uma vez só', async () => {
    closeLedger()
    await openLedger(engine({}), NOW, 0)
    bricks(99)
    expect(freshBadges()).toEqual([])
    bricks(1)
    expect(freshBadges()).toEqual([{ family: 'bricks', tier: 0, goal: 100 }])
    expect(freshBadges()).toEqual([])
  })

  test('o que a pessoa já tinha ao abrir a sessão não vira aviso', async () => {
    closeLedger()
    await openLedger(engine({ [KEY]: record({ bricks: 150 }), 'stats:outra': record({ turns: 100 }) }), NOW, 0)
    expect(freshBadges()).toEqual([])
  })
})
