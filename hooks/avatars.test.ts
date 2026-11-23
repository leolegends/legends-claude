import { describe, expect, test } from 'claude-code/testing'

import { AVATAR_ART, artOf } from './avatars'
import { fitCells } from './blocks'
import { bitmapShapes, rasterize } from './canvas'
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
  const idle: Worker = { id: MAIN, x: 30, act: 'idle', t: 0, load: '', queue: '', busy: 0, tool: null, thinking: 0, phase: 'think', draft: null, isAsleep: false, shout: 0 }
  const working: Sim = { ...EMPTY_SIM, isOn: true, workers: [idle] }
  const artAt = (art: Art, tier: number, level: number, over: Partial<Worker> = {}) => poseOf({ ...idle, ...over }, working, power(tier, level), art).art

  test('todo avatar colorido tem um elemento de aura só dele e uma forma com poder, do mesmo elemento; o Clawd não tem nem um nem outro', () => {
    for (const [, art] of COLORED) {
      expect(['fire', 'volt', 'star', 'frost'].includes(art.element ?? '')).toBe(true)
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
  const sim: Sim = { ...EMPTY_SIM, isOn: true, workers: [{ id: MAIN, x: 30, act: 'idle', t: 0, load: '', queue: '', busy: 0, tool: null, thinking: 0, phase: 'think', draft: null, isAsleep: false, shout: 0 }] }
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

describe('a Elsa', () => {
  const elsa = AVATAR_ART.elsa
  const forms = [elsa, elsa.form ?? elsa]
  const inked = (row: string | undefined) => [...(row ?? '')].map(isInk)
  // Uma linha inteira: da primeira marca com tinta à última, nenhum vão.
  const isSolid = (row: string | undefined) => {
    const marks = inked(row)
    return marks.includes(true) && marks.slice(marks.indexOf(true), marks.lastIndexOf(true) + 1).every(Boolean)
  }

  test('é de gelo, e a forma com poder dela também', () => {
    expect(elsa.element).toBe('frost')
    expect(elsa.form?.element).toBe('frost')
  })

  test('o vestido vai até o chão: no lugar das pernas a barra dele é inteira, nos dois passos, no desenho comum e no fino', () => {
    for (const art of forms)
      for (const step of [0, 1] as const) {
        expect(isSolid(drawing(art, { ...STAND, step }).at(-1))).toBe(true)
        expect(isSolid(detailDrawing(art, { ...STAND, step })?.at(-1))).toBe(true)
      }
    // os outros têm duas pernas: há um vão entre elas
    expect(isSolid(drawing(AVATAR_ART.mario, STAND).at(-1))).toBe(false)
    expect(isSolid(detailDrawing(AVATAR_ART.mario, STAND)?.at(-1))).toBe(false)
  })

  test('a barra do vestido é a parte mais larga do desenho fino: ele abre até o chão', () => {
    const widthOf = (row: string | undefined) => inked(row).filter(Boolean).length
    for (const art of forms) {
      const rows = detailDrawing(art, STAND) ?? []
      expect(widthOf(rows.at(-1))).toBe(Math.max(...rows.map(widthOf)))
    }
  })

  test('com poder solta o cabelo: a trança de um lado só dá lugar ao cabelo dos dois lados, e o vestido azul, ao branco', () => {
    const base = detailDrawing(elsa, STAND) ?? []
    const form = detailDrawing(elsa.form ?? elsa, STAND) ?? []
    // o cabelo abaixo do rosto: de quantos lados do meio do desenho ele aparece
    const hairSides = (rows: readonly string[]) => new Set(rows.slice(10, 15).flatMap(row => [...row].flatMap((mark, x) => (mark === 'H' || mark === 'h' ? [x < row.length / 2 ? 'esquerda' : 'direita'] : [])))).size
    expect(hairSides(base)).toBe(1)
    expect(hairSides(form)).toBe(2)
    const dress = (art: Art) => art.paints?.[drawing(art, STAND)[3]?.[8] ?? ''] ?? ''
    const [r, g, b] = [1, 3, 5].map(i => parseInt(dress(elsa).slice(i, i + 2), 16))
    expect((b ?? 0) > (g ?? 0) && (g ?? 0) > (r ?? 0)).toBe(true) // azul
    expect([1, 3, 5].every(i => parseInt(dress(elsa.form ?? elsa).slice(i, i + 2), 16) > 225)).toBe(true) // branco
  })

  // O desenho fino como o palco de blocos o mostra no tamanho grande: cada célula do terminal, dois
  // pontos por quatro, com as duas tintas que o ajuste escolhe. `lit` é a luz das pupilas, de Opus para cima.
  const POINT = 4 // os pixels de um ponto do desenho fino
  const EYE_ROW = 1 // a linha de células dos olhos: as linhas 4 a 7 do desenho
  const blocksOf = (art: Art, stance: Stance, lit?: string) => {
    const rows = detailDrawing(art, stance) ?? []
    const inkOf = (mark: string) => (isInk(mark) ? { rgb: rgbOf(lit !== undefined && mark === art.pupil ? lit : (art.paints?.[mark] ?? '#000000')) } : null)
    const frame = rasterize(bitmapShapes(rows, { left: 0, top: 0, cellW: POINT, cellH: POINT }, inkOf), art.width * FINE_X * POINT, rows.length * POINT)
    return fitCells(frame, art.width, rows.length / FINE_Y, backdropRgb(false))
  }
  // As colunas das células da linha dos olhos que mostram uma tinta.
  const eyeCells = (art: Art, stance: Stance, paint: string, lit?: string) =>
    blocksOf(art, stance, lit).flatMap((cell, i) => (Math.floor(i / art.width) === EYE_ROW && (cell.fg === rgbOf(paint) || cell.bg === rgbOf(paint)) ? [i % art.width] : []))
  const LIGHTS = [undefined, '#FFF1B8', '#FFFFFF'] // sem luz, a de Opus e a de Fable

  test('em blocos, no tamanho grande, os olhos azuis aparecem dos dois lados do rosto em qualquer pose, com as pupilas acesas ou não', () => {
    const blue = elsa.paints?.i ?? ''
    expect(blue).toMatch(HEX)
    for (const art of forms)
      for (const eyes of LOOKS)
        for (const lit of LIGHTS) {
          const columns = eyeCells(art, { ...STAND, eyes }, blue, lit)
          expect(columns.some(x => x < art.width / 2)).toBe(true)
          expect(columns.some(x => x >= art.width / 2)).toBe(true)
        }
  })

  test('em blocos, a luz das pupilas aparece nas duas células dos olhos quando ela olha para a frente; fechados ou de lado, os olhos não acendem', () => {
    for (const art of forms)
      for (const lit of ['#FFF1B8', '#FFFFFF']) {
        expect(eyeCells(art, STAND, lit, lit).length).toBe(2)
        for (const eyes of ['closed', 'left', 'right'] as const) {
          const rows = detailDrawing(art, { ...STAND, eyes }) ?? []
          expect(rows.join('').includes(art.pupil ?? '?')).toBe(false)
        }
      }
  })

  test('de braços para cima, as mãos ficam ao lado da cabeça e os braços abaixados saem: na base fica o vão; de cabelo solto, é ele que aparece atrás', () => {
    const LOWERED = [[9, 12], [24, 27]] as const // as colunas dos braços abaixados, dos dois lados
    const RAISED = [[5, 8], [28, 31]] as const // e as das mãos erguidas
    const cut = (rows: readonly string[], y: number, spans: readonly (readonly [number, number])[]) => spans.map(([from, to]) => rows[y]?.slice(from, to))
    const [base, spirit] = forms.map(art => detailDrawing(art, { ...STAND, isArmsUp: true }) ?? [])
    if (!base || !spirit) throw new Error('faltou um desenho')
    for (const rows of [base, spirit]) for (const y of [4, 5]) expect(cut(rows, y, RAISED)).toEqual(['SSS', 'SSS'])
    for (const y of [12, 13, 14, 15]) expect(cut(base, y, LOWERED)).toEqual(['...', '...'])
    for (const y of [12, 13]) expect(cut(spirit, y, LOWERED)).toEqual(['HHH', 'HHH'])
    expect(cut(spirit, 15, LOWERED)).toEqual(['...', '...'])
    // abaixados, os braços estão lá: a manga e a mão
    for (const art of forms) {
      const rows = detailDrawing(art, STAND) ?? []
      for (const y of [12, 13, 14, 15]) for (const marks of cut(rows, y, LOWERED)) expect([...(marks ?? '')].every(isInk)).toBe(true)
    }
  })

  test('no outro passo a barra do vestido e as pontas da capa vão um ponto para o lado; o resto do desenho não muda', () => {
    for (const art of forms) {
      const still = detailDrawing(art, STAND) ?? []
      const moved = detailDrawing(art, { ...STAND, step: 1 }) ?? []
      expect(moved.slice(0, 18)).toEqual(still.slice(0, 18))
      for (const y of [18, 19]) expect(moved[y]).toBe(`${(still[y] ?? '').slice(1)}.`)
    }
  })

  test('no palco, a aura dela é de gelo: o azul da noite em volta e, com a aura forte, flocos de neve brancos', () => {
    const geo = geometry(100)
    if (!geo) throw new Error('o palco de teste não coube')
    const sim: Sim = { ...EMPTY_SIM, isOn: true, tick: 3, workers: [{ id: MAIN, x: 30, act: 'idle', t: 0, load: '', queue: '', busy: 0, tool: null, thinking: 0, phase: 'think', draft: null, isAsleep: false, shout: 0 }] }
    const colors = (level: number) => new Set(hdScene({ prev: sim, cur: sim, alpha: 0, geo, hud: [], trace: 'pixels', avatar: 'elsa', powers: new Map([[MAIN, power(2, level)]]) }).shapes.map(s => s.rgb))
    const NIGHT_BLUE = 0x5568e0
    const SNOW = rgbOf(mix('#EAF8FF', '#FFFFFF', 0.5))
    expect(colors(0).has(NIGHT_BLUE)).toBe(false)
    expect(colors(2).has(NIGHT_BLUE)).toBe(true)
    expect(colors(2).has(SNOW)).toBe(false)
    expect(colors(4).has(SNOW)).toBe(true)
  })
})

describe('o avatar nos ajustes', () => {
  test('um avatar conhecido é guardado; um desconhecido volta ao Clawd', () => {
    expect(sanitize({ avatar: 'kratos' }).avatar).toBe('kratos')
    expect(sanitize({ avatar: 'elsa' }).avatar).toBe('elsa')
    expect(sanitize({ avatar: 'sonic' }).avatar).toBe('clawd')
    expect(sanitize(undefined).avatar).toBe('clawd')
  })
})
