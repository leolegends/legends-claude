import { describe, expect, test } from 'claude-code/testing'

import { SUGGEST_PCT, URGENT_PCT, contextLine, crossedSuggest, fromContext } from './context-line'
import { stringsOf } from './i18n'
import type { Line } from './parts'

// A linha do contexto, pura: o medidor, a sugestão de compactar e o botão.

const PT = stringsOf('pt')
const EN = stringsOf('en')
const text = (parts: Line['parts'] = []) => parts.map(p => p.text).join('')
const actions = (l: Line) => [...l.parts, ...(l.tail ?? [])].filter(p => p.action).map(p => p.action)

describe('contextLine', () => {
  test('mostra o medidor, a porcentagem e os tokens sobre a janela, com o botão discreto', () => {
    const l = contextLine({ window: 200_000, tokens: 62_000, pct: 31 }, 'idle', PT)
    expect(text(l.parts)).toBe('contexto ▰▰▰▱▱▱▱▱▱▱ 31% · 62k/200k')
    expect(text(l.tail)).toBe('⟳ compactar')
    expect(l.tail?.[0]).toMatchObject({ dim: true, action: 'compact' })
  })

  test('acima da linha da sugestão, sugere compactar em âmbar', () => {
    const l = contextLine({ window: 200_000, tokens: 150_000, pct: 75 }, 'idle', PT)
    expect(text(l.tail)).toBe('hora de compactar? ⟳ compactar')
    expect(l.tail?.every(p => p.color === 'warning')).toBe(true)
    expect(l.parts.find(p => p.text.includes('▰'))?.color).toBe('warning')
  })

  test('muito alto, insiste em vermelho', () => {
    const l = contextLine({ window: 1_000_000, tokens: 900_000, pct: 90 }, 'idle', EN)
    expect(text(l.parts)).toContain('90% · 900k/1M')
    expect(text(l.tail)).toBe('compact before Claude Code does it on its own ⟳ compact')
    expect(l.tail?.every(p => p.color === 'error')).toBe(true)
  })

  test('armado, o botão pede a confirmação; compactando, não há botão', () => {
    expect(text(contextLine({ window: 200_000, tokens: 10_000, pct: 5 }, 'armed', PT).tail)).toBe('⟳ confirmar compactação?')
    const running = contextLine({ window: 200_000, tokens: 10_000, pct: 5 }, 'running', PT)
    expect(text(running.tail)).toBe('compactando…')
    expect(actions(running)).toEqual([])
  })

  test('sem leitura da janela atual mostra só a janela, sem botão: não há o que compactar', () => {
    const l = contextLine({ window: 200_000 }, 'idle', PT)
    expect(text(l.parts)).toBe('contexto ▱▱▱▱▱▱▱▱▱▱ — / 200k')
    expect(actions(l)).toEqual([])
  })

  test('um percentual fora de 0 a 100 não estoura o medidor', () => {
    expect(text(contextLine({ window: 100, tokens: 150, pct: 150 }, 'idle', PT).parts)).toContain('▰▰▰▰▰▰▰▰▰▰ 100%')
  })
})

describe('crossedSuggest', () => {
  test('avisa só ao cruzar a linha subindo', () => {
    expect(crossedSuggest(SUGGEST_PCT - 1, SUGGEST_PCT)).toBe(true)
    expect(crossedSuggest(undefined, URGENT_PCT)).toBe(true)
    expect(crossedSuggest(SUGGEST_PCT, SUGGEST_PCT + 5)).toBe(false) // já estava acima
    expect(crossedSuggest(80, 20)).toBe(false) // desceu (compactou)
    expect(crossedSuggest(50, undefined)).toBe(false)
  })
})

describe('fromContext', () => {
  test('guarda a janela e, quando há, a leitura', () => {
    expect(fromContext({ window: 200_000, tokens: 5, percent: 1 })).toEqual({ window: 200_000, tokens: 5, pct: 1 })
    expect(fromContext({ window: 200_000 })).toEqual({ window: 200_000 })
    expect(fromContext({ window: 0 })).toBeUndefined()
    expect(fromContext(undefined)).toBeUndefined()
  })
})
