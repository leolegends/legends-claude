import { describe, expect, test } from 'claude-code/testing'

import { DEMO_FRAMES, applyDemo } from './demo'
import { SPINNER } from './effects'
import { cols } from './format'
import { KIND_PAINT, tintOf } from './palette'
import { partsWidth } from './parts'
import type { Part } from './parts'
import { SCENE_ROWS, sceneRows } from './scene'
import { EMPTY_SIM, MAIN, WALL_ROWS, geometry, step } from './sim'
import type { Geo, Sim, Worker } from './sim'

const GEO = geometry(100) as Geo
const HUD: Part[] = [{ text: '1m12s · 14 tools · ', dim: true }, { text: 'Bash', color: 'claude' }]
const text = (row: Part[] | undefined) => (row ?? []).map(p => p.text).join('')
const worker = (id: string, x: number, over: Partial<Worker> = {}): Worker => ({
  id, x, act: 'idle', t: 0, load: '', queue: '', busy: 0, tool: null, thinking: 0, isAsleep: false, shout: 0, ...over,
})
const scene = (over: Partial<Sim>, hud: Part[] = []) => sceneRows({ sim: { ...EMPTY_SIM, isOn: true, ...over }, geo: GEO, hud })
const paintsOf = (rows: Part[][]) => new Set(rows.flat().flatMap(p => [p.color, p.bg]))

describe('o mascote', () => {
  test('parado numa célula inteira, é o logo do Claude Code ponto a ponto, na cor de destaque', () => {
    const rows = scene({ workers: [worker(MAIN, 20)] })
    expect(text(rows[1])).toContain('▐▛███▜▌')
    expect(text(rows[2])).toContain('▝▜█████▛▘')
    expect(/▘▘.▝▝/.test(text(rows[3]))).toBe(true)
    expect(rows[1]?.find(p => p.text.includes('▛'))?.color).toBe('claude')
  })

  test('meia célula adiante é o mesmo desenho com outros blocos', () => {
    expect(text(scene({ workers: [worker(MAIN, 21)] })[1])).toContain('█▜██▛█')
  })

  test('de garras para cima quando carrega, e os tijolos vão na cabeça, em duas camadas', () => {
    const empty = scene({ workers: [worker(MAIN, 20, { act: 'haul' })] })
    const loaded = scene({ workers: [worker(MAIN, 20, { act: 'haul', load: 'rsebwa' })] })
    expect(text(loaded[1])).not.toBe(text(empty[1])) // as garras sobem ao lado da cabeça
    const air = loaded[0] ?? []
    // em cada célula, o tijolo de cima desenha e o de baixo é o fundo
    expect(air.some(p => p.color === KIND_PAINT.b && p.bg === KIND_PAINT.r)).toBe(true)
    expect(air.some(p => p.color === KIND_PAINT.w && p.bg === KIND_PAINT.s)).toBe(true)
    expect(air.some(p => p.color === KIND_PAINT.a && p.bg === KIND_PAINT.e)).toBe(true)
  })

  test('sem carga, anda aos pulinhos: num quadro sim, noutro não, o corpo sobe meia linha', () => {
    const walking = (tick: number) => scene({ tick, workers: [worker(MAIN, 20, { act: 'home' })] })
    expect(text(walking(0)[0])).not.toContain('▄')
    expect(text(walking(1)[0])).toContain('▗▄▄▄▄▄▖') // o topo da cabeça entra na linha de cima
  })
})

describe('os balões', () => {
  const air = (w: Partial<Worker>, tick = 0) => scene({ tick, workers: [worker(MAIN, 20, w)] })[0] ?? []

  test('pensando: a faísca do Claude pulsa sobre a cabeça', () => {
    expect(air({ thinking: 1 }, 4).find(p => p.text === SPINNER[4])).toMatchObject({ color: 'claude', bold: true })
    expect(air({ thinking: 1 }, 5).find(p => p.text === SPINNER[5])).toBeDefined()
  })

  test('esperando uma ferramenta: o nome dela e reticências que andam', () => {
    expect(text(air({ busy: 1, tool: 'Bash' }, 0))).toContain('Bash·')
    expect(text(air({ busy: 1, tool: 'Bash' }, 4))).toContain('Bash···')
  })

  test('carregando ou andando não há balão; gritando por um ajudante, um ponto de exclamação', () => {
    expect(text(air({ thinking: 1 }, 4))).toContain('✻')
    expect(text(air({ thinking: 1, act: 'haul', load: 'r' }, 4))).not.toContain('✻')
    expect(text(air({ thinking: 1, act: 'home' }, 4))).not.toContain('✻')
    expect(air({ shout: 3 }).find(p => p.text === '!')).toMatchObject({ color: 'claude', bold: true })
  })

  test('um nome com caractere largo não desalinha a linha', () => {
    for (const row of scene({ workers: [worker(MAIN, 20, { busy: 1, tool: '検索' })] })) expect(partsWidth(row) <= GEO.width).toBe(true)
  })
})

describe('os ajudantes', () => {
  test('cada um na cor do seu agente, menor que o mascote e desenhado na frente dele', () => {
    const rows = scene({ workers: [worker(MAIN, 20), worker('a1', 24)] })
    expect(paintsOf(rows).has(tintOf('a1'))).toBe(true)
    expect(text(rows[1])).not.toContain('▐▛███▜▌') // o mascote aparece cortado: o ajudante está na frente
    const alone = text(scene({ workers: [worker('a1', 24)] })[1])
    expect(alone).toContain('▗▄▄▄▖') // só o topo da cabeça chega à linha 1: ele é mais baixo que o mascote
    expect(alone).not.toContain('█')
  })

  test('recém-chamado ainda é só faíscas; dormindo, senta e solta um z; falhando, apaga e leva um ✗', () => {
    expect(paintsOf(scene({ workers: [worker('a1', 24, { act: 'enter', t: 1 })] })).has(tintOf('a1'))).toBe(false)
    const asleep = scene({ workers: [worker('a1', 24, { act: 'sleep' })] })
    expect(text(asleep[1])).toContain('z')
    expect(text(asleep[3])).not.toContain('▘') // sem patas: sentado
    const failed = scene({ workers: [worker('a1', 24, { act: 'fail' })] })
    expect(failed.flat().find(p => p.text === '✗')).toMatchObject({ color: 'error' })
    expect(failed.flat().some(p => p.color === tintOf('a1') && p.dim === true)).toBe(true)
    expect(scene({ workers: [worker('a1', 24, { act: 'cheer' })] }).flat().find(p => p.text === '✓')).toMatchObject({ color: 'success' })
  })
})

describe('tijolos, esteira e mosaico', () => {
  test('a pilha fica à esquerda, com um aviso quando não cabe tudo', () => {
    const few = scene({ workers: [worker(MAIN, 40, { queue: 'rb' })] })
    expect(few[3]?.[0]).toEqual({ text: '▀▀', color: KIND_PAINT.r })
    expect(few[2]?.[0]).toEqual({ text: '▄▄', color: KIND_PAINT.b })
    expect(text(few[0])).not.toContain('+')
    expect(text(scene({ workers: [worker(MAIN, 40, { queue: 'r'.repeat(11) })] })[0]).startsWith('+3')).toBe(true)
  })

  test('um tijolo na esteira é da cor da família dele e fica sobre a linha', () => {
    const ground = scene({ belt: [{ kind: 'e', x: 60 }] })[3] ?? []
    const at = ground.findIndex(p => p.color === KIND_PAINT.e)
    expect(ground[at]).toEqual({ text: '▀▀', color: KIND_PAINT.e })
    expect(partsWidth(ground.slice(0, at))).toBe(60)
  })

  test('o mosaico sobe em fiadas alternadas a partir da direita, e o recém-chegado acende', () => {
    const rows = scene({ wall: 'rbe' })
    expect(text(rows[3]).endsWith('▀▀')).toBe(true) // a primeira fiada encosta na borda
    expect(text(rows[2]).endsWith('▄▀▀')).toBe(true) // a segunda começa uma célula antes
    expect(rows[2]?.some(p => p.color === KIND_PAINT.e && p.bg === KIND_PAINT.b)).toBe(true) // duas cores numa célula
    expect(paintsOf(scene({ wall: 'rbe', flash: 2 })).has('text')).toBe(true)
    expect(paintsOf(rows).has('text')).toBe(false)
  })

  test('a esteira encosta no mosaico: nenhuma célula vazia entre os dois', () => {
    for (const wall of ['', 'r', 'rb', 'rbe', 'rbewsa']) {
      const ground = text(scene({ wall })[3])
      const lastRail = Math.max(ground.lastIndexOf('═'), ground.lastIndexOf('╪'))
      expect(ground.slice(lastRail + 1).includes(' ')).toBe(false)
      expect(ground.length).toBe(GEO.width)
    }
  })

  test('um mosaico maior que o espaço mostra só as colunas mais novas', () => {
    const room = GEO.wallCols * WALL_ROWS
    const rows = scene({ wall: 'b'.repeat(10) + 'r'.repeat(room) })
    expect(paintsOf(rows).has(KIND_PAINT.b)).toBe(false)
    for (const row of rows) expect(partsWidth(row) <= GEO.width).toBe(true)
  })

  test('o chão é uma linha fina na pista, e a esteira tem roletes que andam', () => {
    const ground = (tick: number) => text(scene({ tick })[3])
    expect(ground(0).startsWith('─')).toBe(true)
    expect(ground(0)).toContain('═')
    const roller = (tick: number) => ground(tick).indexOf('╪')
    expect(roller(1) - roller(0)).toBe(1)
    expect(roller(4)).toBe(roller(0))
  })

  test('uma faísca é um ponto solto na cor dela', () => {
    const rows = scene({ sparks: [{ x: 50, y: 3, vx: 0, vy: 0, life: 3, paint: KIND_PAINT.a }] })
    expect(rows[1]?.find(p => p.color === KIND_PAINT.a)?.text).toBe('▖')
  })
})

describe('o quadro inteiro', () => {
  test('o placar fica no canto de cima, encostado à direita', () => {
    const rows = scene({}, HUD)
    expect(text(rows[0]).endsWith('1m12s · 14 tools · Bash')).toBe(true)
    expect(partsWidth(rows[0] ?? [])).toBe(GEO.width)
    expect(rows[0]?.[rows[0].length - 1]).toEqual({ text: 'Bash', color: 'claude' })
  })

  test('o mesmo quadro desenha sempre igual, e as estrelas piscam de um quadro para outro', () => {
    expect(scene({ tick: 7 })).toEqual(scene({ tick: 7 }))
    const sky = (tick: number) => text(scene({ tick })[0])
    expect(new Set(Array.from({ length: 40 }, (_, tick) => sky(tick))).size > 3).toBe(true)
  })

  test('pela demonstração inteira, em três larguras: quatro linhas, nenhuma passa da largura, cada caractere numa célula', () => {
    for (const columns of [56, 100, 120]) {
      const geo = geometry(columns) as Geo
      Array.from({ length: DEMO_FRAMES + 1 }).reduce<Sim>((sim, _, frame) => {
        const next = step(applyDemo(sim, frame), geo)
        const rows = sceneRows({ sim: next, geo, hud: HUD })
        expect(rows.length).toBe(SCENE_ROWS)
        for (const row of rows) {
          expect(partsWidth(row) <= geo.width).toBe(true)
          expect(row.every(p => cols(p.text) === [...p.text].length)).toBe(true)
        }
        return next
      }, EMPTY_SIM)
    }
  })
})
