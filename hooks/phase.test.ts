import { describe, expect, test } from 'claude-code/testing'
import type { TurnStepChunk } from 'claude-code'

import { THINKING, hear } from './phase'

const thinking = (text = 'hmm'): TurnStepChunk => ({ kind: 'thinking', index: 0, text })
const text = (words: string): TurnStepChunk => ({ kind: 'text', index: 1, text: words })
const tool = (name: string): TurnStepChunk => ({ kind: 'tool', index: 2, id: 'call-1', name })
const input = (json: string): TurnStepChunk => ({ kind: 'input', index: 2, json })
const stop: TurnStepChunk = { kind: 'stop', stopReason: 'tool_use', usage: null }
const engine: TurnStepChunk = { kind: 'engine', ref: 7 }

describe('o que cada trecho do pedido diz', () => {
  test('um pedido começa pensando, e um trecho de raciocínio não muda isso', () => {
    expect(THINKING).toEqual({ phase: 'think', tool: null })
    expect(hear(THINKING, thinking())).toBe(THINKING)
  })

  test('texto visível: o modelo escreve a resposta', () => {
    expect(hear(THINKING, text('Vou ler o arquivo.'))).toEqual({ phase: 'write', tool: null })
  })

  test('texto só de espaços ou quebras de linha ainda não é resposta', () => {
    expect(hear(THINKING, text('\n\n'))).toBe(THINKING)
    expect(hear(THINKING, text(''))).toBe(THINKING)
  })

  test('o começo de uma chamada: o modelo monta a ferramenta, com o nome curto dela', () => {
    expect(hear(THINKING, tool('Bash'))).toEqual({ phase: 'draft', tool: 'Bash' })
    expect(hear(THINKING, tool('mcp__docs__search'))).toEqual({ phase: 'draft', tool: 'search' })
  })

  test('os argumentos, a parada e os itens do engine não mudam a fase', () => {
    const drafting = hear(THINKING, tool('Write'))
    for (const chunk of [input('{"file_path":'), stop, engine]) expect(hear(drafting, chunk)).toBe(drafting)
  })

  test('enquanto a fase é a mesma, devolve o mesmo objeto: quem ouve sabe que nada mudou', () => {
    const writing = hear(THINKING, text('a'))
    expect(hear(writing, text('b'))).toBe(writing)
    expect(hear(writing, text('\n'))).toBe(writing)
    const drafting = hear(writing, tool('Read'))
    expect(hear(drafting, tool('Read'))).toBe(drafting)
    expect(hear(drafting, tool('Grep'))).toEqual({ phase: 'draft', tool: 'Grep' }) // duas chamadas na mesma resposta
  })

  test('de volta ao raciocínio ou ao texto, a fase volta com ele', () => {
    const drafting = hear(THINKING, tool('Read'))
    expect(hear(drafting, thinking())).toBe(THINKING)
    expect(hear(drafting, text('pronto'))).toEqual({ phase: 'write', tool: null })
  })

  test('um trecho estranho (uma versão do engine com outros tipos) é ignorado, sem erro', () => {
    expect(hear(THINKING, { kind: 'novo' } as never)).toBe(THINKING)
    expect(hear(THINKING, { kind: 'tool', index: 0, id: 'x' } as never)).toBe(THINKING) // sem nome não há o que mostrar
    expect(hear(THINKING, { kind: 'text', index: 0 } as never)).toBe(THINKING)
    expect(hear(THINKING, null as never)).toBe(THINKING)
  })
})
