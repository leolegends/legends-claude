import { describe, expect, test } from 'claude-code/testing'

import { LANGUAGES, localeLanguage, stringsOf } from './i18n'

const PT = stringsOf('pt')
const EN = stringsOf('en')

// Os textos de um idioma como pares caminho → texto; os que dependem de um valor são chamados com um de exemplo.
const flat = (value: unknown, path = ''): [string, string][] => {
  if (typeof value === 'string') return [[path, value]]
  if (typeof value === 'function') return [[path, String((value as (...args: unknown[]) => unknown)(2, 'x'))]]
  return Object.entries(value as object).flatMap(([key, inner]) => flat(inner, path ? `${path}.${key}` : key))
}
const texts = (strings: unknown) => new Map(flat(strings))

describe('os dois idiomas', () => {
  test('têm exatamente os mesmos textos, e nenhum vazio', () => {
    expect([...texts(EN).keys()]).toEqual([...texts(PT).keys()])
    for (const strings of [PT, EN]) for (const [path, text] of flat(strings)) expect([path, text.trim().length > 0]).toEqual([path, true])
  })

  test('só ficam iguais nos dois os textos que são mesmo iguais: nenhuma tradução esquecida', () => {
    const pt = texts(PT)
    const same = [...texts(EN)].filter(([path, text]) => pt.get(path) === text).map(([path]) => path)
    // "pixels" é a mesma palavra nas duas línguas
    expect(same).toEqual(['noEffort', 'tools', 'pickEffort', 'accents.claude', 'accents.mono', 'speeds.normal', 'sizes.normal', 'backends.image'])
  })

  test('o plural acompanha a contagem em cada um', () => {
    expect([PT.more(1), PT.more(3)]).toEqual(['+1 agente', '+3 agentes'])
    expect([EN.more(1), EN.more(3)]).toEqual(['+1 agent', '+3 agents'])
    expect([PT.tools(1), PT.tools(14)]).toEqual(['1 tool', '14 tools'])
    expect([EN.tools(1), EN.tools(14)]).toEqual(['1 tool', '14 tools'])
  })

  test('os avisos levam os valores que recebem', () => {
    for (const strings of [PT, EN]) {
      expect(strings.tooNarrow(60)).toContain('60')
      expect(strings.demoNarrow(60)).toContain('60')
      expect(strings.switchFailed('model', 'sem acesso')).toContain('model')
      expect(strings.switchFailed('model', 'sem acesso')).toContain('sem acesso')
      expect(strings.saveFailed('disco cheio')).toContain('disco cheio')
    }
  })

  test('os textos de um idioma são sempre o mesmo objeto, e diferentes dos do outro', () => {
    expect(stringsOf('pt')).toBe(PT)
    expect(stringsOf('en')).toBe(EN)
    expect(PT).not.toBe(EN)
  })

  test('cada idioma aparece na lista com o nome escrito nele mesmo', () => {
    expect(LANGUAGES).toEqual([{ id: 'pt', label: 'Português' }, { id: 'en', label: 'English' }])
  })
})

describe('o idioma que o sistema pede', () => {
  test('um locale português é português; qualquer outro, ou nenhum, inglês', () => {
    expect(['pt_BR.UTF-8', 'pt_PT', 'pt', 'PT_br', 'pt-BR', 'pt@euro'].map(l => localeLanguage(l))).toEqual(['pt', 'pt', 'pt', 'pt', 'pt', 'pt'])
    expect(['en_US.UTF-8', 'es_ES.UTF-8', 'C', 'POSIX', 'ptx', ''].map(l => localeLanguage(l))).toEqual(['en', 'en', 'en', 'en', 'en', 'en'])
    expect(localeLanguage()).toBe('en')
    expect(localeLanguage(undefined, undefined, undefined)).toBe('en')
  })

  test('vale o primeiro locale definido, na ordem do sistema: LC_ALL, LC_MESSAGES, LANG', () => {
    expect(localeLanguage(undefined, undefined, 'pt_BR.UTF-8')).toBe('pt')
    expect(localeLanguage('', '', 'pt_BR.UTF-8')).toBe('pt') // vazio é o mesmo que não definido
    expect(localeLanguage('pt_BR.UTF-8', undefined, 'en_US.UTF-8')).toBe('pt')
    expect(localeLanguage('en_US.UTF-8', 'pt_BR.UTF-8', 'pt_BR.UTF-8')).toBe('en')
  })
})
