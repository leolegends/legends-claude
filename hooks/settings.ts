import { LANGUAGES } from './i18n'
import type { ToggleKey } from './i18n'
import { hashOf } from './palette'
import type { Tier } from './power'
import type {
  StatusAccent as Accent,
  StatusAvatar as Avatar,
  StatusLanguage as Language,
  StatusMascot as Mascot,
  StatusMotion as Motion,
  StatusResolution as Resolution,
  StatusSettings as Settings,
  StatusSize as Size,
  StatusSound as Sound,
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

// Em que o palco é desenhado: o melhor que a tela der, blocos de terminal, ou o texto de sempre.
export const RESOLUTIONS: readonly { id: Resolution }[] = [{ id: 'auto' }, { id: 'blocos' }, { id: 'classica' }]

// O tamanho do palco: o de sempre, ou o dobro (o mundo fica com a metade da largura da barra).
export const SIZES: readonly { id: Size }[] = [{ id: 'normal' }, { id: 'grande' }]

// Quem é o mascote no palco. Os nomes são nomes próprios: iguais em qualquer idioma.
export const AVATARS: readonly { id: Avatar; label: string }[] = [
  { id: 'clawd', label: 'Clawd' },
  { id: 'pikachu', label: 'Pikachu' },
  { id: 'mario', label: 'Mario' },
  { id: 'kratos', label: 'Kratos' },
  { id: 'elsa', label: 'Elsa' },
]

// As opções de mascote em que quem escolhe o avatar é a barra: o da classe do modelo, ou o da sessão.
// Os nomes delas mudam com o idioma: vêm de i18n.ts.
export const AUTO_MASCOTS: readonly { id: Exclude<Mascot, Avatar> }[] = [{ id: 'modelo' }, { id: 'sessao' }]
const MASCOT_IDS: readonly Mascot[] = [...AVATARS.map(a => a.id), ...AUTO_MASCOTS.map(a => a.id)]

// O avatar de cada classe de modelo, do mais leve ao mais forte: o Pikachu, pequeno e rápido, é o de
// Haiku; o Mario, que faz de tudo, o de Sonnet; o Kratos, o de Opus; e a Elsa, que veio de um conto de
// fadas, o de Fable.
const TIER_AVATAR: Record<Tier, Avatar> = { 0: 'pikachu', 1: 'mario', 2: 'kratos', 3: 'elsa' }
// Os avatares que uma sessão pode tirar: os coloridos. O Clawd é o de quem não escolheu nenhum.
const SESSION_AVATARS = AVATARS.filter(a => a.id !== 'clawd').map(a => a.id)

/**
 * Puro: o avatar que vai para o palco. Um avatar fixo é ele mesmo; `modelo` é o da classe do modelo
 * (`tier`); `sessao` sai do id da sessão (`seed`): o mesmo a sessão inteira, sem sorteio.
 */
export const mascotOf = (choice: Mascot, tier: Tier, seed: string): Avatar =>
  choice === 'modelo' ? (TIER_AVATAR[tier] ?? 'clawd')
  : choice === 'sessao' ? (SESSION_AVATARS[hashOf(seed) % SESSION_AVATARS.length] ?? 'clawd')
  : choice

// O som da barra: nenhum (o padrão), baixo ou alto.
export const SOUNDS: readonly { id: Sound }[] = [{ id: 'mudo' }, { id: 'baixo' }, { id: 'alto' }]

export const AGENT_LIMITS = [3, 6, 10] as const

// O idioma do padrão é o português, em que a barra nasceu. Numa instalação nova quem decide é o idioma
// do sistema (veja `sanitize` e quem a chama); "restaurar padrão" não mexe no idioma.
export const DEFAULT_SETTINGS: Settings = {
  language: 'pt', accent: 'claude', motion: 'completa', speed: 'normal',
  showRule: true, showStage: true, resolution: 'auto', size: 'normal', avatar: 'clawd', sound: 'mudo',
  showLimits: true, showTurnCost: true, showDayCost: true, showContext: true, showLevel: true, maxAgents: 6,
}

/** Os interruptores da linha "mostrar", na ordem em que aparecem. */
export const TOGGLES: readonly ToggleKey[] = ['showRule', 'showStage', 'showContext', 'showLevel', 'showLimits', 'showTurnCost', 'showDayCost']

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
    resolution: oneOf(idsOf(RESOLUTIONS), r.resolution, d.resolution),
    size: oneOf(idsOf(SIZES), r.size, d.size),
    avatar: oneOf(MASCOT_IDS, r.avatar, d.avatar),
    sound: oneOf(idsOf(SOUNDS), r.sound, d.sound),
    showLimits: flag(r.showLimits, d.showLimits),
    showTurnCost: flag(r.showTurnCost, d.showTurnCost),
    showDayCost: flag(r.showDayCost, d.showDayCost),
    showContext: flag(r.showContext, d.showContext),
    showLevel: flag(r.showLevel, d.showLevel),
    maxAgents: oneOf(AGENT_LIMITS, r.maxAgents, d.maxAgents),
  }
}

export const accentColor = (s: Settings) => ACCENTS.find(a => a.id === s.accent)?.color ?? 'claude'

/** O que as animações leem dos ajustes: a duração do quadro e quanto se mexe. */
export type Effects = {
  frameMs: number
  isFull: boolean
  isStill: boolean
  hasStage: boolean
  /** O palco no tamanho dobrado: só fora do palco de texto, que tem um tamanho só. */
  isLarge: boolean
}

export const effectsOf = (s: Settings): Effects => ({
  frameMs: s.motion === 'parada' ? STILL_FRAME_MS : (SPEEDS.find(x => x.id === s.speed)?.frameMs ?? 125),
  isFull: s.motion === 'completa',
  isStill: s.motion === 'parada',
  hasStage: s.showStage && s.motion === 'completa', // o palco é a animação mais viva: só na completa
  isLarge: s.size === 'grande' && s.resolution !== 'classica',
})

export const FULL_EFFECTS: Effects = effectsOf(DEFAULT_SETTINGS)
