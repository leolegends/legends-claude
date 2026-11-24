import type { SessionContextUsage } from 'claude-code'

import { PENDING } from './format'
import type { Strings } from './i18n'
import type { Line, Part } from './parts'
import type { StatusContext as Context } from '../types'

// A linha do contexto, pura: quanto da janela de contexto do modelo a conversa já ocupa, e o botão que
// compacta. Acima de SUGGEST_PCT a linha sugere compactar; acima de URGENT_PCT, insiste.

/** A partir daqui a linha sugere compactar (e a barra avisa uma vez, ao cruzar). */
export const SUGGEST_PCT = 70
/** A partir daqui a sugestão fica vermelha: falta pouco para o Claude Code compactar sozinho. */
export const URGENT_PCT = 85
const GAUGE = 10 // as células do medidor

/** Onde está o botão de compactar: parado, esperando a confirmação, ou com a compactação em curso. */
export type CompactState = 'idle' | 'armed' | 'running'

/** Puro: o contexto como a barra guarda, de session.measure ou de $.session.usage(). */
export const fromContext = (c: SessionContextUsage | undefined): Context | undefined =>
  c && c.window > 0 ? { window: c.window, ...(c.tokens !== undefined && { tokens: c.tokens }), ...(c.percent !== undefined && { pct: c.percent }) } : undefined

/** Puro: o uso cruzou a linha da sugestão agora, subindo. É quando a barra avisa, uma vez. */
export const crossedSuggest = (before: number | undefined, after: number | undefined): boolean =>
  after !== undefined && after >= SUGGEST_PCT && (before === undefined || before < SUGGEST_PCT)

// "124k", "1M", "850": curto, para caber ao lado do medidor.
const fmtShort = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n))

const colorOf = (pct: number) => (pct >= URGENT_PCT ? 'error' : pct >= SUGGEST_PCT ? 'warning' : 'claude')

// O que fica encostado à direita: o botão, com a sugestão antes dele quando o contexto está alto.
const contextTail = (pct: number, state: CompactState, t: Strings): Part[] => {
  if (state === 'running') return [{ text: t.compacting, dim: true }]
  if (state === 'armed') return [{ text: t.compactConfirm, color: 'error', bold: true, action: 'compact' }]
  if (pct >= URGENT_PCT) return [{ text: `${t.compactUrgent} `, color: 'error' }, { text: t.compact, color: 'error', bold: true, action: 'compact' }]
  if (pct >= SUGGEST_PCT) return [{ text: `${t.compactSuggest} `, color: 'warning' }, { text: t.compact, color: 'warning', bold: true, action: 'compact' }]
  return [{ text: t.compact, dim: true, action: 'compact' }]
}

/**
 * Puro: "contexto ▰▰▰▰▰▰▱▱▱▱ 62% · 124k/200k            ⟳ compactar". Sem leitura da janela atual (sessão
 * nova, ou recém-compactada, até a próxima resposta) mostra só a janela, e não há o que compactar.
 */
export const contextLine = (c: Context, state: CompactState, t: Strings): Line => {
  const label: Part = { text: t.context, dim: true }
  if (c.tokens === undefined || c.pct === undefined) {
    return {
      parts: [label, { text: '▱'.repeat(GAUGE), color: 'subtle' }, { text: ` ${PENDING}`, dim: true }, { text: ` / ${fmtShort(c.window)}`, dim: true }],
      tail: state === 'running' ? [{ text: t.compacting, dim: true }] : [],
    }
  }
  const pct = Math.max(0, Math.min(100, c.pct))
  const on = Math.min(GAUGE, Math.round((pct * GAUGE) / 100))
  const color = colorOf(pct)
  return {
    parts: [
      label,
      ...(on > 0 ? [{ text: '▰'.repeat(on), color }] : []),
      ...(on < GAUGE ? [{ text: '▱'.repeat(GAUGE - on), color: 'subtle' }] : []),
      { text: ` ${Math.round(pct)}%`, ...(color === 'claude' ? { bold: true } : { color, bold: true }) },
      { text: ` · ${fmtShort(c.tokens)}/${fmtShort(c.window)}`, dim: true },
    ],
    tail: contextTail(pct, state, t),
  }
}
