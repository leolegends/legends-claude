import { describe, expect, test } from 'claude-code/testing'

import type { Element } from './aura'
import type { Shape } from './canvas'
import { rgbOf } from './color'
import { arcShapes, boltShapes, haloShapes, jetShapes, moteShapes, streakShapes } from './hd-aura'
import type { Body, Light } from './hd-aura'
import { power } from './power'
import { CLAWD, drawing } from './sprites'

// O poder no palco em pixels: as camadas do clarão, as fagulhas, os estalos e os raios de cada aura.

const U = 4 // um subpixel de largura, em pixels
const V = 8 // uma sublinha de altura
const LEFT = 120
const FEET = 6 * V
const STANDING = drawing(CLAWD, { eyes: 'open', isArmsUp: false, step: 0, isSitting: false })
const RIGHT = LEFT + CLAWD.width * U
const ELEMENTS: readonly Element[] = ['fire', 'volt', 'star', 'frost']
const TIMES = Array.from({ length: 60 }, (_, tick) => tick)

const body = (strength: number, over: Partial<Body> = {}): Body => ({
  rows: STANDING, left: LEFT, top: FEET - (STANDING.length - 1) * V, feet: FEET, unit: { u: U, v: V }, power: power(2, 4), strength, ...over,
})
const fine = (time: number, isLight = false): Light => ({ time, isLight, isFine: true, grain: { x: U, y: V } })
const coarse = (time: number): Light => ({ time, isLight: false, isFine: false, grain: { x: U, y: V } })

const colorsOf = (shapes: readonly Shape[]) => [...new Set(shapes.map(s => s.rgb))]
const red = (rgb: number) => (rgb >> 16) & 0xff
const green = (rgb: number) => (rgb >> 8) & 0xff
const blue = (rgb: number) => rgb & 0xff
const isWarm = (rgb: number) => red(rgb) > green(rgb) && green(rgb) > blue(rgb)
const isBlue = (rgb: number) => blue(rgb) > green(rgb) && green(rgb) > red(rgb)
// Uma tinta fria: o azul é o canal mais forte dela (os azuis, o ciano, o lilás, o branco de gelo).
const isCold = (rgb: number) => blue(rgb) >= green(rgb) && blue(rgb) >= red(rgb)
const isWhitish = (rgb: number) => red(rgb) > 215 && green(rgb) > 215 && blue(rgb) > 215
// A opacidade de cada tinta do clarão: cada camada tem a sua.
const alphaOf = (shapes: readonly Shape[]) => new Map(shapes.map(s => [s.rgb, s.a]))

describe('o clarão em pixels', () => {
  test('o de uma classe é uma tinta só, em duas opacidades: o miolo e as pontas e beiradas', () => {
    const halo = haloShapes(body(5), fine(5))
    expect(colorsOf(halo)).toEqual([0xa78bfa])
    expect(new Set(halo.map(s => s.a)).size).toBe(2)
  })

  test('o de um elemento tem três camadas, cada uma mais viva que a de fora: a beirada, o miolo e o coração', () => {
    for (const [element, isTone] of [['fire', isWarm], ['volt', isBlue]] as const) {
      const halo = haloShapes(body(5, { element }), fine(5))
      const alphas = alphaOf(halo)
      const layers = [...alphas].sort(([, a], [, b]) => a - b).map(([rgb]) => rgb)
      expect(layers.length).toBe(3)
      const [rim, core, heart] = layers
      if (rim === undefined || core === undefined || heart === undefined) throw new Error('faltou uma camada')
      // de fora para dentro a tinta clareia: o vermelho, o laranja e o amarelo do fogo; os azuis do raio
      expect(red(rim) + green(rim) + blue(rim) < red(core) + green(core) + blue(core)).toBe(true)
      expect(red(core) + green(core) + blue(core) < red(heart) + green(heart) + blue(heart)).toBe(true)
      expect(layers.every(isTone)).toBe(true)
      // e é mais viva que o clarão de uma classe
      expect(Math.min(...alphas.values()) > Math.min(...haloShapes(body(5), fine(5)).map(s => s.a))).toBe(true)
    }
  })

  test('o coração fica para dentro das bordas do corpo e abaixo da ponta das línguas: não faz caixa', () => {
    for (const element of ELEMENTS)
      for (const time of [0, 5, 13.5]) {
        const halo = haloShapes(body(5, { element }), fine(time))
        const brightest = Math.max(...halo.map(s => s.a))
        const heart = halo.filter(s => s.a === brightest)
        expect(heart.length > 0).toBe(true)
        for (const s of heart) {
          expect(s.x >= LEFT + 3 * U && s.x + s.w <= RIGHT - 3 * U).toBe(true) // o Clawd começa na coluna 1 e acaba na 16
          const tip = Math.min(...halo.filter(other => other.x === s.x).map(other => other.y))
          expect(s.y >= tip + 2 * V).toBe(true)
        }
      }
  })

  test('longe do corpo, a coluna inteira é beirada; rente a ele, tem miolo', () => {
    const halo = haloShapes(body(5, { element: 'fire' }), fine(5))
    const dimmest = Math.min(...halo.map(s => s.a))
    const columns = (isIn: (x: number) => boolean) => halo.filter(s => isIn(s.x))
    // o Clawd começa na coluna 1: a quatro subpixels dela (os dois de fora de uma aura que chega a cinco), só beirada
    expect(columns(x => x < LEFT - 3 * U).length > 0).toBe(true)
    expect(columns(x => x < LEFT - 3 * U).every(s => s.a === dimmest)).toBe(true)
    expect(columns(x => x >= LEFT - U && x < LEFT).some(s => s.a > dimmest)).toBe(true)
  })

  test('as tintas não dependem da classe do modelo; a forma, sim, é a da força', () => {
    for (const element of ELEMENTS) {
      const auras = [0, 1, 2, 3].map(tier => haloShapes(body(4, { element, power: power(tier, 4) }), fine(5)))
      for (const aura of auras) expect(aura).toEqual(auras[0])
      expect(haloShapes(body(0, { element }), fine(5))).toEqual([])
    }
  })

  test('o fogo ondula sem parar; o campo do raio salta uma vez por quadro e fica parado dentro dele', () => {
    const tops = (element: Element, time: number) => haloShapes(body(5, { element }), fine(time)).map(s => `${s.x}:${s.y}`).join(' ')
    expect(tops('fire', 5)).not.toBe(tops('fire', 5.5))
    expect(tops('volt', 5)).toBe(tops('volt', 5.5))
    expect(tops('volt', 5)).not.toBe(tops('volt', 6))
  })

  test('no traço em blocos tudo fica na grade de meia célula, com as tintas do elemento', () => {
    for (const element of ELEMENTS) {
      const halo = haloShapes(body(5, { element }), coarse(5))
      expect(halo.length > 0).toBe(true)
      for (const s of halo) {
        expect(s.x % U).toBe(0)
        expect(s.w).toBe(U)
      }
      expect(colorsOf(halo).includes(0xa78bfa)).toBe(false)
    }
  })
})

describe('o que a aura solta, em pixels', () => {
  test('as fagulhas de uma classe e as brasas do fogo são pontos; as do avatar de estrela, estrelinhas de dois traços', () => {
    for (const strength of [3, 4, 5]) {
      expect(moteShapes(body(strength), fine(3)).length).toBe(strength - 1)
      expect(moteShapes(body(strength, { element: 'fire' }), fine(3)).length).toBe(strength - 1)
      const stars = moteShapes(body(strength, { element: 'star' }), fine(3))
      expect(stars.length).toBe((strength - 1) * 2)
      // um traço deitado e um de pé, cruzados no meio
      const [across, upright] = stars
      if (!across || !upright) throw new Error('faltou um traço')
      expect(across.w > across.h && upright.h > upright.w).toBe(true)
      expect(Math.abs(across.x + across.w / 2 - (upright.x + upright.w / 2)) < 0.01).toBe(true)
      expect(Math.abs(across.y + across.h / 2 - (upright.y + upright.h / 2)) < 0.01).toBe(true)
      // em blocos não há como desenhar estrela: volta a ser um ponto da grade
      expect(moteShapes(body(strength, { element: 'star' }), coarse(3)).length).toBe(strength - 1)
    }
    expect(moteShapes(body(2, { element: 'star' }), fine(3))).toEqual([])
  })

  test('as fagulhas têm a tinta do elemento: brasas quentes, faíscas e estrelinhas amarelas', () => {
    for (const element of ['fire', 'volt', 'star'] as const) {
      const motes = TIMES.flatMap(time => moteShapes(body(5, { element }), fine(time)))
      expect(motes.every(s => isWarm(s.rgb))).toBe(true)
    }
    expect(colorsOf(TIMES.flatMap(time => moteShapes(body(5, { element: 'star' }), fine(time)))).length).toBe(1)
    expect(colorsOf(TIMES.flatMap(time => moteShapes(body(5, { element: 'fire' }), fine(time)))).length).toBe(2)
  })

  test('só o avatar de raio estala: raios curtos e amarelos em volta dele, já com a aura fraca', () => {
    for (const time of TIMES) {
      expect(arcShapes(body(5), fine(time))).toEqual([])
      expect(arcShapes(body(5, { element: 'fire' }), fine(time))).toEqual([])
      expect(arcShapes(body(5, { element: 'frost' }), fine(time))).toEqual([])
      expect(arcShapes(body(0, { element: 'volt' }), fine(time))).toEqual([])
    }
    const arcs = TIMES.flatMap(time => arcShapes(body(1, { element: 'volt' }), fine(time)))
    expect(arcs.length > 0).toBe(true)
    for (const s of arcs) {
      expect(isWarm(s.rgb)).toBe(true)
      expect(s.y >= 0 && s.y + s.h <= FEET).toBe(true)
      expect(s.x + s.w <= LEFT + U || s.x >= RIGHT - U).toBe(true)
    }
    // acendem e apagam: o desenho muda ao longo do tempo
    expect(new Set(TIMES.map(time => JSON.stringify(arcShapes(body(4, { element: 'volt' }), fine(time))))).size > 10).toBe(true)
    // e em blocos ficam na grade de meia célula
    for (const s of TIMES.flatMap(time => arcShapes(body(4, { element: 'volt' }), coarse(time)))) expect(s.x % U).toBe(0)
  })

  test('o raio do avatar de raio cai em qualquer classe, desde que as fagulhas sobem, em amarelo; o da classe, só de Opus para cima, na cor do texto', () => {
    const strikes = (over: Partial<Body>, strength: number) => TIMES.filter(time => boltShapes(body(strength, over), fine(time)).length > 0).length
    expect(strikes({ power: power(0, 4) }, 5)).toBe(0)
    expect(strikes({ power: power(0, 4), element: 'volt' }, 2)).toBe(0)
    expect(strikes({ power: power(0, 4), element: 'volt' }, 3) > 0).toBe(true)
    expect(strikes({ element: 'volt' }, 5) > strikes({}, 5)).toBe(true)
    expect(strikes({ power: power(1, 4), element: 'fire' }, 5)).toBe(0)
    expect(strikes({ element: 'fire' }, 4)).toBe(strikes({}, 4))
    const ink = rgbOf('text')
    expect(colorsOf(boltShapes(body(4), fine(0)))).toEqual([ink])
    const yellow = colorsOf(boltShapes(body(3, { element: 'volt' }), fine(0)))
    expect(yellow.length).toBe(1)
    expect(yellow.every(rgb => rgb !== ink && isWarm(rgb))).toBe(true)
    // num tema claro o amarelo escurece, para não sumir no fundo
    const onLight = colorsOf(boltShapes(body(3, { element: 'volt' }), fine(0, true)))
    expect(red(onLight[0] ?? 0) < red(yellow[0] ?? 0)).toBe(true)
  })

  test('os riscos de quem corre e os jatos de quem voa têm as tintas da aura', () => {
    const flying = drawing(CLAWD, { eyes: 'open', isArmsUp: false, step: 0, isSitting: true })
    const streaks = (element?: Element) => TIMES.flatMap(time => streakShapes(body(5, { element }), fine(time), -1))
    const jets = (element?: Element) => TIMES.flatMap(time => jetShapes(body(5, { element, rows: flying, power: power(3, 4) }), fine(time)))
    expect(colorsOf(streaks())).toEqual([0xa78bfa])
    expect(streaks('fire').every(s => isWarm(s.rgb))).toBe(true)
    expect(streaks('volt').every(s => isBlue(s.rgb))).toBe(true)
    expect(jets('fire').length > 0 && jets('fire').every(s => isWarm(s.rgb))).toBe(true)
    expect(jets('volt').length > 0 && jets('volt').every(s => isWarm(s.rgb))).toBe(true) // as faíscas do raio são amarelas
    expect(colorsOf(jets('star')).length).toBe(1)
    expect(streaks('frost').every(s => isBlue(s.rgb))).toBe(true) // o azul do miolo
    expect(jets('frost').length > 0 && jets('frost').every(s => isWhitish(s.rgb))).toBe(true) // a tinta dos flocos
  })
})

describe('o gelo em pixels', () => {
  // Um bicho longe do teto da cena: as pontas dos cristais não batem nele.
  const LOW = { top: 96, feet: 96 + (STANDING.length - 1) * V }
  const HEAD_FROM = LEFT + CLAWD.headFrom * U
  const HEAD_TO = LEFT + (CLAWD.headFrom + CLAWD.headWidth) * U
  // A ponta do clarão em cada coluna sobre a cabeça: o y mais alto que ele pinta ali.
  const tipsAt = (element: Element, time: number) => {
    const halo = haloShapes(body(5, { element, ...LOW }), fine(time)).filter(s => s.x >= HEAD_FROM && s.x < HEAD_TO)
    const xs = [...new Set(halo.map(s => s.x))].sort((a, b) => a - b)
    return xs.map(x => [x, Math.min(...halo.filter(s => s.x === x).map(s => s.y))] as const)
  }
  // As colunas que são ponta: nenhuma das duas vizinhas sobe mais que ela.
  const peaksAt = (element: Element, time: number) => {
    const tips = tipsAt(element, time)
    return tips.filter(([, y], i) => i > 0 && i < tips.length - 1 && y <= (tips[i - 1]?.[1] ?? y) && y <= (tips[i + 1]?.[1] ?? y)).map(([x]) => x)
  }
  const MOMENTS = [0, 3.5, 9, 14.25, 27, 41.75]

  test('o contorno é de cristais: as pontas ficam nas mesmas colunas o tempo todo; as línguas do fogo andam', () => {
    const frost = MOMENTS.map(time => peaksAt('frost', time).join(' '))
    expect(frost[0]?.length ?? 0).toBeGreaterThan(0)
    expect(new Set(frost).size).toBe(1)
    expect(new Set(MOMENTS.map(time => peaksAt('fire', time).join(' '))).size > 1).toBe(true)
  })

  test('é vidro: três camadas frias, e o miolo é a mais apagada; brilham a beirada e, mais ainda, o coração, quase branco', () => {
    const halo = haloShapes(body(5, { element: 'frost' }), fine(5))
    const alphas = alphaOf(halo)
    const layers = [...alphas].sort(([, a], [, b]) => a - b).map(([rgb]) => rgb)
    expect(layers.length).toBe(3)
    const [core, rim, heart] = layers
    if (core === undefined || rim === undefined || heart === undefined) throw new Error('faltou uma camada')
    expect(layers.every(isCold)).toBe(true)
    const sum = (rgb: number) => red(rgb) + green(rgb) + blue(rgb)
    expect(sum(core) < sum(rim) && sum(rim) < sum(heart)).toBe(true)
    expect(isWhitish(heart)).toBe(true)
    // a beirada é a tinta das colunas de fora, longe do corpo
    expect(colorsOf(halo.filter(s => s.x < LEFT - 3 * U))).toEqual([rim])
    // e mesmo o miolo é mais vivo que o clarão de uma classe
    expect(Math.min(...alphas.values()) > Math.min(...haloShapes(body(5), fine(5)).map(s => s.a))).toBe(true)
  })

  test('os cristais crescem aos poucos: dentro de um quadro o contorno já mudou, mas quase nada', () => {
    const move = (element: Element, from: number, to: number) => {
      const before = tipsAt(element, from)
      const after = tipsAt(element, to)
      return Math.max(...before.map(([, y], i) => Math.abs(y - (after[i]?.[1] ?? y))))
    }
    for (const time of [5, 11, 23]) {
      expect(move('frost', time, time + 0.5) > 0).toBe(true)
      expect(move('frost', time, time + 0.5) < V / 2).toBe(true)
    }
    expect(Math.max(...[5, 11, 23].map(time => move('volt', time, time + 1))) > V).toBe(true) // o campo do raio salta
  })

  test('os flocos de neve, no traço fino, são flocos: dois traços cruzados e quatro pontas nas diagonais; em blocos, um ponto da grade', () => {
    for (const strength of [3, 4, 5]) {
      const flakes = moteShapes(body(strength, { element: 'frost' }), fine(3))
      expect(flakes.length).toBe((strength - 1) * 6)
      const [across, upright, ...tips] = flakes.slice(0, 6)
      if (!across || !upright) throw new Error('faltou um traço')
      expect(across.w > across.h && upright.h > upright.w).toBe(true)
      const cx = across.x + across.w / 2
      const cy = across.y + across.h / 2
      expect(Math.abs(cx - (upright.x + upright.w / 2)) < 0.01).toBe(true)
      expect(Math.abs(cy - (upright.y + upright.h / 2)) < 0.01).toBe(true)
      // as quatro pontas: uma em cada diagonal, fora dos dois traços
      expect(tips.length).toBe(4)
      expect(new Set(tips.map(s => `${Math.sign(s.x + s.w / 2 - cx)},${Math.sign(s.y + s.h / 2 - cy)}`)).size).toBe(4)
      const coarseFlakes = moteShapes(body(strength, { element: 'frost' }), coarse(3))
      expect(coarseFlakes.length).toBe(strength - 1)
      for (const s of coarseFlakes) expect(s.x % U === 0 && s.y % V === 0).toBe(true)
    }
    expect(moteShapes(body(2, { element: 'frost' }), fine(3))).toEqual([])
  })

  test('os flocos são brancos, de uma tinta só, e mais escuros num tema claro', () => {
    const flakes = TIMES.flatMap(time => moteShapes(body(5, { element: 'frost' }), fine(time)))
    expect(colorsOf(flakes).length).toBe(1)
    expect(flakes.every(s => isWhitish(s.rgb))).toBe(true)
    const onLight = colorsOf(TIMES.flatMap(time => moteShapes(body(5, { element: 'frost' }), fine(time, true))))
    expect(onLight.length).toBe(1)
    expect(red(onLight[0] ?? 0) < red(colorsOf(flakes)[0] ?? 0)).toBe(true)
  })

  test('os flocos caem, pousam acima da linha dos pés e derretem ali; as fagulhas dos outros sobem', () => {
    // o meio do traço deitado de cada floco (ou o ponto de cada fagulha), ao longo de uma vida inteira
    const heights = (element: Element | undefined, k: number, per: number) =>
      [0, 1, 2, 3, 4, 5, 6, 7].map(age => {
        const mote = moteShapes(body(5, { element, ...LOW }), fine(age - k * 5 + 40))[k * per]
        if (!mote) throw new Error('faltou uma fagulha')
        return mote.y + mote.h / 2
      })
    const snow = heights('frost', 0, 6)
    expect(snow.every((y, age) => age === 0 || y >= (snow[age - 1] ?? y))).toBe(true)
    expect((snow[7] ?? 0) > (snow[0] ?? 0)).toBe(true)
    expect(Math.max(...snow) < LOW.feet).toBe(true)
    const embers = heights('fire', 0, 1)
    expect(embers.every((y, age) => age === 0 || y < (embers[age - 1] ?? y))).toBe(true)
    // pousam: no último quadro da vida o floco não desce mais, e nenhum traço dele passa da linha dos pés
    const landed = [7, 7.25, 7.5, 7.75].map(age => moteShapes(body(5, { element: 'frost', ...LOW }), fine(age + 40)).slice(0, 6))
    for (const flake of landed) {
      const across = flake[0]
      if (!across) throw new Error('faltou o floco')
      expect(Math.abs(across.y + across.h / 2 - (LOW.feet - V / 2)) < 0.01).toBe(true)
      for (const s of flake) expect(s.y + s.h <= LOW.feet + 0.01).toBe(true)
    }
    // derretem: no fim da vida o floco está quase apagado
    const last = landed.at(-1)?.[0]
    expect((last?.a ?? 1) < 0.3).toBe(true)
  })

  test('num tema claro a beirada do clarão é de um azul fechado, não do ciano claro do tema escuro', () => {
    const rimOf = (isLight: boolean) => colorsOf(haloShapes(body(5, { element: 'frost' }), fine(5, isLight)).filter(s => s.x < LEFT - 3 * U))
    expect(rimOf(false).length).toBe(1)
    expect(rimOf(true).length).toBe(1)
    const sum = (rgb: number) => red(rgb) + green(rgb) + blue(rgb)
    expect(sum(rimOf(true)[0] ?? 0) < sum(rimOf(false)[0] ?? 0) - 150).toBe(true)
    expect(isBlue(rimOf(true)[0] ?? 0)).toBe(true)
  })
})
