import { SPINNER } from './effects'

// O poder de quem trabalha: a classe do modelo e o effort do pedido. A classe decide quem o bicho é
// (a faísca do cabeçalho, os olhos, o brilho do corpo, a cor da aura, o que ele sabe fazer); o effort,
// quanta energia ele solta (o tamanho da aura, as fagulhas, os raios).

/** A classe do modelo: 0 Haiku, 1 Sonnet (e o que não se reconhece), 2 Opus, 3 Fable. */
export type Tier = 0 | 1 | 2 | 3
/** O effort como degrau: 0 `low`, 1 `medium`, 2 `high`, 3 `xhigh`, 4 `max`. */
export type Level = 0 | 1 | 2 | 3 | 4
export type Power = { tier: Tier; level: Level }

/** Os níveis de effort, do mais leve ao mais pesado. */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
/** Sem poder nenhum: o bicho de sempre, sem brilho nem aura. */
export const PLAIN: Power = { tier: 0, level: 0 }

const TIER_MAX = 3
const LEVEL_MAX = 4
const NUMERIC_LEVEL = 2 // um effort dado em número (um orçamento de raciocínio) vale como `high`
/** A força máxima de uma aura. */
export const AURA_MAX = 5

// As famílias de modelo e a classe de cada uma. A primeira da lista que casa leva: num id com dois nomes
// de família, vale a classe mais alta.
const FAMILIES: readonly (readonly [name: string, tier: Tier])[] = [
  ['fable', 3],
  ['mythos', 3],
  ['opus', 2],
  ['sonnet', 1],
  ['haiku', 0],
]

const UNKNOWN_TIER: Tier = 1 // um modelo de família desconhecida fica com a faísca de sempre, a de Sonnet

/** A classe de um modelo pelo id ("claude-fable-5-2", "us.anthropic.claude-opus-4-1"): a família no nome. */
export const tierOf = (model: string | null | undefined): Tier => {
  const id = (model ?? '').toLowerCase()
  return FAMILIES.find(([name]) => id.includes(name))?.[1] ?? UNKNOWN_TIER
}

/** O degrau de um effort; um effort ausente ou desconhecido é o mais leve. */
export const levelOf = (effort: string | number | null | undefined): Level => {
  const at = EFFORTS.indexOf(String(effort ?? ''))
  if (at >= 0) return Math.min(at, LEVEL_MAX) as Level
  return typeof effort === 'number' || /^\d+$/.test(String(effort ?? '')) ? NUMERIC_LEVEL : 0
}

export const powerOf = (model: string | null | undefined, effort: string | number | null | undefined): Power => ({
  tier: tierOf(model), level: levelOf(effort),
})

/** O nome de cada classe, pela ordem: nomes próprios, iguais em qualquer idioma. */
export const TIER_NAMES = ['Haiku', 'Sonnet', 'Opus', 'Fable'] as const

/**
 * O poder que um texto pede ("opus max", "fable", "xhigh"): uma família de modelo, um nível de effort,
 * ou os dois. O que o texto não diz fica como em `base`. `null` quando alguma palavra não é nem uma
 * coisa nem outra: um pedido que não se entende não é atendido pela metade.
 */
export const lookOf = (text: string, base: Power): Power | null => {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean)
  // Um modelo é o nome da família sozinho ("opus") ou um id que o traz entre separadores ("claude-opus-5-5"):
  // "opuss" não é nenhum dos dois. Aqui quem escreve é uma pessoa: um erro de digitação não pode passar por modelo.
  const familyOf = (word: string) => FAMILIES.find(([name]) => word.split(/[^a-z]+/).includes(name))
  const isEffort = (word: string) => EFFORTS.includes(word)
  if (!words.every(word => familyOf(word) || isEffort(word))) return null
  const family = words.map(familyOf).find(Boolean)
  const effort = words.find(isEffort)
  return { tier: family ? family[1] : base.tier, level: effort ? levelOf(effort) : base.level }
}

const within = (n: number, max: number) => (Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : 0)

/** Puro: um poder a partir de números quaisquer, dentro dos limites; o que não é número vale zero. */
export const power = (tier: number, level: number): Power => ({ tier: within(tier, TIER_MAX) as Tier, level: within(level, LEVEL_MAX) as Level })

/**
 * A energia do pulso da régua para um effort: o degrau dele. Sem effort lido (antes do primeiro pedido,
 * ou num modelo que não tem effort) não há energia a dizer: `undefined`, e o pulso é o de sempre.
 */
export const energyOf = (effort: string | number | null | undefined): number | undefined =>
  effort === null || effort === undefined || effort === '' ? undefined : levelOf(effort)

/**
 * A força da aura, de 0 (nenhuma) a `AURA_MAX`: cresce com o effort. Fable começa um degrau acima
 * (tem aura até em `low`) e Haiku um abaixo (só a partir de `high`).
 */
export const auraOf = ({ tier, level }: Power): number => Math.max(0, Math.min(AURA_MAX, level + (tier === TIER_MAX ? 1 : tier === 0 ? -1 : 0)))

/** A faísca de uma classe: o glifo parado e os quadros do pulso dela. */
type Spark = { idle: string; frames: readonly string[] }

// Quanto mais forte a classe, maior a faísca: do pontinho de Haiku ao selo de Fable. A de Sonnet é a
// do próprio Claude Code.
const SPARKS: Record<Tier, Spark> = {
  0: { idle: '✢', frames: ['·', '✢', '✣', '✤', '✣', '✢'] },
  1: { idle: '✻', frames: SPINNER },
  2: { idle: '❋', frames: ['✶', '✸', '✹', '✺', '❋', '✺', '✹', '✸'] },
  3: { idle: '❂', frames: ['✧', '✦', '✪', '❂', '❉', '❂', '✪', '✦'] },
}

// A faísca de uma classe; uma classe que não existe fica com a de sempre, em vez de quebrar o desenho.
const sparkOf = (tier: Tier): Spark => SPARKS[tier] ?? SPARKS[UNKNOWN_TIER]

/** O glifo parado da faísca de uma classe. */
export const idleSpark = (tier: Tier): string => sparkOf(tier).idle

/** A faísca de uma classe num quadro; `offset` tira um agente de fase do vizinho. */
export const sparkAt = (tier: Tier, frame: number, offset = 0): string => {
  const { idle, frames } = sparkOf(tier)
  return frames[(((frame + offset) % frames.length) + frames.length) % frames.length] ?? idle
}
