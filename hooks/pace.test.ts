import { describe, expect, test } from 'claude-code/testing'

import { fullIn, paced, track } from './pace'
import type { StatusLimit as Limit } from '../types'

const MIN = 60_000
const T0 = 1_700_000_000_000
// A janela zera daqui a `inMs`, contado de T0.
const resetAt = (inMs: number) => new Date(T0 + inMs).toISOString()
// Uma sequência de leituras da mesma janela, cada uma `[minutos depois de T0, percentual]`; `resetsAt`
// `null` é uma janela que não diz quando zera.
const feed = (window: 'fiveHour' | 'week', readings: readonly (readonly [number, number])[], resetsAt: string | null = resetAt(180 * MIN)) =>
  readings.reduce<Limit | undefined>((limit, [min, pct]) => track(window, limit, { pct, ...(resetsAt !== null && { resetsAt }) }, T0 + min * MIN), undefined)

describe('o rastro de uma janela de limite', () => {
  test('guarda a primeira leitura de cada valor, da mais antiga à mais nova', () => {
    const limit = feed('fiveHour', [[0, 40], [1, 40], [2, 41], [3, 41], [5, 43]])
    expect(limit?.pct).toBe(43)
    expect(limit?.trail).toEqual([{ at: T0, pct: 40 }, { at: T0 + 2 * MIN, pct: 41 }, { at: T0 + 5 * MIN, pct: 43 }])
  })

  test('uma janela que zerou (o percentual caiu, ou a hora de zerar mudou) recomeça o rastro', () => {
    const before = feed('fiveHour', [[0, 80], [10, 90]])
    const fallen = track('fiveHour', before, { pct: 3, resetsAt: resetAt(180 * MIN) }, T0 + 12 * MIN)
    expect(fallen?.trail).toEqual([{ at: T0 + 12 * MIN, pct: 3 }])
    const moved = track('fiveHour', before, { pct: 90, resetsAt: resetAt(480 * MIN) }, T0 + 12 * MIN)
    expect(moved?.trail).toEqual([{ at: T0 + 12 * MIN, pct: 90 }])
  })

  test('uma hora de zerar que oscila alguns segundos é a mesma janela', () => {
    const before = feed('fiveHour', [[0, 40], [5, 44]])
    const next = track('fiveHour', before, { pct: 45, resetsAt: new Date(T0 + 180 * MIN + 2_000).toISOString() }, T0 + 6 * MIN)
    expect(next?.trail?.length).toBe(3)
  })

  test('as leituras mais velhas que o período de observação saem, e o rastro não cresce sem fim', () => {
    const old = feed('fiveHour', [[0, 10], [40, 20]])
    expect(old?.trail).toEqual([{ at: T0 + 40 * MIN, pct: 20 }]) // 30 minutos para a janela de 5 horas
    const many = feed('week', Array.from({ length: 60 }, (_, i) => [i, i] as const), resetAt(5_000 * MIN))
    expect(many?.trail?.length).toBe(24)
  })

  test('sem leitura nova não há janela, e sem hora de zerar ela segue sem uma', () => {
    expect(track('fiveHour', feed('fiveHour', [[0, 40]]), undefined, T0)).toBeUndefined()
    const bare = track('week', undefined, { pct: 12 }, T0)
    expect(bare).toEqual({ pct: 12, trail: [{ at: T0, pct: 12 }] })
  })

  test('as duas janelas de uma medição andam juntas', () => {
    const first = paced({}, { fiveHour: { pct: 10, resetsAt: resetAt(60 * MIN) } }, T0)
    expect(first.fiveHour?.trail).toEqual([{ at: T0, pct: 10 }])
    expect(first.week).toBeUndefined()
    const second = paced(first, { fiveHour: { pct: 12, resetsAt: resetAt(60 * MIN) }, week: { pct: 5 } }, T0 + MIN)
    expect(second.fiveHour?.trail?.length).toBe(2)
    expect(second.week?.trail).toEqual([{ at: T0 + MIN, pct: 5 }])
  })
})

describe('a previsão de quando uma janela enche', () => {
  test('no ritmo das leituras, enche antes de zerar: diz em quanto tempo', () => {
    // de 40% a 60% em 10 minutos: 2 pontos por minuto, faltam 40 pontos: 20 minutos; zera em 170
    const limit = feed('fiveHour', [[0, 40], [10, 60]])
    expect(fullIn('fiveHour', limit, T0 + 10 * MIN)).toBe(20 * MIN)
  })

  test('o ritmo conta até agora: uso parado esfria a previsão, até ela sumir', () => {
    const limit = feed('fiveHour', [[0, 40], [10, 60]])
    // 20 pontos em 20 minutos: 1 por minuto, 40 minutos
    expect(fullIn('fiveHour', limit, T0 + 20 * MIN)).toBe(40 * MIN)
    // passado o período de observação sem leitura nova, não há ritmo a dizer
    expect(fullIn('fiveHour', limit, T0 + 45 * MIN)).toBeNull()
  })

  test('quando ela zera antes de encher, não há o que avisar', () => {
    const limit = feed('fiveHour', [[0, 40], [10, 42]], resetAt(60 * MIN)) // 0,2 ponto por minuto: 290 minutos
    expect(fullIn('fiveHour', limit, T0 + 10 * MIN)).toBeNull()
  })

  test('leituras de menos não bastam: pouco tempo, pouca subida, uma leitura só, ou nenhuma', () => {
    expect(fullIn('fiveHour', feed('fiveHour', [[0, 40], [2, 60]]), T0 + 2 * MIN)).toBeNull() // 2 minutos
    expect(fullIn('fiveHour', feed('fiveHour', [[0, 40], [10, 41]]), T0 + 10 * MIN)).toBeNull() // 1 ponto
    expect(fullIn('fiveHour', feed('fiveHour', [[0, 40]]), T0 + 10 * MIN)).toBeNull()
    expect(fullIn('fiveHour', undefined, T0)).toBeNull()
    expect(fullIn('fiveHour', { pct: 50 }, T0)).toBeNull()
  })

  test('sem saber quando zera, ou já cheia, não avisa', () => {
    expect(fullIn('fiveHour', feed('fiveHour', [[0, 40], [10, 60]], null), T0 + 10 * MIN)).toBeNull()
    expect(fullIn('fiveHour', feed('fiveHour', [[0, 80], [10, 100]]), T0 + 10 * MIN)).toBeNull()
  })

  test('a janela de 7 dias pede mais tempo de leitura: um pico de minutos não diz nada sobre ela', () => {
    const week = (readings: readonly (readonly [number, number])[]) => feed('week', readings, resetAt(3 * 24 * 60 * MIN))
    expect(fullIn('week', week([[0, 40], [10, 44]]), T0 + 10 * MIN)).toBeNull()
    // 6 pontos em 2 horas: 3 por hora, faltam 54: 18 horas, antes dos 3 dias que faltam para zerar
    expect(fullIn('week', week([[0, 40], [120, 46]]), T0 + 120 * MIN)).toBe(18 * 60 * MIN)
  })
})
