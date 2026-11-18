import type { TurnStepChunk } from 'claude-code'

import { shortTool } from './format'
import type { Phase } from './sim'

// O que cada trecho de um pedido ao modelo diz sobre o que ele faz agora. A resposta chega em pedaços:
// raciocínio, texto visível, o começo de uma chamada de ferramenta e os argumentos dela. O palco
// mostra a fase: quem pensa, quem escreve a resposta, quem monta uma chamada.

/** A fase de um pedido e, quando ele monta uma chamada, o nome curto da ferramenta. */
export type Heard = { readonly phase: Phase; readonly tool: string | null }

/** Como todo pedido começa: pensando. */
export const THINKING: Heard = { phase: 'think', tool: null }
const WRITING: Heard = { phase: 'write', tool: null }

const HAS_INK = /\S/ // texto só de espaços e quebras de linha ainda não é resposta

/**
 * Puro: a fase depois de um trecho. Devolve o mesmo objeto enquanto ela não muda, para quem ouve
 * saber, sem comparar campo a campo, que não há nada a fazer: os trechos de texto chegam às dezenas
 * por segundo. Os argumentos de uma chamada, a parada e os itens do engine não mudam a fase; um
 * trecho de um tipo que esta versão não conhece também não.
 */
export const hear = (now: Heard, chunk: TurnStepChunk): Heard => {
  switch (chunk?.kind) {
    case 'thinking':
      return now.phase === 'think' ? now : THINKING
    case 'text':
      return now.phase === 'write' || typeof chunk.text !== 'string' || !HAS_INK.test(chunk.text) ? now : WRITING
    case 'tool': {
      const tool = typeof chunk.name === 'string' ? shortTool(chunk.name) : ''
      return !tool || (now.phase === 'draft' && now.tool === tool) ? now : { phase: 'draft', tool }
    }
    default:
      return now
  }
}
