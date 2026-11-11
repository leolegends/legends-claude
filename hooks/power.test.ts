import { describe, expect, test } from 'claude-code/testing'

import { SPINNER } from './effects'
import { AURA_MAX, EFFORTS, PLAIN, TIER_NAMES, auraOf, energyOf, idleSpark, levelOf, lookOf, power, powerOf, sparkAt, tierOf } from './power'
import type { Tier } from './power'

const TIERS: Tier[] = [0, 1, 2, 3]

describe('a classe do modelo', () => {
  test('sai da família no id, em qualquer formato', () => {
    expect(tierOf('claude-haiku-5-5')).toBe(0)
    expect(tierOf('claude-sonnet-5-5')).toBe(1)
    expect(tierOf('claude-opus-5-5[1m]')).toBe(2)
    expect(tierOf('claude-fable-5-2')).toBe(3)
    expect(tierOf('claude-mythos-5-2')).toBe(3)
    expect(tierOf('us.anthropic.claude-opus-4-1-20250805-v1:0')).toBe(2)
    expect(tierOf('claude-3-5-haiku-20241022')).toBe(0)
    expect(tierOf('OPUS')).toBe(2)
  })

  test('um modelo desconhecido, ou nenhum, fica com a classe de Sonnet: a faísca de sempre', () => {
    for (const model of ['gpt-x', '', null, undefined]) expect(tierOf(model)).toBe(1)
    expect(idleSpark(tierOf(null))).toBe('✻')
  })

  test('cada classe tem o seu nome', () => {
    expect(TIERS.map(tier => TIER_NAMES[tier])).toEqual(['Haiku', 'Sonnet', 'Opus', 'Fable'])
  })
})

describe('o degrau do effort', () => {
  test('vai de 0 (low) a 4 (max), na ordem dos níveis', () => {
    expect(EFFORTS.map(levelOf)).toEqual([0, 1, 2, 3, 4])
  })

  test('um effort ausente ou desconhecido é o mais leve; um número vale como high', () => {
    for (const effort of [null, undefined, '', 'turbo']) expect(levelOf(effort)).toBe(0)
    expect(levelOf(32_000)).toBe(2)
    expect(levelOf('32000')).toBe(2)
  })

  test('o poder junta a classe e o degrau', () => {
    expect(powerOf('claude-fable-5-2', 'max')).toEqual({ tier: 3, level: 4 })
    expect(powerOf('claude-haiku-5-5', null)).toEqual({ tier: 0, level: 0 })
    expect(powerOf(null, 'high')).toEqual({ tier: 1, level: 2 })
  })

  test('um poder feito de números quaisquer fica dentro dos limites; o que não é número vale zero', () => {
    expect(power(9, -3)).toEqual({ tier: 3, level: 0 })
    expect(power(1.4, 3.6)).toEqual({ tier: 1, level: 4 })
    expect(power(Number.NaN, Number.NaN)).toEqual({ tier: 0, level: 0 })
    expect(power(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)).toEqual({ tier: 0, level: 0 })
  })

  test('a energia do pulso da régua é o degrau do effort; sem effort lido não há o que dizer, e o pulso é o de sempre', () => {
    expect(EFFORTS.map(energyOf)).toEqual([0, 1, 2, 3, 4])
    for (const effort of [null, undefined, '']) expect(energyOf(effort)).toBeUndefined()
    expect(energyOf(32_000)).toBe(2)
  })
})

describe('a força da aura', () => {
  test('cresce com o effort, em toda classe', () => {
    for (const tier of TIERS) {
      const strengths = EFFORTS.map((_, level) => auraOf(power(tier, level)))
      expect(strengths).toEqual([...strengths].sort((a, b) => a - b))
      expect((strengths[4] ?? 0) > (strengths[0] ?? 0)).toBe(true)
    }
  })

  test('Sonnet e Opus não têm aura em low e têm a força do degrau; Haiku começa um degrau depois; Fable, um antes', () => {
    const strengths = (tier: number) => EFFORTS.map((_, level) => auraOf(power(tier, level)))
    expect(strengths(0)).toEqual([0, 0, 1, 2, 3])
    expect(strengths(1)).toEqual([0, 1, 2, 3, 4])
    expect(strengths(2)).toEqual([0, 1, 2, 3, 4])
    expect(strengths(3)).toEqual([1, 2, 3, 4, AURA_MAX])
  })

  test('sem poder não há aura', () => {
    expect(auraOf(PLAIN)).toBe(0)
  })
})

describe('a faísca de cada classe', () => {
  test('parada, cada classe tem o seu glifo, e quanto mais forte a classe maior ele é', () => {
    expect(TIERS.map(idleSpark)).toEqual(['✢', '✻', '❋', '❂'])
  })

  test('a de Sonnet é a do próprio Claude Code, quadro a quadro', () => {
    for (const frame of [0, 1, 5, 6, 10, 23]) expect(sparkAt(1, frame)).toBe(SPINNER[frame % SPINNER.length])
  })

  test('cada classe pulsa com os seus próprios glifos, e o pulso dá a volta', () => {
    const cycle = (tier: Tier) => Array.from({ length: 24 }, (_, frame) => sparkAt(tier, frame)).join('')
    expect(new Set(TIERS.map(cycle)).size).toBe(4)
    expect(sparkAt(0, 0)).toBe('·')
    expect(sparkAt(0, 6)).toBe('·') // seis quadros depois, recomeça
    expect(sparkAt(2, 4)).toBe('❋')
    expect(sparkAt(3, 3)).toBe('❂')
  })

  test('um agente fica fora de fase do vizinho; um quadro negativo não quebra', () => {
    expect(sparkAt(1, 0, 3)).toBe(SPINNER[3])
    expect(sparkAt(3, -1)).toBe(sparkAt(3, 7))
    for (const tier of TIERS) for (const frame of [-9, 0, 1_000_003]) expect(sparkAt(tier, frame).length > 0).toBe(true)
  })

  test('uma classe que não existe fica com a faísca de sempre, em vez de quebrar o desenho', () => {
    for (const tier of [-1, 4, 99, Number.NaN] as unknown as Tier[]) {
      expect(idleSpark(tier)).toBe('✻')
      expect(sparkAt(tier, 4)).toBe(SPINNER[4])
    }
  })
})

describe('o poder pedido num texto', () => {
  const base = power(1, 2)

  test('um modelo e um effort, em qualquer ordem e caixa', () => {
    expect(lookOf('opus max', base)).toEqual({ tier: 2, level: 4 })
    expect(lookOf('  MAX   Fable ', base)).toEqual({ tier: 3, level: 4 })
    expect(lookOf('claude-haiku-5-5 low', base)).toEqual({ tier: 0, level: 0 })
  })

  test('o que o texto não diz fica como estava', () => {
    expect(lookOf('opus', base)).toEqual({ tier: 2, level: 2 })
    expect(lookOf('xhigh', base)).toEqual({ tier: 1, level: 3 })
    expect(lookOf('', base)).toEqual(base)
    expect(lookOf('   ', base)).toEqual(base)
  })

  test('uma palavra que não é modelo nem effort invalida o pedido: nada de atender pela metade', () => {
    for (const text of ['opuss', 'opus maxx', 'qualquer coisa', 'max 9', '__proto__']) expect(lookOf(text, base)).toBeNull()
  })
})
