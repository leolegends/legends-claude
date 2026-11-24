import { cols } from './format'

/** O que um clique no cabeçalho troca: o modelo ou o effort. */
export type Switch = 'model' | 'effort'
/** O que um trecho clicável faz: abre o seletor de modelo ou de effort, ou compacta a conversa. */
export type Action = Switch | 'compact'
/**
 * Um trecho de linha. `bg` pinta o fundo da célula (o palco usa para dois tijolos numa célula só);
 * `underline` sublinha (o nome do agente cuja transcrição está na tela); com `action`, o trecho é um
 * botão: abre o seletor de modelo ou de effort, ou compacta.
 */
export type Part = { text: string; color?: string; bg?: string; dim?: boolean; bold?: boolean; underline?: boolean; action?: Action }
/**
 * Uma linha da barra: o texto e, opcionalmente, um trecho encostado à direita. Com `agentId`, é a
 * linha desse agente: no terminal, um clique nela põe a transcrição dele na tela.
 */
export type Line = { parts: Part[]; tail?: Part[]; agentId?: string }

export const TAIL_GAP = 2 // colunas entre o texto de uma linha e o que fica encostado à direita

const isSameStyle = (a: Part, b: Part) =>
  a.color === b.color && a.bg === b.bg && a.dim === b.dim && a.bold === b.bold && a.underline === b.underline && a.action === b.action

// Junta trechos vizinhos de mesmo estilo: menos pedaços para desenhar, o mesmo texto.
export const merge = (parts: readonly Part[]): Part[] =>
  parts.reduce<Part[]>((out, p) => {
    const last = out[out.length - 1]
    return last && isSameStyle(last, p) ? [...out.slice(0, -1), { ...last, text: last.text + p.text }] : [...out, p]
  }, [])

export const partsWidth = (parts: readonly Part[]) => parts.reduce((n, p) => n + cols(p.text), 0)
export const lineWidth = (l: Line) => partsWidth(l.parts) + (l.tail?.length ? TAIL_GAP + partsWidth(l.tail) : 0)
