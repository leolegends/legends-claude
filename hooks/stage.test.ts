import { describe, expect, test } from 'claude-code/testing'

import { cycle, hasScene, stageRows, tintOf } from './stage'
import type { StagePart } from './stage'
import type { StatusAgent } from '../types'

const T0 = 1_000_000
const F = 150 // um quadro
const W = 72
const MAIN = { startedAt: T0, tools: 0, lastTool: 'Bash', costAtStart: 0 }
const agent = (id: string, bornAtFrame: number, over: Partial<StatusAgent> = {}): StatusAgent => ({
  id, type: 'Explore', description: '', model: null, state: 'running',
  startedAt: T0 + bornAtFrame * F, seenAt: 0, tools: 2, lastTool: 'Grep', ...over,
})
const plain = (parts: StagePart[] | undefined) => (parts ?? []).map(p => p.text).join('')
const scene = (frame: number, agents: StatusAgent[] = [], over: object = {}) =>
  stageRows({ main: MAIN, agents, now: T0 + frame * F, isWorking: true, width: W, frameMs: F, ...over })
const top = (frame: number, agents: StatusAgent[] = [], over: object = {}) => plain(scene(frame, agents, over)[0])
const ground = (frame: number, agents: StatusAgent[] = [], over: object = {}) => plain(scene(frame, agents, over)[1])

describe('o vaivém', () => {
  test('pega na esquerda, leva carregando, entrega na direita e volta mais rápido de mãos vazias', () => {
    const at = (t: number) => cycle(t, 4, 58, 3, 5)
    expect(at(0)).toEqual({ x: 4, isCarrying: false, isMoving: false, isDropping: false }) // chegou à pilha
    expect(at(1)).toEqual({ x: 4, isCarrying: true, isMoving: false, isDropping: false }) // pegou
    expect(at(2)).toEqual({ x: 7, isCarrying: true, isMoving: true, isDropping: false })
    expect(at(19).x).toBe(58)
    expect(at(20)).toEqual({ x: 58, isCarrying: false, isMoving: false, isDropping: true }) // entregou
    expect(at(22)).toEqual({ x: 53, isCarrying: false, isMoving: true, isDropping: false }) // volta de 5 em 5
    expect(at(33)).toEqual(at(0)) // e recomeça
  })
})

describe('o palco', () => {
  test('o mascote carrega o arquivo com o nome da ferramenta em uso, entrega e a prateleira conta', () => {
    expect(top(0)).toBe('    ▐▛███▜▌')
    expect(ground(0)).toBe(`▤▤▤  ▘▘ ▝▝ ${' '.repeat(W - 14)}▤ 0`)
    expect(top(1)).toBe('    ▐▛███▜▌▤ Bash')
    expect(top(8)).toBe(`${' '.repeat(25)}▐▛███▜▌▤ Bash`)
    expect(top(20)).toBe(`${' '.repeat(58)}▐▛███▜▌✽`) // a entrega brilha
    expect(top(28)).toBe(`${' '.repeat(23)}▐▛███▜▌`) // voltando, sem arquivo
    expect(ground(8, [], { main: { ...MAIN, tools: 14 } }).endsWith('▤ 14')).toBe(true)
  })

  test('as patas alternam enquanto anda e o bicho pisca de vez em quando', () => {
    expect(ground(2).trimEnd().includes('▘▘ ▝▝')).toBe(true)
    expect(ground(3).trimEnd().includes('▝▘ ▘▝')).toBe(true)
    expect(top(22)).toContain('▐█████▌') // olhos fechados
    expect(top(23)).toContain('▐▛███▜▌')
  })

  test('o mascote grita e um ajudante brota atrás dele em faíscas, corre à pilha e passa a carregar', () => {
    const helper = [agent('a1', 6)]
    expect(top(6, helper)).toBe(`${' '.repeat(15)}✽   ▐▛███▜▌! Bash`)
    expect(top(7, helper)).toContain('✶✻✶')
    expect(top(8, helper)).toContain('✢✳✻✳✢')
    expect(top(9, helper)).toBe(`${' '.repeat(8)}▐▛█▜▌${' '.repeat(15)}▐▛███▜▌! Bash`)
    expect(top(11, helper).startsWith('    ▐▛█▜▌ ')).toBe(true) // chegou à pilha, e o grito acabou
    expect(top(11, helper)).toContain('▐▛███▜▌▤ Bash')
    expect(top(14, helper)).toContain('▐▛█▜▌▤') // carregando o próprio arquivo, sem rótulo
    expect(top(14, helper)).not.toContain('Grep')
  })

  test('quem termina para onde estava, ganha ✓ e some em faíscas; quem falha ganha ✗', () => {
    const done = [agent('a1', 6, { state: 'done', endedAt: T0 + 20 * F })]
    expect(top(20, done)).toContain('▐▛█▜▌✓')
    expect(top(23, done)).toContain('▐▛█▜▌✓')
    expect(top(24, done)).toContain('✶✻✶')
    expect(top(24, done)).not.toContain('▐▛█▜▌')
    expect(top(26, done)).not.toContain('✓')
    expect(top(21, [agent('a1', 6, { state: 'failed', endedAt: T0 + 20 * F })])).toContain('▐▛█▜▌✗')
  })

  test('quem passa na frente esconde quem está atrás, sem misturar os desenhos', () => {
    const crowd = [agent('a1', 6), agent('b2', 12), agent('c3', 18)]
    for (const frame of [26, 30, 31, 32, 40, 55, 77]) {
      const row = top(frame, crowd)
      expect(row).toContain('▐▛███▜▌') // o mascote está sempre inteiro, na frente
      expect(/▐▛███▜▌[▐▛█▜▌]/.test(row)).toBe(false) // e nada cola nele
    }
  })

  test('nenhuma linha passa da largura, e a mesma hora desenha sempre o mesmo quadro', () => {
    const crowd = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, n) => agent(id, n * 4))
    for (const width of [40, 60, 100, 220])
      for (let frame = 0; frame < 120; frame += 7)
        for (const row of scene(frame, crowd, { width })) expect([...plain(row)].length <= width).toBe(true)
    expect(scene(37, crowd)).toEqual(scene(37, crowd))
  })

  test('cada agente tem a sua cor, e a prateleira acende quando alguém entrega', () => {
    expect(tintOf('a1')).toBe(tintOf('a1'))
    expect(scene(12, [agent('a1', 6)])[0]?.some(p => p.color === tintOf('a1'))).toBe(true)
    const shelf = (frame: number) => scene(frame)[1]?.at(-1)
    expect(shelf(8)).toMatchObject({ dim: true })
    expect(shelf(20)).toMatchObject({ color: 'claude', bold: true })
  })

  test('sem turno o mascote espera na pilha enquanto os ajudantes trabalham; sem ninguém, não há cena', () => {
    const idle = { isWorking: false }
    expect(scene(50, [], idle)).toEqual([])
    expect(top(50, [agent('a1', 6)], idle).startsWith('    ▐▛███▜▌')).toBe(true)
    expect(top(50, [agent('a1', 6, { state: 'waiting' })], idle)).toContain('▐▛█▜▌z') // esperando, cochila
    expect(hasScene({ main: MAIN, agents: [agent('a1', 6, { state: 'done', endedAt: T0 })], now: T0 + 5 * F, isWorking: false, frameMs: F })).toBe(true)
    expect(hasScene({ main: MAIN, agents: [agent('a1', 6, { state: 'done', endedAt: T0 })], now: T0 + 6 * F, isWorking: false, frameMs: F })).toBe(false)
  })

  test('estreito demais para uma pista, o palco não desenha', () => {
    expect(scene(5, [], { width: 39 })).toEqual([])
  })
})
