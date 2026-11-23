import { describe, expect, test } from 'claude-code/testing'

import { MOTE_LIFE, glowOf, jetsOf, sparksOf, streaksOf } from './aura'
import type { Dot, Element, Figure, Mood } from './aura'
import type { Glow } from './pixels'
import { power } from './power'
import type { Power } from './power'
import { CLAWD, drawing } from './sprites'

// A aura de gelo no palco de texto: o contorno de cristais, as duas tintas dela e os flocos de neve.
// (O que ela tem em comum com as dos outros elementos está em aura.test.ts; o palco em pixels, em hd-aura.test.ts.)

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

describe('a aura de gelo', () => {
  const TICKS = Array.from({ length: 60 }, (_, tick) => tick)
  const DEEP = 20 // um chão bem abaixo do topo da cena: as pontas dos cristais não batem no teto
  const tall = (strength: number, element?: Element) => figure(strength, { element, floor: DEEP, top: DEEP + 1 - STANDING.length })
  const HEAD = Array.from({ length: CLAWD.headWidth }, (_, i) => LEFT + CLAWD.headFrom + i)
  // A ponta do clarão sobre cada coluna da cabeça: a sublinha mais alta que ele pinta ali.
  const tipsAt = (tick: number, element?: Element) => {
    const glow = glowOf(power(2, 4), tall(5, element), at(tick))
    return HEAD.map(x => Array.from({ length: DEEP + 1 }, (_, y) => y).find(y => glow?.(x, y) !== undefined) ?? DEEP)
  }
  // As colunas que são ponta num quadro: nenhuma das duas vizinhas sobe mais que ela.
  const peaksAt = (tick: number, element?: Element) => {
    const tips = tipsAt(tick, element)
    return HEAD.filter((_, i) => i > 0 && i < HEAD.length - 1 && (tips[i] ?? 0) <= (tips[i - 1] ?? 0) && (tips[i] ?? 0) <= (tips[i + 1] ?? 0))
  }
  const steadyPeaks = (element?: Element) => TICKS.map(tick => peaksAt(tick, element)).reduce((kept, peaks) => kept.filter(x => peaks.includes(x)))
  const snow = (tick: number, isLight = false) => sparksOf(power(1, 4), figure(5, { element: 'frost' }), at(tick, isLight))
  // O que um bicho de pé num palco fundo solta: ali a vida inteira de cada fagulha cabe em cena.
  const loose = (element: Element) => (tick: number) => sparksOf(power(1, 4), tall(5, element), at(tick))
  // Quanto cada fagulha anda na vertical de um quadro para o seguinte.
  const drops = (dots: (tick: number) => Dot[]) =>
    TICKS.flatMap(tick => dots(tick).flatMap(([key], k) => {
      const next = dots(tick + 1)[k]?.[0]
      if (key === undefined || next === undefined) throw new Error('uma fagulha saiu de cena')
      return [Math.floor(next / DOT_STRIDE) - Math.floor(key / DOT_STRIDE)]
    }))
  const REBORN = MOTE_LIFE - 1 // de uma vida para a seguinte, a fagulha volta ao começo do caminho
  // O contraste de uma tinta com o branco, como se mede a legibilidade de um texto (de 1, igual, a 21).
  const onWhite = (hex: string) => {
    const [r, g, b] = channels(hex).map(c => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4))
    return 1.05 / (0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0) + 0.05)
  }

  test('o contorno é de cristais: as pontas têm lugar certo, de três em três subpixels, e não ondulam como as línguas do fogo', () => {
    const steady = steadyPeaks('frost')
    expect(steady.length >= 3).toBe(true)
    expect(steady.every((x, i) => i === 0 || x - (steady[i - 1] ?? x) === 3)).toBe(true)
    expect(steadyPeaks('fire')).toEqual([])
    expect(steadyPeaks()).toEqual([])
  })

  test('os cristais crescem e encolhem devagar: de um quadro para o seguinte nenhuma ponta anda mais de uma sublinha', () => {
    const leap = (element: Element) => Math.max(...TICKS.flatMap(tick => tipsAt(tick, element).map((y, i) => Math.abs(y - (tipsAt(tick + 1, element)[i] ?? y)))))
    expect(leap('frost')).toBe(1)
    expect(leap('volt') > 1).toBe(true) // o campo do raio salta
    // e não ficam parados: o contorno muda ao longo do tempo, e o mesmo quadro desenha sempre igual
    expect(new Set(TICKS.map(tick => tipsAt(tick, 'frost').join(' '))).size > 5).toBe(true)
    expect(tipsAt(7, 'frost')).toEqual(tipsAt(7, 'frost'))
  })

  test('cada cristal tem a sua altura: num mesmo quadro há pontas altas e baixas', () => {
    const heights = TICKS.map(tick => new Set(steadyPeaks('frost').map(x => tipsAt(tick, 'frost')[HEAD.indexOf(x)])).size)
    expect(heights.some(n => n > 1)).toBe(true)
  })

  test('é vidro: o miolo é um azul de noite, apagado, e quem brilha são as pontas e as beiradas, num ciano claro', () => {
    const paints = [...new Set(TICKS.flatMap(tick => [...auraAt(power(2, 4), 5, at(tick), { element: 'frost' }).values()]))]
    expect(paints.length).toBe(2)
    const [night, ice] = [...paints].sort((a, b) => brightness(a) - brightness(b))
    if (night === undefined || ice === undefined) throw new Error('faltou uma tinta')
    const [nr, ng, nb] = channels(night)
    const [ir, ig, ib] = channels(ice)
    expect(nb > ng && ng > nr && nb > 1.8 * ng).toBe(true) // azul fechado: bem mais azul que verde
    expect(ib > ig && ig > ir).toBe(true) // ciano: azul e verde, com menos vermelho
    expect(brightness(ice) > 1.8 * brightness(night)).toBe(true)
    // as colunas de fora e as pontas dos cristais são da tinta clara; rente ao corpo, o miolo
    const lit = auraAt(power(2, 4), 5, at(5), { element: 'frost' })
    expect(lit.get(`${LEFT - 3},${FLOOR - 2}`)).toBe(ice)
    expect(lit.get(`${LEFT + 1},${FLOOR - 2}`)).toBe(night)
    const tips = coords(lit).filter(([x, y]) => x >= LEFT + 3 && x <= RIGHT - 3 && !lit.has(`${x},${y - 1}`)).map(([x, y]) => lit.get(`${x},${y}`))
    expect(tips.length > 0 && tips.every(paint => paint === ice)).toBe(true)
  })

  test('solta flocos de neve só com a aura forte, tantos mais quanto mais forte, brancos e sempre da mesma tinta', () => {
    for (const strength of [1, 2]) for (const tick of TICKS) expect(sparksOf(power(1, 4), figure(strength, { element: 'frost' }), at(tick))).toEqual([])
    for (const strength of [3, 4, 5]) for (const tick of TICKS) expect(sparksOf(power(1, 4), figure(strength, { element: 'frost' }), at(tick)).length).toBe(strength - 1)
    const paints = new Set(TICKS.flatMap(tick => snow(tick).map(([, paint]) => paint)))
    expect(paints.size).toBe(1)
    expect([...paints].every(hex => channels(hex).every(c => c > 215))).toBe(true)
  })

  test('os flocos caem pelos lados do bicho, uma sublinha por quadro, até a que fica logo acima da linha dos pés; as fagulhas dos outros sobem', () => {
    // cada floco desce uma sublinha por quadro e, no fim da vida, renasce no alto
    const falling = drops(loose('frost'))
    expect(falling.every(dy => dy === 1 || dy === -REBORN)).toBe(true)
    expect(falling.includes(1) && falling.includes(-REBORN)).toBe(true)
    // (o raio fica de fora da comparação: os estalos e os raios dele entram na mesma lista das fagulhas)
    for (const element of ['fire', 'star'] as const) {
      const rising = drops(loose(element))
      expect(rising.every(dy => dy === -1 || dy === REBORN)).toBe(true)
      expect(rising.includes(-1) && rising.includes(REBORN)).toBe(true)
    }
    // o caminho é o mesmo das fagulhas, ao contrário: da oitava sublinha acima do chão até a primeira
    const heights = new Set(TICKS.flatMap(tick => placed(loose('frost')(tick)).map(dot => DEEP - dot.y)))
    expect([...heights].sort((a, b) => a - b)).toEqual(Array.from({ length: MOTE_LIFE }, (_, i) => i + 1))
    for (const tick of TICKS)
      for (const { x, y } of placed(snow(tick))) {
        expect(y < FLOOR).toBe(true)
        expect(x < LEFT + 2 || x > RIGHT - 2).toBe(true)
      }
  })

  test('num tema claro os flocos escurecem, para não sumirem no fundo', () => {
    const paints = (isLight: boolean) => TICKS.flatMap(tick => snow(tick, isLight).map(([, paint]) => brightness(paint)))
    expect(paints(true).every((light, i) => light < (paints(false)[i] ?? 0))).toBe(true)
  })

  test('num tema claro o miolo clareia como o de qualquer aura, e as pontas, as beiradas e os flocos trocam o ciano claro por um azul fechado: no branco, o claro sumiria', () => {
    const dark = auraAt(power(2, 4), 5, at(5), { element: 'frost' })
    const light = auraAt(power(2, 4), 5, at(5, true), { element: 'frost' })
    expect([...light.keys()]).toEqual([...dark.keys()])
    const [night, ice] = [...new Set(dark.values())].sort((a, b) => brightness(a) - brightness(b))
    const [day, rim] = [...new Set(light.values())].sort((a, b) => onWhite(a) - onWhite(b))
    if (night === undefined || ice === undefined || day === undefined || rim === undefined) throw new Error('faltou uma tinta')
    expect(new Set(light.values()).size).toBe(2)
    expect(brightness(day) > brightness(night)).toBe(true) // o miolo
    // a tinta clara do tema escuro mal se veria no branco; a do tema claro se vê tanto quanto o miolo
    expect(onWhite(ice) < 1.8).toBe(true)
    expect(onWhite(rim) > 2.2 && onWhite(day) > 2).toBe(true)
    expect(light.get(`${LEFT - 3},${FLOOR - 2}`)).toBe(rim)
    for (const paint of new Set(TICKS.flatMap(tick => snow(tick, true).map(([, hex]) => hex)))) expect(onWhite(paint) > 2.2).toBe(true)
  })

  test('os riscos de quem corre são do azul do miolo; os jatos de quem voa, da tinta dos flocos', () => {
    const flying = drawing(CLAWD, { eyes: 'open', isArmsUp: false, step: 0, isSitting: true })
    const streaks = TICKS.flatMap(tick => streaksOf(power(1, 4), figure(5, { element: 'frost' }), at(tick), -1).map(([, paint]) => paint))
    const jets = TICKS.flatMap(tick => jetsOf(power(3, 4), figure(5, { element: 'frost', bitmap: flying, top: FLOOR - flying.length }), at(tick)).map(([, paint]) => paint))
    expect(streaks.length > 0).toBe(true)
    expect(streaks.every(hex => channels(hex)[2] > channels(hex)[1] && channels(hex)[1] > channels(hex)[0])).toBe(true)
    expect(jets.length > 0).toBe(true)
    expect(new Set(jets)).toEqual(new Set(snow(0).map(([, paint]) => paint)))
  })
})
