import { describe, expect, test } from 'claude-code/testing'

import { hexOf, mix, rainbow } from './color'

describe('misturar duas cores', () => {
  test('0 é a primeira, 1 a segunda, e o meio fica entre as duas', () => {
    expect(mix('#000000', '#FFFFFF', 0)).toBe('#000000')
    expect(mix('#000000', '#FFFFFF', 1)).toBe('#FFFFFF')
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080')
    expect(mix('#FF0000', '#0000FF', 0.25)).toBe('#BF0040')
  })

  test('uma quantia fora de 0 a 1 fica na ponta', () => {
    expect(mix('#102030', '#405060', -3)).toBe('#102030')
    expect(mix('#102030', '#405060', 7)).toBe('#405060')
  })

  test('aceita hex em qualquer caixa e devolve em maiúsculas; o que não é hex vale cinza', () => {
    expect(mix('#d97757', '#D97757', 0.5)).toBe('#D97757')
    expect(mix('claude', '#000000', 0)).toBe('#808080')
  })

  test('uma quantia que não é número não estraga a cor: fica a primeira', () => {
    for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(mix('#102030', '#405060', amount)).toBe('#102030')
  })
})

describe('o arco-íris', () => {
  test('vermelho em 0, verde em 120, azul em 240, num tom médio', () => {
    expect(rainbow(0)).toBe('#F15555')
    expect(rainbow(120)).toBe('#55F155')
    expect(rainbow(240)).toBe('#5555F1')
  })

  test('dá a volta em 360 graus, para os dois lados', () => {
    expect(rainbow(360)).toBe(rainbow(0))
    expect(rainbow(-120)).toBe(rainbow(240))
    expect(rainbow(725)).toBe(rainbow(5))
  })

  test('anda em degraus: matizes vizinhos dão a mesma cor, e a volta inteira tem poucas cores', () => {
    expect(rainbow(3)).toBe(rainbow(0))
    expect(rainbow(8)).toBe(rainbow(12))
    expect(new Set(Array.from({ length: 360 }, (_, degrees) => rainbow(degrees))).size).toBe(30)
  })

  test('toda cor é um hex de seis dígitos, mesmo com um matiz que não é número', () => {
    for (const degrees of [-500, 0, 59, 61, 179, 181, 299, 301, 359.9, 10_000, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
      expect(/^#[0-9A-F]{6}$/.test(rainbow(degrees))).toBe(true)
    expect(rainbow(Number.NaN)).toBe(rainbow(0))
  })
})

describe('o hex de uma tinta', () => {
  test('um hex é ele mesmo, em maiúsculas', () => {
    expect(hexOf('#5fa8ff')).toBe('#5FA8FF')
  })

  test('uma cor do tema tem um hex aproximado para o escuro e outro para o claro', () => {
    expect(hexOf('claude')).toBe('#D97757')
    expect(hexOf('text')).not.toBe(hexOf('text', true))
    expect(hexOf('suggestion', true)).toBe('#5769F7')
  })

  test('uma tinta desconhecida vale cinza', () => {
    expect(hexOf('azul-petróleo')).toBe('#808080')
  })
})
