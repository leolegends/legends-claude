import { describe, expect, test } from 'claude-code/testing'

import { MAX_LEVEL, MAX_TOKENS, fmtTokens, levelLine, levelOf, levelUp, tokensFor, xpOf } from './level'
import { stringsOf } from './i18n'

const PT = stringsOf('pt').levels
const text = (parts: readonly { text: string }[] = []) => parts.map(p => p.text).join('')

describe('a curva', () => {
  test('o nível 1 começa no zero e o 100 pede o máximo', () => {
    expect(tokensFor(1)).toBe(0)
    expect(tokensFor(MAX_LEVEL)).toBe(MAX_TOKENS)
  })

  test('cada nível pede mais que o anterior', () => {
    for (let l = 2; l <= MAX_LEVEL; l += 1) expect(tokensFor(l)).toBeGreaterThan(tokensFor(l - 1))
  })

  test('os primeiros níveis vêm rápido e o 100 é para muito tempo de uso', () => {
    expect(tokensFor(2)).toBeLessThan(50_000)
    expect(tokensFor(10)).toBeLessThan(10_000_000)
    expect(tokensFor(50)).toBeGreaterThan(200_000_000)
  })

  test('levelOf acerta a borda de cada nível', () => {
    for (const l of [2, 10, 37, 99, 100]) {
      expect(levelOf(tokensFor(l)).level).toBe(l)
      expect(levelOf(tokensFor(l) - 1).level).toBe(l - 1)
    }
  })

  test('não passa do 100 nem fica abaixo do 1, com qualquer entrada', () => {
    expect(levelOf(MAX_TOKENS * 10)).toMatchObject({ level: 100, isMax: true, progress: 1 })
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) expect(levelOf(bad).level).toBe(1)
  })

  test('o progresso vai de 0 a 1 dentro do nível', () => {
    const mid = Math.round((tokensFor(20) + tokensFor(21)) / 2)
    const lv = levelOf(mid)
    expect(lv.level).toBe(20)
    expect(lv.progress).toBeGreaterThan(0.45)
    expect(lv.progress).toBeLessThan(0.55)
  })

  test('um título a cada dez níveis', () => {
    expect([1, 10, 11, 55, 91, 100].map(l => levelOf(tokensFor(l)).title)).toEqual([0, 0, 1, 5, 9, 9])
  })
})

describe('os tokens que contam', () => {
  test('entrada, saída e escrita no cache; a leitura do cache fica de fora', () => {
    expect(xpOf({ input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: 1_000_000 })).toBe(60)
  })

  test('sem contagem, ou com contagem estragada, nada conta', () => {
    expect(xpOf(undefined)).toBe(0)
    expect(xpOf({ input_tokens: -1, output_tokens: Number.NaN, cache_creation_input_tokens: 5 })).toBe(5)
  })

  test('levelUp diz o nível novo só quando ele sobe', () => {
    expect(levelUp(0, 10)).toBeNull()
    expect(levelUp(tokensFor(5) - 1, tokensFor(5))?.level).toBe(5)
    expect(levelUp(tokensFor(5) - 1, tokensFor(8))?.level).toBe(8) // vários de uma vez: avisa o último
  })
})

describe('a linha da barra', () => {
  test('nível, medidor e porcentagem à esquerda; título, total e o que falta à direita', () => {
    const line = levelLine(tokensFor(23), PT, ',')
    expect(text(line.parts)).toBe('nível 23 ▱▱▱▱▱▱▱▱▱▱ 0%')
    expect(text(line.tail)).toMatch(/^Artesão · [\d,]+M · faltam [\d,]+M$/)
  })

  test('no 100, medidor cheio, MAX e nada faltando', () => {
    const line = levelLine(MAX_TOKENS, PT, ',')
    expect(text(line.parts)).toBe('nível 100 ▰▰▰▰▰▰▰▰▰▰ MAX')
    expect(text(line.tail)).toBe('Imortal · 2B')
  })

  test('os números curtos usam o separador do idioma', () => {
    expect([fmtTokens(940), fmtTokens(12_300), fmtTokens(1_250_000, ','), fmtTokens(1_250_000, '.'), fmtTokens(345_000_000)])
      .toEqual(['940', '12k', '1,3M', '1.3M', '345M'])
  })
})
