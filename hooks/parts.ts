import { cols } from './format'

/** O que um clique no cabeçalho troca: o modelo ou o effort. */
export type Switch = 'model' | 'effort'
/**
 * Um trecho de linha. `bg` pinta o fundo da célula (o palco usa para dois tijolos numa célula só);
 * com `action`, um clique nele abre o seletor de modelo ou de effort.
 */
export type Part = { text: string; color?: string; bg?: string; dim?: boolean; bold?: boolean; action?: Switch }
/** Uma linha da barra: o texto e, opcionalmente, um trecho encostado à direita. */
export type Line = { parts: Part[]; tail?: Part[] }

export const TAIL_GAP = 2 // colunas entre o texto de uma linha e o que fica encostado à direita

const isSameStyle = (a: Part, b: Part) =>
  a.color === b.color && a.bg === b.bg && a.dim === b.dim && a.bold === b.bold && a.action === b.action

// Junta trechos vizinhos de mesmo estilo: menos pedaços para desenhar, o mesmo texto.
export const merge = (parts: readonly Part[]): Part[] =>
  parts.reduce<Part[]>((out, p) => {
    const last = out[out.length - 1]
    return last && isSameStyle(last, p) ? [...out.slice(0, -1), { ...last, text: last.text + p.text }] : [...out, p]
  }, [])

export const partsWidth = (parts: readonly Part[]) => parts.reduce((n, p) => n + cols(p.text), 0)
export const lineWidth = (l: Line) => partsWidth(l.parts) + (l.tail?.length ? TAIL_GAP + partsWidth(l.tail) : 0)
