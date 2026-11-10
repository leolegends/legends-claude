import { LANGUAGES } from './i18n'
import type { ToggleKey } from './i18n'
import type {
  StatusAccent as Accent,
  StatusLanguage as Language,
  StatusMotion as Motion,
  StatusSettings as Settings,
  StatusSpeed as Speed,
} from '../types'

// As opções da aba de ajustes, só com o que não muda de um idioma para outro: os nomes delas vêm de i18n.ts.

// A cor de destaque: a faísca, o modelo, o cometa, o pulso da régua, o custo aceso.
// `claude` e `text` são cores do tema (seguem claro/escuro); as outras são tons médios que leem bem nos dois.
export const ACCENTS: readonly { id: Accent; color: string }[] = [
  { id: 'claude', color: 'claude' },
  { id: 'azul', color: '#5FA8FF' },
  { id: 'verde', color: '#4EC98B' },
  { id: 'roxo', color: '#A78BFA' },
  { id: 'rosa', color: '#F472B6' },
  { id: 'ciano', color: '#22D3EE' },
  { id: 'ambar', color: '#F5B841' },
  { id: 'mono', color: 'text' },
]

export const MOTIONS: readonly { id: Motion }[] = [
  { id: 'completa' }, // tudo: palco, pulso, nome surgindo, estouro, brilho, faísca, cometa
  { id: 'suave' }, // só a faísca pulsando e o cometa
  { id: 'parada' }, // nada se mexe; o relógio segue contando
]

// Quanto dura um quadro. `parada` ignora: redesenha uma vez por segundo, só pelo tempo decorrido.
export const SPEEDS: readonly { id: Speed; frameMs: number }[] = [
  { id: 'lenta', frameMs: 200 },
  { id: 'normal', frameMs: 125 },
  { id: 'rapida', frameMs: 80 },
]
const STILL_FRAME_MS = 1_000

export const AGENT_LIMITS = [3, 6, 10] as const

// O idioma do padrão é o português, em que a barra nasceu. Numa instalação nova quem decide é o idioma
// do sistema (veja `sanitize` e quem a chama); "restaurar padrão" não mexe no idioma.
export const DEFAULT_SETTINGS: Settings = {
  language: 'pt', accent: 'claude', motion: 'completa', speed: 'normal',
  showRule: true, showStage: true, showLimits: true, showTurnCost: true, maxAgents: 6,
}

/** Os interruptores da linha "mostrar", na ordem em que aparecem. */
export const TOGGLES: readonly ToggleKey[] = ['showRule', 'showStage', 'showLimits', 'showTurnCost']

const oneOf = <T extends string | number>(ids: readonly T[], v: unknown, fallback: T): T =>
  ids.includes(v as T) ? (v as T) : fallback
const idsOf = <T extends string>(list: readonly { id: T }[]): T[] => list.map(x => x.id)
const flag = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

// O que vem do store é de outra versão, editado à mão ou corrompido: cada campo é conferido sozinho,
// e um campo inválido volta ao padrão sem derrubar os outros. O idioma tem um padrão à parte, `language`:
// o que vale quando nenhum idioma válido foi salvo.
export const sanitize = (raw: unknown, language: Language = DEFAULT_SETTINGS.language): Settings => {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const d = DEFAULT_SETTINGS
  return {
    language: oneOf(idsOf(LANGUAGES), r.language, language),
    accent: oneOf(idsOf(ACCENTS), r.accent, d.accent),
    motion: oneOf(idsOf(MOTIONS), r.motion, d.motion),
    speed: oneOf(idsOf(SPEEDS), r.speed, d.speed),
    showRule: flag(r.showRule, d.showRule),
    showStage: flag(r.showStage, d.showStage),
    showLimits: flag(r.showLimits, d.showLimits),
    showTurnCost: flag(r.showTurnCost, d.showTurnCost),
    maxAgents: oneOf(AGENT_LIMITS, r.maxAgents, d.maxAgents),
  }
}

export const accentColor = (s: Settings) => ACCENTS.find(a => a.id === s.accent)?.color ?? 'claude'

/** O que as animações leem dos ajustes: a duração do quadro e quanto se mexe. */
export type Effects = { frameMs: number; isFull: boolean; isStill: boolean; hasStage: boolean }

export const effectsOf = (s: Settings): Effects => ({
  frameMs: s.motion === 'parada' ? STILL_FRAME_MS : (SPEEDS.find(x => x.id === s.speed)?.frameMs ?? 125),
  isFull: s.motion === 'completa',
  isStill: s.motion === 'parada',
  hasStage: s.showStage && s.motion === 'completa', // o palco é a animação mais viva: só na completa
})

export const FULL_EFFECTS: Effects = effectsOf(DEFAULT_SETTINGS)
