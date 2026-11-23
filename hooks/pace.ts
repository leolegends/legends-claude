import type { StatusFigures as Figures, StatusLimit as Limit } from '../types'

// O ritmo de uma janela de limite de uso. A barra guarda as leituras recentes de cada janela e, delas,
// tira a que horas ela enche se o uso seguir como está. Só é notícia quando enche antes de zerar.
// Tudo puro: as leituras entram, a previsão sai.

/** As janelas de limite que a barra mostra. */
export type Window = 'fiveHour' | 'week'

/** O que a conta de uma janela pede: de quanto tempo para trás vêm as leituras, e o mínimo de tempo entre elas para confiar no ritmo. */
type Rule = { lookbackMs: number; minSpanMs: number }

const MINUTE = 60_000
// A janela de 5 horas enche em minutos; a de 7 dias, em dias: um pico de meia hora não diz nada sobre ela.
const RULES: Record<Window, Rule> = {
  fiveHour: { lookbackMs: 30 * MINUTE, minSpanMs: 4 * MINUTE },
  week: { lookbackMs: 6 * 60 * MINUTE, minSpanMs: 45 * MINUTE },
}
const MIN_RISE = 2 // pontos percentuais: menos que isso é arredondamento, não ritmo
const TRAIL_MAX = 24 // leituras guardadas por janela
const FULL = 100
const SAME_WINDOW_MS = 10 * MINUTE // duas leituras são da mesma janela quando a hora de zerar delas difere menos que isso

const resetOf = (limit: Pick<Limit, 'resetsAt'>): number => (limit.resetsAt ? Date.parse(limit.resetsAt) : NaN)

// A leitura nova é da mesma janela que a anterior: não caiu (uma queda é a janela zerando) e zera na mesma hora.
const isSameWindow = (prev: Limit, next: Pick<Limit, 'pct' | 'resetsAt'>): boolean => {
  if (next.pct < prev.pct) return false
  const a = resetOf(prev)
  const b = resetOf(next)
  return !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) < SAME_WINDOW_MS
}

/**
 * Puro: a janela com a leitura nova posta no rastro dela. Só entra no rastro a primeira leitura de
 * cada valor (é quando a janela chegou ali); as mais velhas que o período de observação saem; e uma
 * janela que zerou recomeça o rastro.
 */
export const track = (window: Window, prev: Limit | undefined, next: Pick<Limit, 'pct' | 'resetsAt'> | undefined, now: number): Limit | undefined => {
  if (!next) return undefined
  const kept = prev && isSameWindow(prev, next) ? (prev.trail ?? []).filter(s => now - s.at <= RULES[window].lookbackMs) : []
  const last = kept[kept.length - 1]
  const trail = last && last.pct === next.pct ? kept : [...kept, { at: now, pct: next.pct }].slice(-TRAIL_MAX)
  return { pct: next.pct, ...(next.resetsAt !== undefined && { resetsAt: next.resetsAt }), trail }
}

/**
 * Puro: em quantos milissegundos a janela enche no ritmo das leituras recentes, ou `null` quando não
 * há o que avisar: leituras de menos (pouco tempo, pouca subida), uso parado, ou um ritmo em que ela
 * zera antes de encher. Sem saber quando zera, também não avisa.
 */
export const fullIn = (window: Window, limit: Limit | undefined, now: number): number | null => {
  if (!limit || !(limit.pct < FULL)) return null
  const rule = RULES[window]
  const first = limit.trail?.find(s => now - s.at <= rule.lookbackMs)
  if (!first) return null
  const span = now - first.at
  const rise = limit.pct - first.pct
  if (span < rule.minSpanMs || rise < MIN_RISE) return null
  const eta = ((FULL - limit.pct) * span) / rise
  const resetIn = resetOf(limit) - now
  return Number.isFinite(resetIn) && eta < resetIn ? eta : null
}

/** Puro: as janelas de uma medição nova, cada uma com o rastro que a anterior trazia. */
export const paced = (prev: Pick<Figures, 'fiveHour' | 'week'>, next: Pick<Figures, 'fiveHour' | 'week'>, now: number): Pick<Figures, 'fiveHour' | 'week'> => ({
  fiveHour: track('fiveHour', prev.fiveHour, next.fiveHour, now),
  week: track('week', prev.week, next.week, now),
})
