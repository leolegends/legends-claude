import { describe, expect, test } from 'claude-code/testing'

import { TYPING_DOTS, poseOf } from './pose'
import { EMPTY_SIM, MAIN } from './sim'
import type { Sim, Worker } from './sim'

const idle: Worker = { id: MAIN, x: 30, act: 'idle', t: 0, load: '', queue: '', busy: 0, tool: null, thinking: 0, phase: 'think', draft: null, isAsleep: false, shout: 0 }
const at = (tick: number): Sim => ({ ...EMPTY_SIM, isOn: true, tick })
const markOf = (over: Partial<Worker>, tick = 0) => poseOf({ ...idle, ...over }, at(tick), undefined).mark
const eyesOver = (over: Partial<Worker>, ticks = 80) => new Set(Array.from({ length: ticks }, (_, tick) => poseOf({ ...idle, ...over }, at(tick), undefined).eyes))

describe('o sinal de quem tem um pedido ao modelo em curso', () => {
  test('sem pedido não há sinal; com um, começa pela faísca de quem pensa', () => {
    expect(markOf({})).toBeNull()
    expect(markOf({ thinking: 1 })).toEqual({ kind: 'think' })
  })

  test('escrevendo a resposta: três pontinhos, e o aceso anda um a cada dois quadros', () => {
    expect(TYPING_DOTS).toBe(3)
    const lit = Array.from({ length: 8 }, (_, tick) => markOf({ thinking: 1, phase: 'write' }, tick))
    expect(lit).toEqual([0, 0, 1, 1, 2, 2, 0, 0].map(dot => ({ kind: 'write', dot })))
  })

  test('montando a chamada de uma ferramenta: o nome dela, e um cursor que pisca a cada dois quadros', () => {
    const cursor = Array.from({ length: 6 }, (_, tick) => markOf({ thinking: 1, phase: 'draft', draft: 'Bash' }, tick))
    expect(cursor).toEqual([true, true, false, false, true, true].map(isCursorOn => ({ kind: 'draft', tool: 'Bash', isCursorOn })))
  })

  test('uma chamada sem nome é só um pedido pensando', () => {
    expect(markOf({ thinking: 1, phase: 'draft', draft: null })).toEqual({ kind: 'think' })
    expect(markOf({ thinking: 1, phase: 'draft', draft: '' })).toEqual({ kind: 'think' })
  })

  test('a ferramenta que roda vale mais que a fase do pedido; a fase não aparece sem pedido', () => {
    expect(markOf({ thinking: 1, phase: 'write', busy: 1, tool: 'Bash' })).toMatchObject({ kind: 'tool', tool: 'Bash' })
    expect(markOf({ thinking: 0, phase: 'write' })).toBeNull()
    expect(markOf({ thinking: 0, phase: 'draft', draft: 'Bash' })).toBeNull()
  })

  test('andando ou carregando não há sinal, em fase nenhuma', () => {
    expect(markOf({ thinking: 1, phase: 'write', act: 'home' })).toBeNull()
    expect(markOf({ thinking: 1, phase: 'draft', draft: 'Bash', act: 'haul', load: 'r' })).toBeNull()
  })
})

describe('os olhos de quem tem um pedido em curso', () => {
  test('quem pensa olha para os lados', () => {
    const eyes = eyesOver({ thinking: 1 })
    expect(eyes.has('left') && eyes.has('right')).toBe(true)
  })

  test('quem escreve ou monta uma ferramenta olha para a frente: só pisca', () => {
    for (const over of [{ phase: 'write' }, { phase: 'draft', draft: 'Bash' }] as const) {
      const eyes = eyesOver({ thinking: 1, ...over })
      expect([...eyes].sort()).toEqual(['closed', 'open'])
    }
  })
})
