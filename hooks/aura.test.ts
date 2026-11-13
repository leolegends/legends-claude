import { describe, expect, test } from 'claude-code/testing'

import { arcsOf, bodyShade, canFly, eyesOf, fireworksOf, glowOf, jetsOf, sparksOf, streaksOf } from './aura'
import type { Dot, Element, Figure, Mood } from './aura'
import { EYE } from './pixels'
import type { Glow, Shade } from './pixels'
import { power } from './power'
import type { Power } from './power'
import { CLAWD, MINI, drawing } from './sprites'

const FLOOR = 6
const LEFT = 30
const STANDING = drawing(CLAWD, { eyes: 'open', isArmsUp: false, step: 0, isSitting: false })
const RIGHT = LEFT + CLAWD.width - 1 // a última coluna do desenho
const DOT_STRIDE = 4096 // a chave de um ponto: y * DOT_STRIDE + x

const figure = (strength: number, over: Partial<Figure> = {}): Figure => ({
  bitmap: STANDING, left: LEFT, top: FLOOR + 1 - STANDING.length, floor: FLOOR, tint: 'claude', strength, ...over,
})
const at = (tick: number, isLight = false): Mood => ({ tick, isLight })

// Tudo o que um clarão pinta numa área folgada em volta do bicho: "x,y" → tinta.
const litBy = (glow: Glow | null): Map<string, string> => {
  const lit = new Map<string, string>()
  if (!glow) return lit
  for (let x = LEFT - 16; x <= RIGHT + 16; x += 1)
    for (let y = -2; y <= FLOOR + 3; y += 1) {
      const paint = glow(x, y)
      if (paint !== undefined) lit.set(`${x},${y}`, paint)
    }
  return lit
}
const auraAt = (p: Power, strength: number, mood: Mood = at(5), over: Partial<Figure> = {}) => litBy(glowOf(p, figure(strength, over), mood))
const coords = (lit: Map<string, string>) => [...lit.keys()].map(key => key.split(',').map(Number) as [number, number])
const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const brightness = (hex: string) => channels(hex).reduce((n, c) => n + c, 0)
const placed = (dots: readonly Dot[]) =>
  dots.flatMap(([key, paint]) => (key === undefined ? [] : [{ x: key % DOT_STRIDE, y: Math.floor(key / DOT_STRIDE), paint }]))

describe('a aura', () => {
  test('sem força não há aura, seja qual for o poder', () => {
    expect(glowOf(power(3, 4), figure(0), at(5))).toBeNull()
    expect(glowOf(power(0, 0), figure(0), at(5))).toBeNull()
  })

  test('cresce com a força: cada degrau pinta mais em volta do bicho', () => {
    for (const tick of [0, 7, 13, 40]) {
      const sizes = [1, 2, 3, 4, 5].map(strength => auraAt(power(2, 4), strength, at(tick)).size)
      for (const [i, size] of sizes.entries()) expect(i === 0 || size > (sizes[i - 1] ?? 0)).toBe(true)
    }
  })

  test('para uma sublinha acima do chão: a linha dos pés fica limpa, e nada sai de cena por cima', () => {
    for (const strength of [1, 3, 5])
      for (const [, y] of coords(auraAt(power(3, 4), strength))) {
        expect(y < FLOOR).toBe(true)
        expect(y >= 0).toBe(true)
      }
  })

  test('fica em volta do bicho: quanto mais forte, mais longe chega, e nunca além disso', () => {
    for (const strength of [1, 2, 3, 4, 5]) {
      const columns = coords(auraAt(power(1, 2), strength)).map(([x]) => x)
      expect(Math.min(...columns) >= LEFT - strength).toBe(true)
      expect(Math.max(...columns) <= RIGHT + strength).toBe(true)
    }
    expect(Math.min(...coords(auraAt(power(1, 2), 5)).map(([x]) => x)) < LEFT).toBe(true)
  })

  test('tem a cor da classe: verde em Haiku, azul em Sonnet, roxo em Opus, com miolo e beirada', () => {
    const paints = (tier: number) => [...new Set(auraAt(power(tier, 4), 4).values())]
    for (const tier of [0, 1, 2]) expect(paints(tier).length).toBe(2)
    for (const hex of paints(0)) {
      const [r, g, b] = channels(hex)
      expect(g > r && g > b).toBe(true)
    }
    for (const hex of paints(1)) {
      const [r, g, b] = channels(hex)
      expect(b > g && g > r).toBe(true)
    }
    for (const hex of paints(2)) {
      const [r, g, b] = channels(hex)
      expect(b > r && r > g).toBe(true)
    }
  })

  test('a de Fable é furta-cor: muitas cores ao longo dela, e elas correm de um quadro para outro', () => {
    const now = auraAt(power(3, 4), 5, at(0))
    const later = auraAt(power(3, 4), 5, at(9))
    expect(new Set(now.values()).size > 4).toBe(true)
    expect([...now].some(([key, paint]) => later.has(key) && later.get(key) !== paint)).toBe(true)
  })

  test('num tema escuro esmaece para o escuro; num claro, para o branco', () => {
    for (const tier of [0, 1, 2, 3]) {
      const dark = auraAt(power(tier, 4), 4, at(5))
      const light = auraAt(power(tier, 4), 4, at(5, true))
      expect([...light.keys()]).toEqual([...dark.keys()]) // a mesma forma
      for (const [key, paint] of dark) expect(brightness(light.get(key) ?? '#000000') > brightness(paint)).toBe(true)
    }
  })

  test('as línguas sobem e descem: o contorno muda de um quadro para outro, e o mesmo quadro desenha sempre igual', () => {
    const outline = (tick: number) => [...auraAt(power(2, 4), 4, at(tick)).keys()].join(' ')
    expect(outline(3)).toBe(outline(3))
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7].map(outline)).size > 4).toBe(true)
  })

  test('acompanha o corpo: em quem pula, sobe com ele; num ajudante, é do tamanho dele', () => {
    const top = (lit: Map<string, string>) => Math.min(...coords(lit).map(([, y]) => y))
    // sem labaredas (força 1), o topo do clarão é o topo do corpo
    expect(top(auraAt(power(1, 1), 1))).toBe(FLOOR + 1 - STANDING.length)
    expect(top(auraAt(power(1, 1), 1, at(5), { top: 0 }))).toBe(0)
    const mini = drawing(MINI, { eyes: 'open', isArmsUp: false, step: 0, isSitting: false })
    const small = litBy(glowOf(power(1, 2), figure(2, { bitmap: mini, top: FLOOR + 1 - mini.length }), at(5)))
    const columns = coords(small).map(([x]) => x)
    expect(small.size > 0).toBe(true)
    expect(Math.max(...columns) <= LEFT + MINI.width - 1 + 2).toBe(true)
  })
})

describe('os olhos e o corpo', () => {
  const paintsOf = (shade: Shade, mark = '#') => {
    const paints = new Set<string>()
    for (let x = LEFT; x <= RIGHT; x += 1) for (let y = 2; y <= FLOOR; y += 1) paints.add(typeof shade === 'string' ? shade : shade(x, y, mark))
    return paints
  }

  test('de Opus para cima os olhos acendem, cada classe com a sua luz', () => {
    expect(eyesOf(power(0, 4))).toBeNull()
    expect(eyesOf(power(1, 4))).toBeNull()
    expect(typeof eyesOf(power(2, 0))).toBe('string')
    expect(eyesOf(power(3, 0))).not.toBe(eyesOf(power(2, 0)))
    const opus = bodyShade(power(2, 0), figure(0), at(5))
    expect(typeof opus === 'string' ? opus : opus(LEFT + 5, 3, EYE)).toBe(eyesOf(power(2, 0)))
  })

  test('só Fable voa', () => {
    expect([0, 1, 2, 3].map(tier => canFly(power(tier, 4)))).toEqual([false, false, false, true])
  })

  test('Haiku não tem brilho no corpo: é a cor dele e pronto', () => {
    expect(bodyShade(power(0, 4), figure(3), at(5))).toBe('claude')
  })

  test('de Sonnet para cima uma faixa de luz atravessa o corpo de tempos em tempos, e fora dela ele é da cor de sempre', () => {
    for (const tier of [1, 2, 3]) {
      const frames = Array.from({ length: 60 }, (_, tick) => paintsOf(bodyShade(power(tier, 0), figure(0), at(tick))))
      expect(frames.every(paints => paints.has('claude'))).toBe(true)
      expect(frames.some(paints => paints.size > 1)).toBe(true) // a faixa passando
      expect(frames.some(paints => paints.size === 1)).toBe(true) // o intervalo entre duas passadas
    }
  })

  test('quanto mais forte a classe, mais vezes a faixa passa', () => {
    const shining = (tier: number) =>
      Array.from({ length: 264 }, (_, tick) => paintsOf(bodyShade(power(tier, 0), figure(0), at(tick))).size > 1).filter(Boolean).length
    expect(shining(2) > shining(1)).toBe(true)
    expect(shining(3) > shining(2)).toBe(true)
  })

  test('a cor do corpo é uma por célula, para a célula nunca ter mais de duas: com o bicho numa célula inteira ou meia célula adiante', () => {
    for (const left of [LEFT, LEFT + 1])
      for (const tier of [1, 2, 3])
        for (let tick = 0; tick < 48; tick += 1) {
          const shade = bodyShade(power(tier, 4), figure(5, { left }), at(tick))
          if (typeof shade === 'string') continue
          for (let x = left & ~1; x <= left + CLAWD.width; x += 2)
            for (let y = 2; y <= FLOOR; y += 2)
              expect(new Set([shade(x, y, '#'), shade(x + 1, y, '#'), shade(x, y + 1, '#'), shade(x + 1, y + 1, '#')]).size).toBe(1)
        }
  })

  test('a faixa de Fable mal termina e já recomeça: o corpo passa mais tempo brilhando do que sem brilho', () => {
    const frames = Array.from({ length: 80 }, (_, tick) => paintsOf(bodyShade(power(3, 0), figure(0), at(tick))).size > 1)
    expect(frames.filter(Boolean).length > frames.length / 2).toBe(true)
    expect(frames.some(isShining => !isShining)).toBe(true) // e ainda assim há um respiro entre duas passadas
  })
})

describe('fagulhas e raios', () => {
  const TICKS = Array.from({ length: 60 }, (_, tick) => tick)

  test('fagulhas só com a aura forte, e tantas mais quanto mais forte', () => {
    for (const strength of [0, 1, 2]) for (const tick of TICKS) expect(sparksOf(power(1, 4), figure(strength), at(tick))).toEqual([])
    for (const strength of [3, 4, 5]) for (const tick of TICKS) expect(sparksOf(power(1, 4), figure(strength), at(tick)).length).toBe(strength - 1)
  })

  test('as fagulhas sobem pelos lados do bicho, acima do chão', () => {
    for (const tick of TICKS)
      for (const { x, y } of placed(sparksOf(power(1, 4), figure(5), at(tick)))) {
        expect(y < FLOOR).toBe(true)
        expect(x < LEFT + 2 || x > RIGHT - 2).toBe(true)
      }
  })

  test('o raio cai de tempos em tempos, do alto até o chão, na cor do texto, de um lado e depois do outro', () => {
    const boltAt = (tick: number) => placed(sparksOf(power(2, 4), figure(4), at(tick))).filter(dot => dot.paint === 'text')
    expect(boltAt(0).map(dot => dot.y)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(boltAt(1).length).toBe(FLOOR + 1) // dura dois quadros
    expect(boltAt(2)).toEqual([])
    expect(boltAt(20)).toEqual([])
    expect(boltAt(0).every(dot => dot.x < LEFT)).toBe(true)
    expect(boltAt(21).every(dot => dot.x > RIGHT)).toBe(true)
    // em ziguezague: cada passo anda no máximo um subpixel para o lado
    const xs = boltAt(0).map(dot => dot.x)
    expect(xs.every((x, i) => i === 0 || Math.abs(x - (xs[i - 1] ?? x)) <= 1)).toBe(true)
  })

  test('raio só de Opus para cima, e só com a aura bem forte', () => {
    const hasBolt = (p: Power, strength: number) => TICKS.some(tick => sparksOf(p, figure(strength), at(tick)).some(([, paint]) => paint === 'text'))
    expect(hasBolt(power(0, 4), 5)).toBe(false)
    expect(hasBolt(power(1, 4), 5)).toBe(false)
    expect(hasBolt(power(2, 4), 3)).toBe(false)
    expect(hasBolt(power(2, 4), 4)).toBe(true)
    expect(hasBolt(power(3, 4), 5)).toBe(true)
  })

  test('num tema claro as fagulhas escurecem, para não sumirem no fundo', () => {
    const paints = (isLight: boolean) => placed(sparksOf(power(1, 4), figure(4), at(3, isLight))).map(dot => brightness(dot.paint))
    expect(paints(true).every((light, i) => light < (paints(false)[i] ?? 0))).toBe(true)
  })
})

describe('riscos e jatos', () => {
  test('quem corre risca o ar atrás de si: de Sonnet para cima, com alguma aura', () => {
    expect(streaksOf(power(0, 4), figure(5), at(4), -1)).toEqual([])
    expect(streaksOf(power(1, 4), figure(1), at(4), -1)).toEqual([])
    expect(streaksOf(power(1, 4), figure(2), at(4), -1).length > 0).toBe(true)
  })

  test('os riscos ficam do lado de onde ele veio, na altura dos olhos e do corpo', () => {
    const top = FLOOR + 1 - STANDING.length
    for (let tick = 0; tick < 24; tick += 1) {
      const behind = placed(streaksOf(power(2, 4), figure(4), at(tick), -1))
      const ahead = placed(streaksOf(power(2, 4), figure(4), at(tick), 1))
      expect(behind.every(dot => dot.x < LEFT)).toBe(true)
      expect(ahead.every(dot => dot.x > RIGHT)).toBe(true)
      expect([...behind, ...ahead].every(dot => dot.y === top + 1 || dot.y === top + 3)).toBe(true)
    }
  })

  test('os jatos de quem voa piscam na sublinha do chão, sob o corpo', () => {
    const flying = drawing(CLAWD, { eyes: 'open', isArmsUp: false, step: 0, isSitting: true })
    const body = figure(3, { bitmap: flying, top: FLOOR - flying.length })
    const frames = Array.from({ length: 12 }, (_, tick) => placed(jetsOf(power(3, 2), body, at(tick))))
    for (const dots of frames)
      for (const dot of dots) {
        expect(dot.y).toBe(FLOOR)
        expect(dot.x >= LEFT + CLAWD.headFrom && dot.x < LEFT + CLAWD.headFrom + CLAWD.headWidth).toBe(true)
      }
    expect(frames.some(dots => dots.length > 0)).toBe(true)
    expect(new Set(frames.map(dots => dots.map(dot => dot.x).join(','))).size > 3).toBe(true) // piscam
  })
})

describe('os fogos da festa', () => {
  const CENTER = 60
  const AGES = Array.from({ length: 18 }, (_, age) => age)

  test('só de Opus para cima', () => {
    for (const tier of [0, 1]) for (const age of AGES) expect(fireworksOf(power(tier, 4), age, CENTER)).toEqual([])
    for (const tier of [2, 3]) expect(AGES.some(age => fireworksOf(power(tier, 0), age, CENTER).length > 0)).toBe(true)
  })

  test('estouram um depois do outro ao longo da festa, e acabam com ela', () => {
    const counts = AGES.map(age => fireworksOf(power(3, 4), age, CENTER).length)
    expect(counts[0]).toBe(0)
    expect(counts.filter(n => n > 0).length > 12).toBe(true)
    expect(fireworksOf(power(3, 4), 18, CENTER)).toEqual([])
    expect(fireworksOf(power(3, 4), -1, CENTER)).toEqual([])
  })

  test('os de Fable têm todas as cores; os de Opus, ouro e a cor do texto', () => {
    const paints = (tier: number) => new Set(AGES.flatMap(age => fireworksOf(power(tier, 4), age, CENTER).map(([, paint]) => paint)))
    expect(paints(3).size > 6).toBe(true)
    expect(paints(2).size).toBe(3)
    expect(paints(2).has('text')).toBe(true)
  })

  test('abrem em volta do mascote, sem ir para longe', () => {
    for (const age of AGES) for (const dot of placed(fireworksOf(power(3, 4), age, CENTER))) expect(Math.abs(dot.x - CENTER) <= 46).toBe(true)
  })
})

describe('a aura de um avatar: fogo, raio e estrela', () => {
  const ELEMENTS: readonly Element[] = ['fire', 'volt', 'star']
  const TICKS = Array.from({ length: 60 }, (_, tick) => tick)
  // Quanto de verde uma cor tem para o vermelho dela: perto de 0 é vermelho, perto de 1 é amarelo (ou branco).
  const yellowness = (hex: string) => (channels(hex)[1] ?? 0) / Math.max(1, channels(hex)[0] ?? 0)
  const isWarm = (hex: string) => {
    const [r, g, b] = channels(hex)
    return r > g && g > b
  }
  const isBlue = (hex: string) => {
    const [r, g, b] = channels(hex)
    return b > g && g > r
  }
  const paintsOver = (element: Element, strength = 5) => new Set(TICKS.flatMap(tick => [...auraAt(power(2, 4), strength, at(tick), { element }).values()]))
  // O que a aura solta num quadro, e o raio que cai: o que vem depois dos estalos e das fagulhas.
  const loose = (p: Power, strength: number, tick: number, element?: Element, isLight = false) => placed(sparksOf(p, figure(strength, { element }), at(tick, isLight)))
  const boltAt = (p: Power, strength: number, tick: number, element?: Element, isLight = false) => {
    const body = figure(strength, { element })
    const others = arcsOf(body, tick).flat().length + (strength >= 3 ? strength - 1 : 0)
    return placed(sparksOf(p, body, at(tick, isLight)).slice(others))
  }

  test('sem força não há aura, com elemento ou sem', () => {
    for (const element of ELEMENTS) expect(glowOf(power(3, 4), figure(0, { element }), at(5))).toBeNull()
  })

  test('o fogo e a estrela só trocam as tintas: o clarão tem a forma do da classe, com a mesma força', () => {
    for (const element of ['fire', 'star'] as const)
      for (const strength of [1, 3, 5])
        for (const tick of [0, 7, 13])
          expect([...auraAt(power(2, 4), strength, at(tick), { element }).keys()]).toEqual([...auraAt(power(2, 4), strength, at(tick)).keys()])
  })

  test('o campo do raio tem o contorno espetado: as pontas saltam de lugar a cada quadro, dentro do alcance da aura', () => {
    const outline = (tick: number) => [...auraAt(power(2, 4), 5, at(tick), { element: 'volt' }).keys()].join(' ')
    expect(outline(3)).toBe(outline(3))
    expect(new Set(TICKS.map(outline)).size).toBe(TICKS.length)
    expect(outline(5)).not.toBe([...auraAt(power(2, 4), 5, at(5)).keys()].join(' '))
    for (const strength of [1, 3, 5])
      for (const tick of [0, 7, 13])
        for (const [x, y] of coords(auraAt(power(2, 4), strength, at(tick), { element: 'volt' }))) {
          expect(x >= LEFT - strength && x <= RIGHT + strength).toBe(true)
          expect(y >= 0 && y < FLOOR).toBe(true)
        }
  })

  test('as tintas são as do elemento em qualquer classe: a cor da classe não entra', () => {
    for (const element of ELEMENTS) {
      const [haiku, ...others] = [0, 1, 2, 3].map(tier => [...auraAt(power(tier, 4), 4, at(5), { element })])
      for (const aura of others) expect(aura).toEqual(haiku)
      expect([...auraAt(power(2, 4), 4, at(5), { element }).values()]).not.toEqual([...auraAt(power(2, 4), 4, at(5)).values()])
    }
  })

  test('o fogo arde em laranja e fecha em vermelho: as pontas das línguas e as beiradas', () => {
    const paints = [...paintsOver('fire')]
    expect(paints.length).toBe(2)
    expect(paints.every(isWarm)).toBe(true)
    const [red, orange] = [...paints].sort((a, b) => yellowness(a) - yellowness(b))
    expect(yellowness(red ?? '') < 0.4).toBe(true)
    expect(yellowness(orange ?? '') > 0.45).toBe(true)
    const lit = auraAt(power(2, 4), 5, at(5), { element: 'fire' })
    const tips = coords(lit).filter(([x, y]) => x >= LEFT + 3 && x <= RIGHT - 3 && !lit.has(`${x},${y - 1}`)).map(([x, y]) => lit.get(`${x},${y}`))
    expect(tips.length > 0).toBe(true)
    expect(tips.every(paint => paint === red)).toBe(true)
    // as colunas de fora são todas beirada; rente ao corpo, o miolo
    expect(lit.get(`${LEFT - 3},${FLOOR - 2}`)).toBe(red)
    expect(lit.get(`${LEFT + 1},${FLOOR - 2}`)).toBe(orange)
  })

  test('o campo do raio é azul, mais escuro nas beiradas; amarelo, só o que ele solta', () => {
    const paints = [...paintsOver('volt')]
    expect(paints.length).toBe(2)
    expect(paints.every(isBlue)).toBe(true)
    const lit = auraAt(power(2, 4), 5, at(5), { element: 'volt' })
    expect(brightness(lit.get(`${LEFT - 3},${FLOOR - 2}`) ?? '#FFFFFF') < brightness(lit.get(`${LEFT + 1},${FLOOR - 2}`) ?? '#000000')).toBe(true)
    for (const tick of TICKS) for (const dot of loose(power(2, 4), 5, tick, 'volt')) expect(isWarm(dot.paint) && yellowness(dot.paint) > 0.8).toBe(true)
  })

  test('a estrela dá a volta no arco-íris: verdes, amarelos e azuis ao longo dela, e eles correm de um quadro para outro', () => {
    const now = auraAt(power(1, 4), 5, at(0), { element: 'star' })
    const later = auraAt(power(1, 4), 5, at(3), { element: 'star' })
    expect(new Set(now.values()).size > 6).toBe(true)
    expect([...now].some(([key, paint]) => later.has(key) && later.get(key) !== paint)).toBe(true)
    const hues = [...now.values()].map(channels)
    expect(hues.some(([r, g, b]) => g > r && g > b)).toBe(true) // o verde, que o furta-cor de Fable não tem
    expect(hues.some(([r, g, b]) => r > g && g > b)).toBe(true) // o amarelo e o laranja
    expect(hues.some(([r, g, b]) => b > r && b > g)).toBe(true) // o azul
  })

  test('a aura de um elemento é mais viva que o clarão de uma classe: esmaece menos para o fundo', () => {
    const dimmest = (lit: Map<string, string>) => Math.min(...[...lit.values()].map(brightness))
    for (const element of ELEMENTS) expect(dimmest(auraAt(power(0, 4), 4, at(5), { element })) > dimmest(auraAt(power(0, 4), 4, at(5)))).toBe(true)
  })

  test('a cor de cada célula é uma só no miolo: a célula nunca tem mais de duas tintas', () => {
    for (const element of ELEMENTS)
      for (const tick of [0, 3, 8, 21]) {
        const lit = auraAt(power(2, 4), 5, at(tick), { element })
        for (let x = (LEFT - 6) & ~1; x <= RIGHT + 6; x += 2)
          for (let y = 0; y <= FLOOR; y += 2) {
            const quad = [lit.get(`${x},${y}`), lit.get(`${x + 1},${y}`), lit.get(`${x},${y + 1}`), lit.get(`${x + 1},${y + 1}`)].filter(paint => paint !== undefined)
            expect(new Set(quad).size <= 2).toBe(true)
          }
      }
  })

  test('as fagulhas e os jatos do fogo são brasas, amarelas e laranja; os riscos, da cor do miolo', () => {
    const flying = drawing(CLAWD, { eyes: 'open', isArmsUp: false, step: 0, isSitting: true })
    const embers = TICKS.flatMap(tick => sparksOf(power(1, 4), figure(5, { element: 'fire' }), at(tick)).map(([, paint]) => paint))
    const jets = TICKS.flatMap(tick => jetsOf(power(3, 4), figure(5, { element: 'fire', bitmap: flying, top: FLOOR - flying.length }), at(tick)).map(([, paint]) => paint))
    const streaks = TICKS.flatMap(tick => streaksOf(power(1, 4), figure(5, { element: 'fire' }), at(tick), -1).map(([, paint]) => paint))
    for (const paints of [embers, jets, streaks]) {
      expect(paints.length > 0).toBe(true)
      expect(paints.every(isWarm)).toBe(true)
    }
    expect(new Set(embers).size).toBe(2)
    // os riscos de quem corre no campo do raio são azuis, como ele
    const bluish = TICKS.flatMap(tick => streaksOf(power(1, 4), figure(5, { element: 'volt' }), at(tick), -1).map(([, paint]) => paint))
    expect(bluish.length > 0 && bluish.every(isBlue)).toBe(true)
  })

  test('as estrelinhas da estrela são de ouro, sempre as mesmas', () => {
    const stars = new Set(TICKS.flatMap(tick => sparksOf(power(1, 4), figure(5, { element: 'star' }), at(tick)).map(([, paint]) => paint)))
    expect(stars.size).toBe(1)
    expect([...stars].every(hex => isWarm(hex) && yellowness(hex) > 0.8)).toBe(true)
  })

  test('o avatar de raio solta raios em qualquer classe, desde que as fagulhas sobem, e mais vezes que os da classe', () => {
    const bolts = (p: Power, strength: number, element?: Element) => TICKS.filter(tick => boltAt(p, strength, tick, element).length > 0).length
    expect(bolts(power(0, 4), 2, 'volt')).toBe(0)
    expect(bolts(power(0, 4), 3, 'volt') > 0).toBe(true)
    expect(bolts(power(2, 4), 5, 'volt') > bolts(power(2, 4), 5)).toBe(true)
    // o raio dele é amarelo, não da cor do texto, e desce do alto até o chão como o da classe
    const strike = boltAt(power(0, 4), 3, 0, 'volt')
    expect(strike.map(dot => dot.y).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(strike.every(dot => dot.paint !== 'text' && isWarm(dot.paint))).toBe(true)
  })

  test('fogo e estrela seguem a regra da classe para os raios: só de Opus para cima, com a aura bem forte, na cor do texto', () => {
    const hasBolt = (p: Power, strength: number, element: Element) => TICKS.some(tick => sparksOf(p, figure(strength, { element }), at(tick)).some(([, paint]) => paint === 'text'))
    for (const element of ['fire', 'star'] as const) {
      expect(hasBolt(power(1, 4), 5, element)).toBe(false)
      expect(hasBolt(power(2, 4), 3, element)).toBe(false)
      expect(hasBolt(power(2, 4), 4, element)).toBe(true)
    }
  })

  test('num tema claro as tintas do elemento esmaecem para o branco, e o raio amarelo escurece', () => {
    for (const element of ELEMENTS) {
      const dark = auraAt(power(2, 4), 4, at(5), { element })
      const light = auraAt(power(2, 4), 4, at(5, true), { element })
      expect([...light.keys()]).toEqual([...dark.keys()])
      for (const [key, paint] of dark) expect(brightness(light.get(key) ?? '#000000') > brightness(paint)).toBe(true)
    }
    const shade = (isLight: boolean) => boltAt(power(0, 4), 3, 0, 'volt', isLight).map(dot => brightness(dot.paint))
    expect(shade(true).length).toBe(FLOOR + 1)
    expect(shade(true).every((light, i) => light < (shade(false)[i] ?? 0))).toBe(true)
  })
})

describe('os estalos do avatar de raio', () => {
  const BEATS = Array.from({ length: 40 }, (_, beat) => beat * 2)
  const arcsAt = (strength: number, tick: number, element: Element = 'volt') => arcsOf(figure(strength, { element }), tick)

  test('só o avatar de raio estala, e só com alguma aura', () => {
    for (const tick of BEATS) {
      expect(arcsAt(5, tick, 'fire')).toEqual([])
      expect(arcsAt(5, tick, 'star')).toEqual([])
      expect(arcsOf(figure(5), tick)).toEqual([])
      expect(arcsAt(0, tick)).toEqual([])
    }
    expect(BEATS.some(tick => arcsAt(1, tick).length > 0)).toBe(true)
  })

  test('quanto mais forte a aura, mais estalos', () => {
    const total = (strength: number) => BEATS.reduce((n, tick) => n + arcsAt(strength, tick).length, 0)
    expect(total(3) > total(1)).toBe(true)
    expect(total(5) > total(3)).toBe(true)
  })

  test('acendem e apagam: cada um dura dois quadros, e o seguinte nasce noutro lugar', () => {
    for (const tick of BEATS) expect(arcsAt(4, tick + 1)).toEqual(arcsAt(4, tick))
    expect(new Set(BEATS.map(tick => JSON.stringify(arcsAt(4, tick)))).size > BEATS.length / 2).toBe(true)
    expect(BEATS.some(tick => arcsAt(1, tick).length === 0)).toBe(true) // e há quadros em que ele descansa
  })

  test('cada estalo é um raio curto em ziguezague, perto do corpo, de um lado e do outro, acima da linha dos pés', () => {
    const arcs = BEATS.flatMap(tick => arcsAt(5, tick))
    for (const arc of arcs) {
      expect(arc.length >= 2 && arc.length <= 5).toBe(true)
      for (const [i, [x, y]] of arc.entries()) {
        const before = arc[i - 1]
        expect(y >= 0 && y < FLOOR).toBe(true)
        expect(x >= -7 && x <= CLAWD.width + 6).toBe(true)
        if (before) {
          expect(y).toBe(before[1] + 1)
          expect(Math.abs(x - before[0]) <= 1).toBe(true)
        }
      }
    }
    expect(arcs.some(arc => arc.some(([x], i) => i > 0 && x !== arc[i - 1]?.[0]))).toBe(true) // ziguezague, não uma linha reta
    expect(arcs.some(arc => (arc[0]?.[0] ?? 0) < 0)).toBe(true)
    expect(arcs.some(arc => (arc[0]?.[0] ?? 0) >= CLAWD.width)).toBe(true)
  })

  test('no palco de texto, os estalos são pontos amarelos em volta do bicho, mesmo com a aura fraca', () => {
    const dots = BEATS.flatMap(tick => placed(sparksOf(power(0, 4), figure(1, { element: 'volt' }), at(tick))))
    expect(dots.length > 0).toBe(true)
    for (const dot of dots) {
      const [r, g, b] = channels(dot.paint)
      expect(r > g && g > b).toBe(true)
      expect(dot.x <= LEFT || dot.x >= RIGHT).toBe(true)
    }
    expect(BEATS.flatMap(tick => sparksOf(power(0, 4), figure(1), at(tick)))).toEqual([])
  })
})
