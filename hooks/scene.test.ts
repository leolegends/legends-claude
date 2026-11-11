import { describe, expect, test } from 'claude-code/testing'

import { eyesOf } from './aura'
import { DEMO_CAST, DEMO_FRAMES, applyDemo } from './demo'
import { SPINNER } from './effects'
import { cols } from './format'
import { KIND_PAINT, tintOf } from './palette'
import { partsWidth } from './parts'
import type { Part } from './parts'
import { power, sparkAt } from './power'
import type { Power } from './power'
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

describe('o poder de cada um', () => {
  const BRICK_PAINTS = new Set<string | undefined>(Object.values(KIND_PAINT))
  // Uma tinta que só o poder põe em cena: um hex que não é de tijolo (a aura, o brilho, os olhos, as fagulhas).
  const isPowerPaint = (paint: string | undefined) => paint !== undefined && paint.startsWith('#') && !BRICK_PAINTS.has(paint)
  const powered = (p: Power, over: Partial<Sim>, isLight = false) =>
    sceneRows({ sim: { ...EMPTY_SIM, isOn: true, ...over }, geo: GEO, hud: [], powers: new Map([[MAIN, p]]), isLight })
  const idle = (p: Power, isLight = false) => powered(p, { workers: [worker(MAIN, 40)] }, isLight)
  // Quantas células da cena têm alguma tinta do poder.
  const glowing = (rows: Part[][]) =>
    rows.flat().reduce((n, part) => n + (isPowerPaint(part.color) || isPowerPaint(part.bg) ? cols(part.text) : 0), 0)
  // A tinta (a da frente e a do fundo) de cada célula de uma linha.
  const cellsOf = (row: Part[] | undefined) => (row ?? []).flatMap(part => Array.from({ length: cols(part.text) }, () => part))
  const brightness = (hex: string) => [1, 3, 5].reduce((n, i) => n + parseInt(hex.slice(i, i + 2), 16), 0)
  const powerPaints = (rows: Part[][]) => [...paintsOf(rows)].filter((paint): paint is string => isPowerPaint(paint))

  test('sem aura nem brilho (Haiku em low) a cena é a de sempre; só a faísca de quem pensa é a da classe', () => {
    for (const over of [{}, { act: 'haul' as const, load: 'rse' }, { act: 'home' as const }, { busy: 1, tool: 'Bash' }])
      expect(powered(power(0, 0), { tick: 3, workers: [worker(MAIN, 40, over)] })).toEqual(scene({ tick: 3, workers: [worker(MAIN, 40, over)] }))
    const air = powered(power(0, 0), { tick: 2, workers: [worker(MAIN, 40, { thinking: 1 })] })[0] ?? []
    expect(air.find(p => p.text === sparkAt(0, 2))).toMatchObject({ color: 'claude', bold: true })
    expect(sparkAt(0, 2)).not.toBe(SPINNER[2])
  })

  test('a aura envolve o mascote e cresce com o effort; em low, Sonnet e Opus não têm nenhuma', () => {
    const QUIET = 20 // um quadro em que a faixa de brilho não está passando pelo corpo
    for (const tier of [1, 2]) {
      const areas = [0, 1, 2, 3, 4].map(level => glowing(powered(power(tier, level), { tick: QUIET, workers: [worker(MAIN, 40)] })))
      expect(areas[0]).toBe(tier === 2 ? 2 : 0) // em low não há aura: de Opus, só os dois olhos acesos
      for (const [level, area] of areas.entries()) expect(level === 0 || area > (areas[level - 1] ?? 0)).toBe(true)
    }
    expect(glowing(idle(power(3, 0))) > 0).toBe(true) // Fable tem aura até em low
    expect(glowing(idle(power(0, 1)))).toBe(0) // e Haiku só a partir de high
    expect(glowing(idle(power(0, 2))) > 0).toBe(true)
  })

  test('a aura não muda a largura da cena nem desenha na linha do chão', () => {
    // Em todo quadro e com o mascote em qualquer meia célula: o desenho da linha do chão é o de sempre,
    // sem clarão por trás. (A cor das patas pode ser a da faixa de brilho do corpo, quando ela passa por elas.)
    for (const x of [40, 41])
      for (let tick = 0; tick < 48; tick += 1) {
        if ((tick + 14) % 31 === 0) continue // o quadro do piscar não importa aqui, mas é igual nos dois
        const plain = scene({ tick, workers: [worker(MAIN, x)] })
        for (const p of [power(1, 2), power(2, 2), power(3, 1)]) {
          const lit = powered(p, { tick, workers: [worker(MAIN, x)] })
          expect(text(lit[3])).toBe(text(plain[3]))
          expect((lit[3] ?? []).every(part => part.bg === undefined)).toBe(true)
        }
      }
    for (const row of idle(power(3, 4))) expect(partsWidth(row) <= GEO.width).toBe(true)
  })

  test('os olhos vazados deixam a aura aparecer; de Opus para cima acendem com luz própria, mesmo sem aura', () => {
    const face = (rows: Part[][]) => cellsOf(rows[1]).filter(cell => cell.color === 'claude' && cell.bg !== undefined)
    expect(face(scene({ workers: [worker(MAIN, 40)] }))).toEqual([]) // sem poder, os olhos são dois vazios
    expect(face(idle(power(1, 2))).some(cell => isPowerPaint(cell.bg))).toBe(true)
    for (const tier of [2, 3]) expect(paintsOf(idle(power(tier, 0))).has(eyesOf(power(tier, 0)) ?? '')).toBe(true)
    // de olhos fechados (ele pisca um quadro a cada 31), nenhuma luz
    const open = Array.from({ length: 31 }, (_, tick) => powered(power(2, 0), { tick, workers: [worker(MAIN, 40)] }))
      .filter(rows => paintsOf(rows).has(eyesOf(power(2, 0)) ?? ''))
    expect(open.length).toBe(30)
  })

  test('Fable voa: andando vai sem patas, com jatos no lugar; parado, pousa', () => {
    const feet = (rows: Part[][]) => cellsOf(rows[3]).filter(cell => cell.color === 'claude').length
    const jets = (rows: Part[][]) => cellsOf(rows[3]).filter(cell => isPowerPaint(cell.color)).length
    const walking = (p: Power, tick: number) => powered(p, { tick, workers: [worker(MAIN, 40, { act: 'home' })] })
    expect(feet(walking(power(2, 4), 0)) > 0).toBe(true) // Opus anda
    const frames = [0, 1, 2, 3, 4, 5].map(tick => walking(power(3, 0), tick))
    for (const rows of frames) expect(feet(rows)).toBe(0)
    expect(frames.some(rows => jets(rows) > 0)).toBe(true)
    expect(feet(idle(power(3, 0))) > 0).toBe(true)
    // voando, a cabeça fica na altura de sempre: os tijolos que leva continuam na linha de cima
    const hauling = powered(power(3, 0), { workers: [worker(MAIN, 40, { act: 'haul', load: 'r' })] })
    expect(paintsOf([hauling[0] ?? []]).has(KIND_PAINT.r)).toBe(true)
  })

  test('quem corre com poder risca o ar atrás de si: levando, à esquerda; indo buscar, à direita', () => {
    const MASCOT_CELLS = [20, 28] as const // as células que o mascote ocupa com x = 40
    const marks = (rows: Part[][], from: number, to: number) =>
      [1, 2].reduce((n, row) => n + cellsOf(rows[row]).slice(from, to).filter(cell => isPowerPaint(cell.color) || isPowerPaint(cell.bg)).length, 0)
    const running = (act: 'haul' | 'fetch') => powered(power(1, 2), { tick: 4, workers: [worker(MAIN, 40, { act })] })
    const far = 3 // células de folga: para lá da aura
    expect(marks(running('haul'), 0, MASCOT_CELLS[0] - far) > 0).toBe(true)
    expect(marks(running('haul'), MASCOT_CELLS[1] + far, GEO.width)).toBe(0)
    expect(marks(running('fetch'), MASCOT_CELLS[1] + far, GEO.width) > 0).toBe(true)
    expect(marks(running('fetch'), 0, MASCOT_CELLS[0] - far)).toBe(0)
    expect(marks(idle(power(1, 2)), 0, MASCOT_CELLS[0] - far)).toBe(0) // parado, nada
  })

  test('um ajudante tem aura menor que a do mascote com o mesmo poder; dormindo ou falhando, nenhuma', () => {
    const helper = (over: Partial<Worker> = {}) =>
      sceneRows({ sim: { ...EMPTY_SIM, isOn: true, workers: [worker('a1', 40, over)] }, geo: GEO, hud: [], powers: new Map([['a1', power(1, 4)]]) })
    expect(glowing(helper()) > 0).toBe(true)
    expect(glowing(helper()) < glowing(idle(power(1, 4)))).toBe(true)
    expect(glowing(helper({ act: 'sleep' }))).toBe(0)
    expect(glowing(helper({ act: 'fail' }))).toBe(0)
  })

  test('fora de um turno o mascote descansa: segue quem é, sem a energia do effort', () => {
    const waiting = { workers: [worker(MAIN, 40), worker('a1', 70)] } // o turno acabou, um ajudante ainda trabalha
    expect(glowing(powered(power(2, 4), { ...waiting, isOn: true })) > 0).toBe(true)
    expect(powered(power(2, 4), { ...waiting, isOn: false })).toEqual(powered(power(2, 0), { ...waiting, isOn: false }))
    expect(paintsOf(powered(power(2, 4), { ...waiting, isOn: false })).has(eyesOf(power(2, 4)) ?? '')).toBe(true) // os olhos seguem acesos
  })

  test('a festa de um turno que trabalhou tem fogos, de Opus para cima', () => {
    const GOLD = '#E0A526' // um dos ouros dos fogos de Opus
    const party = (p: Power, over: Partial<Sim> = {}) =>
      powered(p, { isOn: false, finale: 12, work: 5, workers: [worker(MAIN, 60, { act: 'cheer' })], ...over })
    expect(paintsOf(party(power(2, 0))).has(GOLD)).toBe(true)
    expect(paintsOf(party(power(1, 0))).has(GOLD)).toBe(false)
    expect(paintsOf(party(power(2, 0), { work: 1 })).has(GOLD)).toBe(false) // um turno curto não tem festa
    expect(paintsOf(party(power(2, 0), { finale: 0 })).has(GOLD)).toBe(false)
    expect(powerPaints(party(power(3, 0))).length > powerPaints(party(power(2, 0))).length).toBe(true) // os de Fable têm mais cores
  })

  test('num tema claro a aura clareia em vez de escurecer', () => {
    const dark = powerPaints(idle(power(1, 2)))
    const light = powerPaints(idle(power(1, 2), true))
    expect(dark.length > 0 && light.length > 0).toBe(true)
    expect(Math.min(...light.map(brightness)) > Math.max(...dark.map(brightness))).toBe(true)
  })

  test('o mesmo quadro desenha sempre igual, e a aura se mexe de um quadro para outro', () => {
    const at = (tick: number) => powered(power(3, 4), { tick, workers: [worker(MAIN, 40, { thinking: 1 })] })
    expect(at(9)).toEqual(at(9))
    expect(new Set([0, 1, 2, 3, 4, 5].map(tick => JSON.stringify(at(tick)))).size).toBe(6)
  })

  test('pela demonstração inteira, em cada classe no effort máximo: quatro linhas, nenhuma passa da largura, cada caractere numa célula', () => {
    for (const tier of [0, 1, 2, 3]) {
      const powers = new Map<string, Power>([...DEMO_CAST, [MAIN, power(tier, 4)]])
      Array.from({ length: DEMO_FRAMES + 1 }).reduce<Sim>((sim, _, frame) => {
        const next = step(applyDemo(sim, frame), GEO)
        const rows = sceneRows({ sim: next, geo: GEO, hud: HUD, powers, isLight: tier % 2 === 1 })
        expect(rows.length).toBe(SCENE_ROWS)
        for (const row of rows) {
          expect(partsWidth(row) <= GEO.width).toBe(true)
          expect(row.every(p => cols(p.text) === [...p.text].length)).toBe(true)
        }
        return next
      }, EMPTY_SIM)
    }
  })
})

