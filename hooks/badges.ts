import type { Tally } from './stats'

// As insígnias: marcos do total de sempre (todas as sessões, agentes incluídos), cada uma em três
// graus (bronze, prata, ouro). Puro: quem soma as contas é o livro (ledger.ts).
//
// Nada é gravado sobre elas: uma insígnia está conquistada quando a conta passa da meta. Assim duas
// sessões abertas ao mesmo tempo não brigam por um registro, e uma conta zerada não deixa insígnia
// órfã. O que não dá para saber, por isso, é o dia em que cada uma veio.
//
// O nível já mede os tokens (level.ts): as insígnias ficam com o resto das contas.

/** As contas de onde as insígnias saem: as de sempre e quantas sessões foram. */
export type BadgeFacts = Tally & { sessions: number }

export type BadgeFamily = 'bricks' | 'turns' | 'sessions' | 'longest' | 'burst' | 'crew' | 'grit'

/** O grau: 0 bronze, 1 prata, 2 ouro. */
export type BadgeTier = 0 | 1 | 2

export type Badge = { family: BadgeFamily; tier: BadgeTier; goal: number }

type Family = { id: BadgeFamily; of: (f: BadgeFacts) => number; goals: readonly [number, number, number] }

const MINUTE_MS = 60_000

// A ordem aqui é a ordem em que aparecem no relatório.
const FAMILIES: readonly Family[] = [
  { id: 'bricks', of: f => f.bricks, goals: [100, 1000, 10_000] }, // ferramentas chamadas
  { id: 'turns', of: f => f.turns, goals: [100, 1000, 10_000] },
  { id: 'sessions', of: f => f.sessions, goals: [10, 100, 500] },
  { id: 'longest', of: f => f.longestTurnMs, goals: [10 * MINUTE_MS, 30 * MINUTE_MS, 60 * MINUTE_MS] }, // o turno mais longo
  { id: 'burst', of: f => f.mostTools, goals: [25, 50, 100] }, // ferramentas num turno só
  { id: 'crew', of: f => f.mostHelpers, goals: [3, 5, 10] }, // agentes rodando ao mesmo tempo
  { id: 'grit', of: f => f.fails, goals: [10, 100, 1000] }, // ferramentas que falharam, e a pessoa seguiu
]

const TIERS: readonly BadgeTier[] = [0, 1, 2]

/** Quantas insígnias existem. */
export const BADGE_COUNT = FAMILIES.length * TIERS.length

const valueOf = (family: Family, f: BadgeFacts): number => {
  const v = family.of(f)
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

/** Puro: todas as insígnias conquistadas, na ordem do relatório e do bronze ao ouro. */
export const earnedBadges = (f: BadgeFacts): Badge[] =>
  FAMILIES.flatMap(family => TIERS.filter(tier => valueOf(family, f) >= family.goals[tier]).map(tier => ({ family: family.id, tier, goal: family.goals[tier] })))

/** Puro: o grau mais alto de cada família conquistada, na ordem do relatório. */
export const topBadges = (f: BadgeFacts): Badge[] =>
  FAMILIES.flatMap(family => {
    const won = TIERS.filter(tier => valueOf(family, f) >= family.goals[tier])
    const tier = won[won.length - 1]
    return tier === undefined ? [] : [{ family: family.id, tier, goal: family.goals[tier] }]
  })

/** Puro: as insígnias que `after` tem e `before` não tinha. */
export const newBadges = (before: BadgeFacts, after: BadgeFacts): Badge[] => {
  const had = new Set(earnedBadges(before).map(b => `${b.family}:${b.tier}`))
  return earnedBadges(after).filter(b => !had.has(`${b.family}:${b.tier}`))
}

/** A insígnia mais perto de vir, e quanto do caminho já foi (de 0 a 1). */
export type NextBadge = Badge & { progress: number }

/**
 * Puro: a próxima insígnia, a de cada família que falta com o maior progresso; `null` com todas
 * conquistadas. O progresso conta do grau anterior (ou do zero) até a meta.
 */
export const nextBadge = (f: BadgeFacts): NextBadge | null => {
  const options = FAMILIES.flatMap(family => {
    const v = valueOf(family, f)
    const tier = TIERS.find(t => v < family.goals[t])
    if (tier === undefined) return []
    const from = tier === 0 ? 0 : (family.goals[tier - 1] ?? 0)
    const goal = family.goals[tier]
    return [{ family: family.id, tier, goal, progress: Math.max(0, Math.min(1, (v - from) / (goal - from))) }]
  })
  return options.reduce<NextBadge | null>((best, o) => (best === null || o.progress > best.progress ? o : best), null)
}

/** Os textos das insígnias, num idioma. */
export type BadgeStrings = {
  /** O rótulo da linha no relatório. */
  label: string
  /** O rótulo da linha da próxima insígnia. */
  next: string
  names: Record<BadgeFamily, string>
  tiers: readonly [string, string, string]
  /** "5 de 21" */
  count: (earned: number, total: number) => string
  /** A meta de uma insígnia, já com a unidade: "1.000 ferramentas", "turno de 30 min". */
  goals: Record<BadgeFamily, (goal: number) => string>
  /** O aviso de quando uma insígnia vem. */
  up: (name: string, goal: string) => string
  /** Mais de uma insígnia de uma vez: o aviso fala da primeira e diz quantas mais. */
  more: (count: number) => string
}

/** Puro: o nome de uma insígnia com o grau: "Pedreiro prata". */
export const badgeName = (b: Badge, t: BadgeStrings): string => `${t.names[b.family]} ${t.tiers[b.tier]}`

/** Puro: o aviso de insígnias novas, ou `null` sem nenhuma. A de grau mais alto vai na frente. */
export const badgeToast = (fresh: readonly Badge[], t: BadgeStrings): string | null => {
  const first = [...fresh].sort((a, b) => b.tier - a.tier)[0]
  if (!first) return null
  const base = t.up(badgeName(first, t), t.goals[first.family](first.goal))
  return fresh.length > 1 ? `${base} ${t.more(fresh.length - 1)}` : base
}

/** Puro: as linhas do relatório de estatísticas (rótulo e itens), ou nenhuma sem insígnia e sem próxima. */
export const badgeRows = (f: BadgeFacts, t: BadgeStrings): (readonly [label: string, items: readonly string[]])[] => {
  const top = topBadges(f)
  const next = nextBadge(f)
  return [
    [t.label, [t.count(earnedBadges(f).length, BADGE_COUNT), ...top.map(b => badgeName(b, t))]],
    ...(next ? [[t.next, [badgeName(next, t), t.goals[next.family](next.goal), `${Math.floor(next.progress * 100)}%`]] as const] : []),
  ]
}
