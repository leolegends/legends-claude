import { describe, expect, test } from 'claude-code/testing'

import { landingKey, languageKey, pickKey } from './focus'
import type { Standing } from './focus'

const MODELS = ['fable', 'opus', 'sonnet', 'haiku']
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const standing = (over: Partial<Standing> = {}): Standing => ({ models: MODELS, model: 'fable 5.2', efforts: EFFORTS, effort: 'high', language: 'pt', ...over })

describe('onde o anel de foco cai quando algo abre na faixa', () => {
  test('no seletor de modelo: o modelo da sessão', () => {
    expect(landingKey('model', standing())).toBe('pick-fable')
    expect(landingKey('model', standing({ model: 'opus 5.5 (1m)' }))).toBe('pick-opus')
    expect(landingKey('model', standing({ model: 'haiku 5.5' }))).toBe('pick-haiku')
  })

  test('sem modelo lido, ou com um que o seletor não oferece: a primeira opção', () => {
    expect(landingKey('model', standing({ model: '' }))).toBe('pick-fable')
    expect(landingKey('model', standing({ model: 'gpt-qualquer' }))).toBe('pick-fable')
  })

  test('no seletor de effort: o do último pedido; sem nenhum, ou com um nível fora da lista, o primeiro', () => {
    expect(landingKey('effort', standing())).toBe('pick-high')
    expect(landingKey('effort', standing({ effort: 'max' }))).toBe('pick-max')
    expect(landingKey('effort', standing({ effort: null }))).toBe('pick-low')
    expect(landingKey('effort', standing({ effort: '37' }))).toBe('pick-low')
  })

  test('na aba de ajustes: o idioma em vigor, a primeira linha dela', () => {
    expect(landingKey('settings', standing())).toBe('set-language-pt')
    expect(landingKey('settings', standing({ language: 'en' }))).toBe('set-language-en')
  })

  test('as chaves são as dos botões: uma por opção', () => {
    expect(MODELS.map(pickKey)).toEqual(['pick-fable', 'pick-opus', 'pick-sonnet', 'pick-haiku'])
    expect([languageKey('pt'), languageKey('en')]).toEqual(['set-language-pt', 'set-language-en'])
  })

  test('sem opção nenhuma a oferecer não quebra: a chave não aponta para ninguém', () => {
    expect(landingKey('model', standing({ models: [] }))).toBe('pick-')
    expect(landingKey('effort', standing({ efforts: [] }))).toBe('pick-')
  })
})
