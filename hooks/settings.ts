import type { StatusAccent as Accent, StatusMotion as Motion, StatusSettings as Settings, StatusSpeed as Speed } from '../types'

// A cor de destaque: a faísca, o modelo, o cometa, o pulso da régua, o custo aceso.
// `claude` e `text` são cores do tema (seguem claro/escuro); as outras são tons médios que leem bem nos dois.
export const ACCENTS: readonly { id: Accent; label: string; color: string }[] = [
  { id: 'claude', label: 'Claude', color: 'claude' },
  { id: 'azul', label: 'Azul', color: '#5FA8FF' },
  { id: 'verde', label: 'Verde', color: '#4EC98B' },
  { id: 'roxo', label: 'Roxo', color: '#A78BFA' },
  { id: 'rosa', label: 'Rosa', color: '#F472B6' },
  { id: 'ciano', label: 'Ciano', color: '#22D3EE' },
  { id: 'ambar', label: 'Âmbar', color: '#F5B841' },
  { id: 'mono', label: 'Mono', color: 'text' },
]

export const MOTIONS: readonly { id: Motion; label: string }[] = [
  { id: 'completa', label: 'completa' }, // tudo: pulso, nome surgindo, estouro, brilho, faísca, cometa
  { id: 'suave', label: 'suave' }, // só a faísca pulsando e o cometa
  { id: 'parada', label: 'parada' }, // nada se mexe; o relógio segue contando
]

// Quanto dura um quadro. `parada` ignora: redesenha uma vez por segundo, só pelo tempo decorrido.
export const SPEEDS: readonly { id: Speed; label: string; frameMs: number }[] = [
  { id: 'lenta', label: 'lenta', frameMs: 240 },
  { id: 'normal', label: 'normal', frameMs: 150 },
  { id: 'rapida', label: 'rápida', frameMs: 90 },
]
const STILL_FRAME_MS = 1_000

export const AGENT_LIMITS = [3, 6, 10] as const

export const DEFAULT_SETTINGS: Settings = {
  accent: 'claude', motion: 'completa', speed: 'normal',
  showRule: true, showLimits: true, showTurnCost: true, maxAgents: 6,
}

/** Os interruptores da linha "mostrar", na ordem em que aparecem. */
export const TOGGLES = [
  { key: 'showRule', label: 'régua' },
  { key: 'showLimits', label: 'limites' },
  { key: 'showTurnCost', label: 'custo do turno' },
] as const

const oneOf = <T extends string | number>(ids: readonly T[], v: unknown, fallback: T): T =>
  ids.includes(v as T) ? (v as T) : fallback
const idsOf = <T extends string>(list: readonly { id: T }[]): T[] => list.map(x => x.id)
const flag = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

// O que vem do store é de outra versão, editado à mão ou corrompido: cada campo é conferido sozinho,
// e um campo inválido volta ao padrão sem derrubar os outros.
export const sanitize = (raw: unknown): Settings => {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const d = DEFAULT_SETTINGS
  return {
    accent: oneOf(idsOf(ACCENTS), r.accent, d.accent),
    motion: oneOf(idsOf(MOTIONS), r.motion, d.motion),
    speed: oneOf(idsOf(SPEEDS), r.speed, d.speed),
    showRule: flag(r.showRule, d.showRule),
    showLimits: flag(r.showLimits, d.showLimits),
    showTurnCost: flag(r.showTurnCost, d.showTurnCost),
    maxAgents: oneOf(AGENT_LIMITS, r.maxAgents, d.maxAgents),
  }
}

export const accentColor = (s: Settings) => ACCENTS.find(a => a.id === s.accent)?.color ?? 'claude'

/** O que as animações leem dos ajustes: a duração do quadro e quanto se mexe. */
export type Effects = { frameMs: number; isFull: boolean; isStill: boolean }

export const effectsOf = (s: Settings): Effects => ({
  frameMs: s.motion === 'parada' ? STILL_FRAME_MS : (SPEEDS.find(x => x.id === s.speed)?.frameMs ?? 150),
  isFull: s.motion === 'completa',
  isStill: s.motion === 'parada',
})

export const FULL_EFFECTS: Effects = effectsOf(DEFAULT_SETTINGS)
