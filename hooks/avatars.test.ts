import { describe, expect, test } from 'claude-code/testing'

import { AVATAR_ART, artOf } from './avatars'
import { blend, rgbOf } from './color'
import { backdropRgb, hdScene } from './hd'
import { EYE, isInk } from './pixels'
import { poseOf } from './pose'
import { sceneRows } from './scene'
import { AVATARS, DEFAULT_SETTINGS, sanitize } from './settings'
import { EMPTY_SIM, MAIN, geometry } from './sim'
import type { Sim } from './sim'
import { CLAWD, FINE_X, FINE_Y, detailDrawing, drawing } from './sprites'
import type { Art, Eyes, Stance } from './sprites'

const STAND: Stance = { eyes: 'open', isArmsUp: false, step: 0, isSitting: false }
const LOOKS: readonly Eyes[] = ['open', 'closed', 'left', 'right']
const COLORED = AVATARS.filter(a => a.id !== 'clawd').map(a => [a.id, AVATAR_ART[a.id]] as const)
const HEX = /^#[0-9A-F]{6}$/i

// Todas as posturas de um desenho: os olhos, os braços, o passo, sentado ou de pé.
const stances = (): Stance[] =>
  LOOKS.flatMap(eyes => [false, true].flatMap(isArmsUp => ([0, 1] as const).flatMap(step => [false, true].map(isSitting => ({ eyes, isArmsUp, step, isSitting })))))

// Toda marca com tinta de um desenho tem cor: é a do bicho, um olho aceso, ou está na paleta dele.
const expectPainted = (art: Art, rows: readonly string[]) => {
  for (const row of rows) for (const mark of row) if (isInk(mark) && mark !== '#' && mark !== EYE) expect(art.paints?.[mark]).toMatch(HEX)
}

describe('os avatares do mascote', () => {
  test('há um desenho para cada avatar dos ajustes, e o padrão é o Clawd', () => {
    for (const { id } of AVATARS) expect(AVATAR_ART[id]).toBeDefined()
    expect(artOf(DEFAULT_SETTINGS.avatar)).toBe(CLAWD)
    expect(artOf(undefined)).toBe(CLAWD)
  })

  test('todos têm a largura e a cabeça do Clawd: a simulação não muda com o avatar', () => {
    for (const [, art] of COLORED) {
      expect(art.width).toBe(CLAWD.width)
      expect(art.headFrom).toBe(CLAWD.headFrom)
      expect(art.headWidth).toBe(CLAWD.headWidth)
    }
  })

  test('o desenho comum tem a largura certa e só marcas da paleta, em qualquer postura', () => {
    for (const [, art] of COLORED)
      for (const stance of stances())
        for (const hasLitEyes of [false, true]) {
          const rows = drawing(art, { ...stance, hasLitEyes })
          expect(rows.length).toBe(stance.isSitting ? 4 : 5)
          for (const row of rows) expect(row.length).toBe(art.width)
          expectPainted(art, rows)
        }
  })

  test('o desenho fino tem FINE_X por FINE_Y pontos por subpixel e só marcas da paleta, em qualquer postura', () => {
    for (const [, art] of COLORED)
      for (const stance of stances()) {
        const rows = detailDrawing(art, stance)
        expect(rows?.length).toBe((stance.isSitting ? 4 : 5) * FINE_Y)
        for (const row of rows ?? []) expect(row.length).toBe(art.width * FINE_X)
        expectPainted(art, rows ?? [])
        expect((rows ?? []).join('').includes('_')).toBe(false)
      }
  })

  test('todo remendo do desenho fino cabe nele: começa dentro, não passa do fim e tem a largura dele', () => {
    for (const [, art] of COLORED) {
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
    for (const [, art] of COLORED) {
      const lit = drawing(art, { ...STAND, hasLitEyes: true }).join('')
      expect(lit.includes(EYE)).toBe(true)
      expect(lit.includes(art.pupil ?? '?')).toBe(false)
      expect(drawing(art, { ...STAND, eyes: 'closed', hasLitEyes: true }).join('').includes(EYE)).toBe(false)
    }
  })

  test('cada postura muda o desenho fino: os olhos, os braços e o passo', () => {
    for (const [, art] of COLORED) {
      const standing = detailDrawing(art, STAND)
      for (const eyes of ['closed', 'left', 'right'] as const) expect(detailDrawing(art, { ...STAND, eyes })).not.toEqual(standing)
      expect(detailDrawing(art, { ...STAND, isArmsUp: true })).not.toEqual(standing)
      expect(detailDrawing(art, { ...STAND, step: 1 })).not.toEqual(standing)
      expect(detailDrawing(art, { ...STAND, isSitting: true })).toEqual(standing?.slice(0, -FINE_Y))
    }
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
