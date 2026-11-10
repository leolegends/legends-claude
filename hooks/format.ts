// Formatos de texto da barra: larguras, cortes, custo, durações, nomes de modelo e de ferramenta.

const COST_DECIMALS = 2 // $1.75, como um preço
const TOOL_MAX = 14
export const PENDING = '—'

// Colunas de terminal que um texto ocupa: caracteres largos (CJK, emoji) ocupam duas.
export const cols = (s: string) => {
  let n = 0
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    const isWide =
      (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1faff) || (c >= 0x20000 && c <= 0x3fffd)
    n += isWide ? 2 : 1
  }
  return n
}

// Corta o texto em `max` colunas, com reticências no fim.
export const fit = (s: string, max: number) => {
  if (cols(s) <= max) return s
  const out: string[] = []
  let n = 1 // as reticências
  for (const ch of s) {
    if (n + cols(ch) > max) break
    n += cols(ch)
    out.push(ch)
  }
  return `${out.join('')}…`
}

// Texto que vem do modelo (descrição de agente, nome de ferramenta): sem controles, escapes ou marcas bidi.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g
export const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? [...v.replace(UNSAFE, ' ')].slice(0, max).join('').replace(/\s+/g, ' ').trim() : ''

// O custo com duas casas e milhares agrupados: $1,234.57.
export const fmtCost = (usd: number) => {
  if (!Number.isFinite(usd)) return PENDING
  const [int = '0', frac = ''] = Math.abs(usd).toFixed(COST_DECIMALS).split('.')
  return `${usd < 0 ? '-' : ''}$${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`
}

// Duração: 12s, 1m02s, 1h05m.
export const fmtSpan = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000)), m = Math.floor(s / 60), h = Math.floor(m / 60)
  if (s < 60) return `${s}s`
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`
  return `${h}h${String(m % 60).padStart(2, '0')}m`
}

export const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M tok` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k tok` : `${n} tok`

export const fmtEta = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return ''
  const s = Math.floor((Date.parse(resetsAt) - now) / 1000)
  if (!(s > 0)) return ''
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d${h}h` : `${h}h${m}m`
}

// "claude-fable-5-2[1m]" -> "Fable 5.2 (1M)", "claude-opus-4-20250514" -> "Opus 4"; o resto como veio.
export const prettyModel = (id: string) => {
  const m = /^claude-([a-z]+)-(\d{1,2})(?:-(\d{1,2}))?(?:-\d{8})?(\[1m\])?$/.exec(id)
  if (!m || !m[1]) return id
  return `${m[1][0]?.toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}${m[4] ? ' (1M)' : ''}`
}

// "mcp__servidor__ferramenta" -> "ferramenta"; os outros nomes como vieram.
export const shortTool = (tool: string) => fit(clean(tool.split('__').pop() ?? tool, 80), TOOL_MAX)
