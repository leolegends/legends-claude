import { describe, expect, test } from 'claude-code/testing'

import { BADGE_COUNT, badgeName, badgeRows, badgeToast, earnedBadges, newBadges, nextBadge, topBadges } from './badges'
import type { BadgeFacts } from './badges'
import { stringsOf } from './i18n'

const PT = stringsOf('pt').badges
const EN = stringsOf('en').badges
const NONE: BadgeFacts = { bricks: 0, fails: 0, turns: 0, longestTurnMs: 0, mostTools: 0, mostHelpers: 0, tokens: 0, sessions: 0 }
const facts = (over: Partial<BadgeFacts> = {}): BadgeFacts => ({ ...NONE, ...over })

describe('as insígnias conquistadas', () => {
  test('sem contas, nenhuma', () => {
    expect(earnedBadges(NONE)).toEqual([])
    expect(topBadges(NONE)).toEqual([])
  })

  test('a meta exata já conta, e um a menos não', () => {
    expect(earnedBadges(facts({ bricks: 100 }))).toEqual([{ family: 'bricks', tier: 0, goal: 100 }])
    expect(earnedBadges(facts({ bricks: 99 }))).toEqual([])
  })

  test('um grau alto traz os de baixo junto, e o topo mostra só o mais alto', () => {
    const f = facts({ bricks: 10_000 })
    expect(earnedBadges(f).map(b => b.tier)).toEqual([0, 1, 2])
    expect(topBadges(f)).toEqual([{ family: 'bricks', tier: 2, goal: 10_000 }])
  })

  test('cada família olha a própria conta', () => {
    const f = facts({ turns: 100, sessions: 10, longestTurnMs: 600_000, mostTools: 25, mostHelpers: 3, fails: 10 })
    expect(topBadges(f).map(b => b.family)).toEqual(['turns', 'sessions', 'longest', 'burst', 'crew', 'grit'])
  })

  test('os tokens não dão insígnia: quem mede os tokens é o nível', () => {
    expect(earnedBadges(facts({ tokens: 2_000_000_000 }))).toEqual([])
  })

  test('com tudo no máximo, são todas', () => {
    const all = facts({ bricks: 1e9, turns: 1e9, sessions: 1e9, longestTurnMs: 1e12, mostTools: 1e9, mostHelpers: 1e9, fails: 1e9 })
    expect(earnedBadges(all)).toHaveLength(BADGE_COUNT)
    expect(BADGE_COUNT).toBe(21)
    expect(nextBadge(all)).toBeNull()
  })

  test('conta estragada vale zero', () => {
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) expect(earnedBadges(facts({ bricks: bad }))).toEqual([])
  })
})

describe('as que vieram agora', () => {
  test('só as que o depois tem e o antes não', () => {
    const fresh = newBadges(facts({ bricks: 950, turns: 100 }), facts({ bricks: 1001, turns: 120 }))
    expect(fresh).toEqual([{ family: 'bricks', tier: 1, goal: 1000 }])
  })

  test('sem mudança, nenhuma', () => {
    const f = facts({ bricks: 5000 })
    expect(newBadges(f, f)).toEqual([])
  })

  test('um salto grande traz vários graus de uma vez', () => {
    expect(newBadges(NONE, facts({ mostHelpers: 10 })).map(b => b.tier)).toEqual([0, 1, 2])
  })
})

describe('a próxima', () => {
  test('é a de maior progresso, contando do grau anterior', () => {
    // tijolos 550: de 100 a 1000, metade; turnos 90 de 100: 90%
    expect(nextBadge(facts({ bricks: 550, turns: 90 }))).toMatchObject({ family: 'turns', tier: 0, goal: 100, progress: 0.9 })
  })

  test('do zero, a primeira família na ordem', () => {
    expect(nextBadge(NONE)).toMatchObject({ family: 'bricks', tier: 0, progress: 0 })
  })
})

describe('os textos', () => {
  test('o nome com o grau, nos dois idiomas', () => {
    expect(badgeName({ family: 'crew', tier: 2, goal: 10 }, PT)).toBe('Maestro ouro')
    expect(badgeName({ family: 'crew', tier: 1, goal: 5 }, EN)).toBe('Conductor silver')
  })

  test('o aviso fala da de grau mais alto e conta as outras', () => {
    expect(badgeToast([], PT)).toBeNull()
    expect(badgeToast([{ family: 'bricks', tier: 1, goal: 1000 }], PT)).toBe('Insígnia nova: Pedreiro prata · 1.000 ferramentas')
    const many = newBadges(NONE, facts({ mostHelpers: 10 }))
    expect(badgeToast(many, EN)).toBe('New badge: Conductor gold · 10 agents at once (+2)')
  })

  test('a meta do turno longo vai em minutos', () => {
    expect(badgeToast([{ family: 'longest', tier: 1, goal: 1_800_000 }], PT)).toBe('Insígnia nova: Fôlego prata · turno de 30 min')
  })

  test('as linhas do relatório: quantas, as mais altas e a próxima', () => {
    expect(badgeRows(facts({ bricks: 1200, fails: 5 }), PT)).toEqual([
      ['insígnias', ['2 de 21', 'Pedreiro prata']],
      ['próxima', ['Persistente bronze', '10 falhas superadas', '50%']],
    ])
    expect(badgeRows(NONE, EN)[0]).toEqual(['badges', ['0 of 21']])
  })
})
