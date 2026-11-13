import { describe, expect, test } from 'claude-code/testing'

import { AVATAR_ART, artOf } from './avatars'
import { blend, mix, rgbOf } from './color'
import { backdropRgb, hdScene } from './hd'
import { EYE, isInk } from './pixels'
import { FORM_FROM, poseOf } from './pose'
import { auraOf, power } from './power'
import { sceneRows } from './scene'
import { AVATARS, DEFAULT_SETTINGS, sanitize } from './settings'
import { EMPTY_SIM, MAIN, geometry } from './sim'
import type { Sim, Worker } from './sim'
import { CLAWD, FINE_X, FINE_Y, MINI, detailDrawing, drawing } from './sprites'
import type { Art, Eyes, Stance } from './sprites'

const STAND: Stance = { eyes: 'open', isArmsUp: false, step: 0, isSitting: false }
const LOOKS: readonly Eyes[] = ['open', 'closed', 'left', 'right']
const COLORED = AVATARS.filter(a => a.id !== 'clawd').map(a => [a.id, AVATAR_ART[a.id]] as const)
// Todos os desenhos coloridos: o de base de cada avatar e a forma com poder dele.
const DRAWN = COLORED.flatMap(([id, art]) => [[id, art] as const, ...(art.form ? [[`${id}, com poder`, art.form] as const] : [])])
const HEX = /^#[0-9A-F]{6}$/i

// Todas as posturas de um desenho: os olhos, os braços, o passo, sentado ou de pé.
const stances = (): Stance[] =>
  LOOKS.flatMap(eyes => [false, true].flatMap(isArmsUp => ([0, 1] as const).flatMap(step => [false, true].map(isSitting => ({ eyes, isArmsUp, step, isSitting })))))

// Toda marca com tinta de um desenho tem cor: é a do bicho, um olho aceso, ou está na paleta dele.
const expectPainted = (art: Art, rows: readonly string[]) => {
  for (const row of rows) for (const mark of row) if (isInk(mark) && mark !== '#' && mark !== EYE) expect(art.paints?.[mark]).toMatch(HEX)
}

// Uma tinta da forma com poder que o desenho de base não tem, e que aparece nos dois desenhos dela (o comum e o fino).
const newInkOf = (art: Art): string | undefined => {
  const form = art.form
  if (!form) return undefined
  const old = new Set(Object.values(art.paints ?? {}))
  const common = drawing(form, STAND).join('')
  const fine = (detailDrawing(form, STAND) ?? []).join('')
  return Object.entries(form.paints ?? {}).find(([mark, hex]) => !old.has(hex) && common.includes(mark) && fine.includes(mark))?.[1]
}

describe('os avatares do mascote', () => {
  test('há um desenho para cada avatar dos ajustes, e o padrão é o Clawd', () => {
    for (const { id } of AVATARS) expect(AVATAR_ART[id]).toBeDefined()
    expect(artOf(DEFAULT_SETTINGS.avatar)).toBe(CLAWD)
    expect(artOf(undefined)).toBe(CLAWD)
  })

  test('todos têm a largura e a cabeça do Clawd: a simulação não muda com o avatar', () => {
    for (const [, art] of DRAWN) {
      expect(art.width).toBe(CLAWD.width)
      expect(art.headFrom).toBe(CLAWD.headFrom)
      expect(art.headWidth).toBe(CLAWD.headWidth)
    }
  })

  test('o desenho comum tem a largura certa e só marcas da paleta, em qualquer postura', () => {
    for (const [, art] of DRAWN)
      for (const stance of stances())
        for (const hasLitEyes of [false, true]) {
          const rows = drawing(art, { ...stance, hasLitEyes })
          expect(rows.length).toBe(stance.isSitting ? 4 : 5)
          for (const row of rows) expect(row.length).toBe(art.width)
          expectPainted(art, rows)
        }
  })

  test('o desenho fino tem FINE_X por FINE_Y pontos por subpixel e só marcas da paleta, em qualquer postura', () => {
    for (const [, art] of DRAWN)
      for (const stance of stances()) {
        const rows = detailDrawing(art, stance)
        expect(rows?.length).toBe((stance.isSitting ? 4 : 5) * FINE_Y)
        for (const row of rows ?? []) expect(row.length).toBe(art.width * FINE_X)
        expectPainted(art, rows ?? [])
        expect((rows ?? []).join('').includes('_')).toBe(false)
      }
  })

  test('todo remendo do desenho fino cabe nele: começa dentro, não passa do fim e tem a largura dele', () => {
    for (const [, art] of DRAWN) {
      const detail = art.detail
      if (!detail) throw new Error('avatar colorido sem desenho fino')
      for (const { at, rows } of [detail.eyes.closed, detail.eyes.left, detail.eyes.right, detail.raised, detail.stride]) {
        expect(at >= 0 && at + rows.length <= detail.frame.length).toBe(true)
        for (const row of rows) expect(row.length).toBe(art.width * FINE_X)
      }
    }
  })

  test('o Clawd não tem desenho fino', () => {
    expect(detailDrawing(CLAWD, STAND)).toBeNull()
  })

  test('de olhos acesos, as pupilas viram pontos de luz; fechados, não há o que acender', () => {
    for (const [, art] of DRAWN) {
      const lit = drawing(art, { ...STAND, hasLitEyes: true }).join('')
      expect(lit.includes(EYE)).toBe(true)
      expect(lit.includes(art.pupil ?? '?')).toBe(false)
      expect(drawing(art, { ...STAND, eyes: 'closed', hasLitEyes: true }).join('').includes(EYE)).toBe(false)
    }
  })

  test('cada postura muda o desenho fino: os olhos, os braços e o passo', () => {
    for (const [, art] of DRAWN) {
      const standing = detailDrawing(art, STAND)
      for (const eyes of ['closed', 'left', 'right'] as const) expect(detailDrawing(art, { ...STAND, eyes })).not.toEqual(standing)
      expect(detailDrawing(art, { ...STAND, isArmsUp: true })).not.toEqual(standing)
      expect(detailDrawing(art, { ...STAND, step: 1 })).not.toEqual(standing)
      expect(detailDrawing(art, { ...STAND, isSitting: true })).toEqual(standing?.slice(0, -FINE_Y))
    }
  })
})

describe('a forma com poder', () => {
  const idle: Worker = { id: MAIN, x: 30, act: 'idle', t: 0, load: '', queue: '', busy: 0, tool: null, thinking: 0, isAsleep: false, shout: 0 }
  const working: Sim = { ...EMPTY_SIM, isOn: true, workers: [idle] }
  const artAt = (art: Art, tier: number, level: number, over: Partial<Worker> = {}) => poseOf({ ...idle, ...over }, working, power(tier, level), art).art

  test('todo avatar colorido tem um elemento de aura só dele e uma forma com poder, do mesmo elemento; o Clawd não tem nem um nem outro', () => {
    for (const [, art] of COLORED) {
      expect(['fire', 'volt', 'star'].includes(art.element ?? '')).toBe(true)
      expect(art.form).toBeDefined()
      expect(art.form?.element).toBe(art.element)
      expect(art.form?.form).toBeUndefined() // a forma não se transforma de novo
    }
    expect(new Set(COLORED.map(([, art]) => art.element)).size).toBe(COLORED.length)
    expect(CLAWD.element).toBeUndefined()
    expect(CLAWD.form).toBeUndefined()
  })

  test('a forma é outro desenho, no comum e no fino, com tintas que o de base não tem', () => {
    for (const [, art] of COLORED) {
      const form = art.form
      if (!form) throw new Error('avatar colorido sem forma com poder')
      expect(drawing(form, STAND)).not.toEqual(drawing(art, STAND))
      expect(detailDrawing(form, STAND)).not.toEqual(detailDrawing(art, STAND))
      expect(newInkOf(art)).toMatch(HEX)
    }
  })

  test('o mascote se transforma quando a aura chega à força em que as fagulhas sobem, e volta quando ela cai', () => {
    for (const [, art] of COLORED) {
      for (const tier of [0, 1, 2, 3])
        for (const level of [0, 1, 2, 3, 4]) expect(artAt(art, tier, level)).toBe(auraOf(power(tier, level)) >= FORM_FROM ? art.form : art)
      // em Sonnet e Opus, de xhigh para cima; em Fable, um nível antes; em Haiku, só em max
      expect(artAt(art, 2, 2)).toBe(art)
      expect(artAt(art, 2, 3)).toBe(art.form)
      expect(artAt(art, 3, 1)).toBe(art)
      expect(artAt(art, 3, 2)).toBe(art.form)
      expect(artAt(art, 0, 3)).toBe(art)
      expect(artAt(art, 0, 4)).toBe(art.form)
    }
  })

  test('dormindo, depois de falhar ou sem poder dito, é o desenho de base', () => {
    for (const [, art] of COLORED) {
      expect(artAt(art, 3, 4, { act: 'sleep' })).toBe(art)
      expect(artAt(art, 3, 4, { act: 'fail' })).toBe(art)
      expect(poseOf(idle, working, undefined, art).art).toBe(art)
    }
  })

  test('o Clawd e os ajudantes não se transformam', () => {
    expect(artAt(CLAWD, 3, 4)).toBe(CLAWD)
    for (const [, art] of COLORED) expect(poseOf({ ...idle, id: 'agente' }, working, power(3, 4), art).art).toBe(MINI)
  })
})

describe('o avatar no palco', () => {
  const geo = geometry(100)
  if (!geo) throw new Error('o palco de teste não coube')
  const sim: Sim = { ...EMPTY_SIM, isOn: true, workers: [{ id: MAIN, x: 30, act: 'idle', t: 0, load: '', queue: '', busy: 0, tool: null, thinking: 0, isAsleep: false, shout: 0 }] }
  const colorsOf = (shapes: readonly { rgb: number }[]) => new Set(shapes.map(s => s.rgb))
  const RED = 0xe52521 // o boné do encanador

  test('em pixels, o avatar escolhido é pintado com a paleta dele; sem escolha, é o Clawd', () => {
    const scene = (avatar?: 'mario') => hdScene({ prev: sim, cur: sim, alpha: 0, geo, hud: [], trace: 'pixels', avatar })
    expect(colorsOf(scene('mario').shapes).has(RED)).toBe(true)
    expect(colorsOf(scene().shapes).has(RED)).toBe(false)
  })

  test('em blocos no tamanho normal vai o desenho comum; no grande, o fino', () => {
    // a altura de uma marca vermelha: uma sublinha (8 pixels) no desenho comum; um ponto (4, no dobro) no fino
    const heights = (zoom: 1 | 2) => new Set(hdScene({ prev: sim, cur: sim, alpha: 0, geo, hud: [], trace: 'blocks', zoom, avatar: 'mario' }).shapes.filter(s => s.rgb === RED).map(s => s.h))
    expect([...heights(1)]).toEqual([8])
    expect([...heights(2)]).toEqual([4])
  })

  test('quem falhou esmaece nas cores da paleta dele, nos dois palcos', () => {
    const failed: Sim = { ...sim, workers: sim.workers.map(w => ({ ...w, act: 'fail' as const })) }
    const colors = colorsOf(hdScene({ prev: failed, cur: failed, alpha: 0, geo, hud: [], trace: 'pixels', avatar: 'mario' }).shapes)
    expect(colors.has(RED)).toBe(false)
    expect(colors.has(blend(RED, backdropRgb(false), 0.5))).toBe(true)
    const parts = sceneRows({ sim: failed, geo, hud: [], avatar: 'mario' }).flat()
    expect(parts.some(part => part.color === '#E52521' && part.dim === true)).toBe(true)
    expect(parts.some(part => part.color === '#E52521' && !part.dim)).toBe(false)
  })

  test('com poder de Opus, as pupilas acendem no desenho fino e o avatar segue com as cores dele', () => {
    const opus = { tier: 2, level: 4 } as const
    const powers = new Map([[MAIN, opus]])
    // um quadro em que ele não está piscando
    const tick = Array.from({ length: 40 }, (_, i) => i).find(i => sim.workers[0] && poseOf(sim.workers[0], { ...sim, tick: i }, opus).eyes === 'open') ?? 0
    const awake = { ...sim, tick }
    const colors = colorsOf(hdScene({ prev: awake, cur: awake, alpha: 0, geo, hud: [], trace: 'pixels', avatar: 'mario', powers }).shapes)
    expect(colors.has(rgbOf('#FFF1B8'))).toBe(true) // os olhos acesos de Opus
    expect(colors.has(rgbOf('#26262B'))).toBe(false) // nenhuma pupila escura sobrou
    expect(colors.has(RED)).toBe(true)
    expect(sceneRows({ sim: awake, geo, hud: [], avatar: 'mario', powers }).flat().some(part => part.color === '#E52521' || part.bg === '#E52521')).toBe(true)
  })

  test('com a aura forte aparece a forma com poder, nos dois palcos; com ela fraca, o desenho de base', () => {
    const strong = new Map([[MAIN, power(2, 4)]])
    const weak = new Map([[MAIN, power(2, 2)]])
    for (const [id, art] of COLORED) {
      const ink = newInkOf(art) ?? ''
      const pixels = (powers: Map<string, ReturnType<typeof power>>) => colorsOf(hdScene({ prev: sim, cur: sim, alpha: 0, geo, hud: [], trace: 'pixels', avatar: id, powers }).shapes)
      expect(pixels(strong).has(rgbOf(ink))).toBe(true)
      expect(pixels(weak).has(rgbOf(ink))).toBe(false)
      const cells = (powers: Map<string, ReturnType<typeof power>>) => sceneRows({ sim, geo, hud: [], avatar: id, powers }).flat()
      expect(cells(strong).some(part => part.color === ink || part.bg === ink)).toBe(true)
      expect(cells(weak).some(part => part.color === ink || part.bg === ink)).toBe(false)
    }
  })

  test('a aura de um avatar colorido tem as tintas do elemento dele; a do Clawd, a cor da classe', () => {
    const PURPLE = 0xa78bfa // a cor de Opus
    const glow = mix('#A78BFA', '#0B0B10', 0.42) // e o miolo do clarão dela no palco de texto
    const powers = new Map([[MAIN, power(2, 4)]])
    const pixels = (avatar: (typeof AVATARS)[number]['id']) => colorsOf(hdScene({ prev: sim, cur: sim, alpha: 0, geo, hud: [], trace: 'pixels', avatar, powers }).shapes)
    const cells = (avatar: (typeof AVATARS)[number]['id']) => sceneRows({ sim, geo, hud: [], avatar, powers }).flat()
    expect(pixels('clawd').has(PURPLE)).toBe(true)
    expect(cells('clawd').some(part => part.color === glow || part.bg === glow)).toBe(true)
    for (const [id] of COLORED) {
      expect(pixels(id).has(PURPLE)).toBe(false)
      expect(cells(id).some(part => part.color === glow || part.bg === glow)).toBe(false)
      expect(pixels(id).size > pixels('clawd').size).toBe(true) // e não ficou sem aura: há mais tintas que no Clawd
    }
  })

  test('no palco de texto, as cores da paleta chegam às células', () => {
    const rows = sceneRows({ sim, geo, hud: [], avatar: 'mario' })
    expect(rows.flat().some(part => part.color === '#E52521' || part.bg === '#E52521')).toBe(true)
    expect(sceneRows({ sim, geo, hud: [] }).flat().some(part => part.color === '#E52521')).toBe(false)
  })
})

describe('o avatar nos ajustes', () => {
  test('um avatar conhecido é guardado; um desconhecido volta ao Clawd', () => {
    expect(sanitize({ avatar: 'kratos' }).avatar).toBe('kratos')
    expect(sanitize({ avatar: 'sonic' }).avatar).toBe('clawd')
    expect(sanitize(undefined).avatar).toBe('clawd')
  })
})
