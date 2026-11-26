import type { Line, Part } from './parts'

// O nível da pessoa, de 1 a 100, pelo total de tokens que ela já gastou com a barra acompanhando
// (todas as sessões, agentes incluídos). Puro: quem soma os tokens é o livro de contas (ledger.ts).
//
// O que conta: entrada sem cache, saída e escrita no cache. A leitura do cache fica de fora: é a mesma
// conversa relida a cada pedido, e contá-la faria o nível medir o tamanho do contexto, não o trabalho.
//
// A curva: o nível L pede MAX_TOKENS × ((L−1)/99)^CURVE tokens. Com CURVE 2,5 os primeiros níveis vêm
// rápido (o 2 com ~20 mil tokens, o 10 com ~5 milhões) e o 100 pede 2 bilhões: mais de um ano de uso pesado.

export const MAX_LEVEL = 100
/** Os tokens do nível 100. */
export const MAX_TOKENS = 2_000_000_000
const CURVE = 2.5
const GAUGE = 10 // as células do medidor
/** Níveis por título: dez títulos, um a cada dez níveis. */
export const LEVELS_PER_TITLE = 10

/** As contagens de um pedido ou de um turno, como o engine as dá. */
export type TokenCounts = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens?: number
}

const safe = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

/** Puro: os tokens que contam para o nível num turno. A leitura do cache não conta. */
export const xpOf = (u: TokenCounts | undefined): number =>
  u ? safe(u.input_tokens) + safe(u.output_tokens) + safe(u.cache_creation_input_tokens) : 0

/** Puro: quantos tokens o nível pede (o 1 pede zero). */
export const tokensFor = (level: number): number => {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))
  return Math.round(MAX_TOKENS * ((l - 1) / (MAX_LEVEL - 1)) ** CURVE)
}

/** Onde a pessoa está: o nível, o título (0 a 9), e o caminho até o próximo. */
export type Level = {
  level: number
  /** O índice do título, de 0 (níveis 1–10) a 9 (91–100). */
  title: number
  tokens: number
  /** Tokens do nível atual e do próximo; no 100, os dois são os do 100. */
  floor: number
  next: number
  /** Quanto do caminho até o próximo nível, de 0 a 1; 1 no 100. */
  progress: number
  isMax: boolean
}

/** Puro: o nível de um total de tokens. */
export const levelOf = (total: number): Level => {
  const tokens = safe(total)
  // a inversa da curva dá o nível direto; o laço só acerta o arredondamento na borda
  let level = Math.min(MAX_LEVEL, Math.max(1, Math.floor(1 + (MAX_LEVEL - 1) * (tokens / MAX_TOKENS) ** (1 / CURVE))))
  while (level < MAX_LEVEL && tokens >= tokensFor(level + 1)) level += 1
  while (level > 1 && tokens < tokensFor(level)) level -= 1
  const isMax = level === MAX_LEVEL
  const floor = tokensFor(level)
  const next = isMax ? floor : tokensFor(level + 1)
  return {
    level, title: Math.floor((level - 1) / LEVELS_PER_TITLE), tokens, floor, next, isMax,
    progress: isMax ? 1 : Math.max(0, Math.min(1, (tokens - floor) / (next - floor))),
  }
}

/** Puro: o nível subiu entre os dois totais; devolve o novo, ou `null`. */
export const levelUp = (before: number, after: number): Level | null => {
  const now = levelOf(after)
  return now.level > levelOf(before).level ? now : null
}

/** Os textos da linha do nível, num idioma. */
export type LevelStrings = {
  level: string
  titles: readonly string[]
  max: string
  /** "faltam 1,2M" */
  toNext: (tokens: string) => string
}

// "12,3M", "850k", "940": curto, para caber na linha.
export const fmtTokens = (n: number, decimal = ','): string => {
  const short = (v: number, unit: string) => `${(+v.toFixed(v < 10 ? 1 : 0)).toString().replace('.', decimal)}${unit}`
  if (n >= 1_000_000_000) return short(n / 1_000_000_000, 'B')
  if (n >= 1_000_000) return short(n / 1_000_000, 'M')
  if (n >= 1000) return short(n / 1000, 'k')
  return String(Math.round(n))
}

// A cor do título sobe com ele: o comum na cor de destaque, os altos em âmbar, o 100 em vermelho-lenda.
const colorOf = (lv: Level) => (lv.isMax ? 'error' : lv.title >= 7 ? 'warning' : 'claude')

/**
 * Puro: "nível 23 ▰▰▰▰▱▱▱▱▱▱ 41%            Construtor · 12,3M · faltam 1,2M". No 100, o medidor
 * cheio e "MAX". `decimal` é o separador do idioma.
 */
export const levelLine = (total: number, t: LevelStrings, decimal = ','): Line => {
  const lv = levelOf(total)
  const color = colorOf(lv)
  const on = Math.min(GAUGE, Math.floor(lv.progress * GAUGE))
  const title = t.titles[lv.title] ?? ''
  const gauge: Part[] = [
    ...(on > 0 ? [{ text: '▰'.repeat(on), color }] : []),
    ...(on < GAUGE ? [{ text: '▱'.repeat(GAUGE - on), color: 'subtle' }] : []),
  ]
  return {
    parts: [
      { text: t.level, dim: true },
      { text: String(lv.level), color, bold: true },
      { text: ' ' },
      ...gauge,
      { text: lv.isMax ? ` ${t.max}` : ` ${Math.floor(lv.progress * 100)}%`, bold: true, ...(color !== 'claude' && { color }) },
    ],
    tail: [
      { text: title, color, bold: lv.title >= 7 },
      { text: ` · ${fmtTokens(lv.tokens, decimal)}`, dim: true },
      ...(lv.isMax ? [] : [{ text: ` · ${t.toNext(fmtTokens(lv.next - lv.tokens, decimal))}`, dim: true }]),
    ],
  }
}
