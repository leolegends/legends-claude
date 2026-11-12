import { describe, expect, test } from 'claude-code/testing'

import { blend, hexOf, mix, rainbow, rgbOf } from './color'

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

  test('as cores do tema que o palco em pixels pinta têm todas um hex, no escuro e no claro', () => {
    for (const paint of ['claude', 'text', 'subtle', 'error', 'success', 'warning', 'suggestion', 'planMode', 'bashBorder', 'merged'])
      for (const isLight of [false, true]) expect(hexOf(paint, isLight)).not.toBe('#808080')
  })
})

describe('uma tinta como número', () => {
  test('um hex ou uma cor do tema vira 0xRRGGBB', () => {
    expect(rgbOf('#5fa8ff')).toBe(0x5fa8ff)
    expect(rgbOf('claude')).toBe(0xd97757)
    expect(rgbOf('suggestion', true)).toBe(0x5769f7)
  })

  test('uma tinta apagada (com ~ na frente) é a cor dela, sem o sinal', () => {
    expect(rgbOf('~claude')).toBe(0xd97757)
  })

  test('uma tinta desconhecida vale cinza', () => {
    expect(rgbOf('azul-petróleo')).toBe(0x808080)
  })
})

describe('misturar dois números de cor', () => {
  test('0 é a primeira, 1 a segunda, e o meio fica entre as duas', () => {
    expect(blend(0x000000, 0xffffff, 0)).toBe(0x000000)
    expect(blend(0x000000, 0xffffff, 1)).toBe(0xffffff)
    expect(blend(0x000000, 0xffffff, 0.5)).toBe(0x808080)
    expect(blend(0xff0000, 0x0000ff, 0.25)).toBe(0xbf0040)
  })

  test('dá o mesmo que a mistura em hex', () => {
    expect(blend(0xd97757, 0x0b0b10, 0.42)).toBe(rgbOf(mix('#D97757', '#0B0B10', 0.42)))
  })

  test('uma quantia fora de 0 a 1, ou que não é número, fica na ponta', () => {
    expect(blend(0x102030, 0x405060, -3)).toBe(0x102030)
    expect(blend(0x102030, 0x405060, 7)).toBe(0x405060)
    expect(blend(0x102030, 0x405060, Number.NaN)).toBe(0x102030)
  })
})
