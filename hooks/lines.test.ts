import { describe, expect, test } from 'claude-code/testing'

import { agentLine, cardLines, clean, fit, fmtCost, fmtSpan, fmtTokens, lineWidth, prettyModel, reconcileRows, shimmer, shortTool, sortAgents, spin, trail, upsert } from './register'
import { SPINNER } from './register'
import type { Line } from './register'
import type { StatusAgent } from '../types'

const NOW = Date.parse('2026-11-10T12:00:00Z')
const text = (l: Line) => [...l.parts, ...(l.tail ?? [])].map(p => p.text).join('')
const FIGURES = { model: 'claude-fable-5-2', effort: 'high', costUsd: 1.5 }
const MAIN = { startedAt: NOW - 72_000, tools: 14, lastTool: 'Bash', costAtStart: 1.25 }
const agent = (over: Partial<StatusAgent> = {}): StatusAgent => ({
  id: 'a1', type: 'Explore', description: 'buscar rotas HLS', model: null, state: 'running',
  startedAt: NOW - 12_000, seenAt: NOW, tools: 4, lastTool: 'Grep', ...over,
})
const card = (over: Partial<Parameters<typeof cardLines>[0]> = {}) =>
  cardLines({ figures: FIGURES, main: MAIN, agents: [], now: NOW, frame: 0, isWorking: false, ...over })
// Estreita demais para modelo e custo dividirem a linha: empilha.
const stacked = (over: Partial<Parameters<typeof cardLines>[0]> = {}) => card({ max: 40, ...over })
const left = (l: Line | undefined) => (l?.parts ?? []).map(p => p.text).join('')
const right = (l: Line | undefined) => (l?.tail ?? []).map(p => p.text).join('')

describe('formatos', () => {
  test('o custo tem quatro casas e milhares agrupados', () => {
    expect(fmtCost(0.0123)).toBe('$0.0123')
    expect(fmtCost(1234.56789)).toBe('$1,234.5679')
    expect(fmtCost(Number.NaN)).toBe('—')
  })

  test('a duração encurta conforme cresce', () => {
    expect(fmtSpan(12_000)).toBe('12s')
    expect(fmtSpan(62_000)).toBe('1m02s')
    expect(fmtSpan(3_900_000)).toBe('1h05m')
    expect(fmtSpan(-5)).toBe('0s')
  })

  test('tokens, modelo e nome de ferramenta saem legíveis', () => {
    expect(fmtTokens(12_400)).toBe('12.4k tok')
    expect(fmtTokens(950)).toBe('950 tok')
    expect(prettyModel('claude-fable-5-2')).toBe('Fable 5.2')
    expect(prettyModel('claude-opus-5-5[1m]')).toBe('Opus 5.5 (1M)')
    expect(prettyModel('outro-modelo')).toBe('outro-modelo')
    expect(shortTool('mcp__servidor__buscar')).toBe('buscar')
  })

  test('texto do modelo perde controles e é cortado na largura', () => {
    expect(clean('a\u001b[31mb\nc', 40)).toBe('a [31mb c')
    expect(clean(42, 40)).toBe('')
    expect(fit('abcdefghij', 6)).toBe('abcde…')
  })
})

describe('animações', () => {
  test('a faísca do Claude pulsa um quadro por vez e cada agente fica fora de fase', () => {
    expect(SPINNER.slice(0, 6).join('')).toBe('·✢✳✶✻✽')
    expect(spin(0)).toBe('·')
    expect(spin(1)).toBe('✢')
    expect(spin(5)).toBe('✽')
    expect(spin(6)).toBe('✻') // e volta encolhendo
    expect(spin(10)).toBe('·')
    expect(spin(0, 3)).toBe('✶')
  })

  test('o cometa de faíscas atravessa a trilha, sai pela direita e volta do começo', () => {
    const bar = (f: number, w = 6) => trail(f, w).map(p => p.text).join('')
    expect(bar(0)).toBe('✻·····')
    expect(bar(2)).toBe('✳✶✻···')
    expect(bar(5)).toBe('··✢✳✶✻')
    expect(bar(8)).toBe('·····✢')
    expect(bar(9)).toBe('······')
    expect(bar(10)).toBe('✻·····')
    for (const f of [0, 3, 7, 11]) expect(trail(f, 6).length).toBe(6)
    expect(trail(3, 6)[3]?.color).toBe('claude')
  })

  test('o brilho percorre o texto sem mudar o que está escrito', () => {
    for (const f of [0, 3, 6, 9, 12]) expect(shimmer('Explore', f).map(p => p.text).join('')).toBe('Explore')
    expect(shimmer('Explore', 2).find(p => p.color === 'claude')?.text).toBe('p')
    expect(shimmer('Explore', 9).some(p => p.color === 'claude')).toBe(false)
  })
})

describe('linhas do card', () => {
  test('na largura toda, modelo à esquerda e custo à direita na mesma linha, sem contexto', () => {
    const lines = card()
    expect(lines.length).toBe(1)
    expect(left(lines[0])).toBe('✻ Fable 5.2 · high')
    expect(right(lines[0])).toBe('$1.5000 sessão · turno +$0.2500')
    expect(lines.map(text).some(l => /ctx|context/i.test(l))).toBe(false)
  })

  test('estreita demais, modelo e custo empilham', () => {
    const lines = stacked().map(text)
    expect(lines).toEqual(['✻ Fable 5.2 · high', '$1.5000 sessão · turno +$0.2500'])
  })

  test('sem turno ainda não há custo de turno; sem leitura, o custo fica pendente', () => {
    expect(text(card({ max: 12, main: { ...MAIN, costAtStart: null } })[1] as Line)).toBe('$1.5000 sessão')
    expect(text(card({ max: 12, figures: { model: null, effort: null } })[1] as Line)).toBe('custo —')
  })

  test('o custo fica aceso logo depois de crescer e apaga em seguida', () => {
    const fresh = stacked({ figures: { ...FIGURES, costMovedAt: NOW - 500 } })[1] as Line
    expect(text(fresh)).toBe('$1.5000 ▲ sessão · turno +$0.2500')
    expect(fresh.parts[0]?.color).toBe('claude')
    expect(text(stacked({ figures: { ...FIGURES, costMovedAt: NOW - 5_000 } })[1] as Line)).toBe('$1.5000 sessão · turno +$0.2500')
  })

  test('enquanto o turno roda a faísca pulsa e o cometa corre na linha de trabalho', () => {
    const lines = card({ isWorking: true, frame: 1 })
    expect(left(lines[0])).toBe('✢ Fable 5.2 · high')
    expect(text(lines[1] as Line)).toBe('✶✻······ 1m12s · 14 tools · Bash')
  })

  test('os limites só aparecem quando há leitura, ao lado do custo ou empilhados', () => {
    const limited = { figures: { ...FIGURES, fiveHour: { pct: 42 }, week: { pct: 91 } } }
    expect(right(card(limited)[0])).toBe('$1.5000 sessão · turno +$0.2500  ·  5h ▰▰▱▱▱ 42% · 7d ▰▰▰▰▰ 91%')
    expect(stacked().length).toBe(2)
    expect(text(stacked(limited)[2] as Line)).toBe('5h ▰▰▱▱▱ 42% · 7d ▰▰▰▰▰ 91%')
  })

  test('um agente rodando mostra giro, tipo, descrição, tempo e ferramentas', () => {
    const l = agentLine(agent(), NOW, 0, 0, 64)
    expect(text(l)).toBe('· Explore ✻····  buscar rotas HLS12s · 4 tools · Grep')
    expect(lineWidth(l) <= 64).toBe(true)
  })

  test('um agente terminado mostra ✓, duração e tokens; um falho, ✗', () => {
    const done = agentLine(agent({ state: 'done', endedAt: NOW, startedAt: NOW - 62_000, tokens: 12_400 }), NOW + 3_000, 0, 0, 64)
    expect(text(done)).toBe('✓ Explore  buscar rotas HLS1m02s · 12.4k tok')
    expect(text(agentLine(agent({ state: 'failed', endedAt: NOW }), NOW, 0, 0, 64))).toBe('✗ Explore  buscar rotas HLSfalhou · 12s')
    expect(text(agentLine(agent({ state: 'waiting' }), NOW, 0, 0, 64))).toBe('◌ Explore  buscar rotas HLSaguardando')
  })

  test('a descrição cede espaço e a linha nunca passa da largura', () => {
    const long = agent({ description: 'uma descrição comprida demais para caber no card de status inteiro' })
    for (const max of [40, 50, 64]) expect(lineWidth(agentLine(long, NOW, 0, 0, max)) <= max).toBe(true)
    expect(text(agentLine(long, NOW, 0, 0, 34)).includes('uma')).toBe(false)
  })

  test('rodando vem antes de quem acabou, e o excesso vira uma linha de resumo', () => {
    const list = [
      agent({ id: 'd', state: 'done', endedAt: NOW }),
      ...['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map((id, n) => agent({ id, startedAt: NOW - 1000 * (n + 1) })),
    ]
    expect(sortAgents(list).map(a => a.id)).toEqual(['r6', 'r5', 'r4', 'r3', 'r2', 'r1', 'd'])
    const lines = card({ agents: list }).map(text)
    expect(lines.length).toBe(1 + 6 + 1)
    expect(lines[lines.length - 1]).toBe('+1 agente')
  })

  test('nenhuma linha passa da largura da barra, larga ou estreita', () => {
    const list = [agent({ description: 'x'.repeat(200) }), agent({ id: 'a2', state: 'done', endedAt: NOW, tokens: 9 })]
    for (const max of [60, 100, 200]) for (const l of card({ agents: list, isWorking: true, max })) expect(lineWidth(l) <= max).toBe(true)
  })

  test('numa barra larga a descrição do agente usa o espaço que sobra', () => {
    const long = agent({ description: 'uma descrição comprida que cabe inteira numa barra larga' })
    expect(text(agentLine(long, NOW, 0, 0, 120)).includes('cabe inteira numa barra larga')).toBe(true)
  })
})

describe('agentes', () => {
  test('upsert cria a linha na primeira vez e depois só a altera', () => {
    const one = upsert([], 'a1', NOW, a => ({ ...a, type: 'Explore' }))
    expect(one.map(a => [a.id, a.type, a.state, a.startedAt])).toEqual([['a1', 'Explore', 'running', NOW]])
    const two = upsert(one, 'a1', NOW + 5, a => ({ ...a, tools: a.tools + 1 }))
    expect(two.length).toBe(1)
    expect(two[0]?.tools).toBe(1)
    expect(one[0]?.tools).toBe(0) // a lista anterior não é mexida
  })

  test('a conferência termina quem o engine deu como terminado e adota quem roda sem linha', () => {
    const info = (id: string, status: string) => ({ id, status, type: 'planner', description: 'plano' }) as never
    const rows = reconcileRows([agent({ id: 'a1' }), agent({ id: 'a2' })], [info('a1', 'completed'), info('a2', 'failed'), info('a3', 'running'), info('a4', 'completed')], NOW)
    expect(rows.map(a => [a.id, a.state])).toEqual([['a1', 'done'], ['a2', 'failed'], ['a3', 'running']])
    expect(rows[0]?.endedAt).toBe(NOW)
    expect(rows[2]?.type).toBe('planner')
  })

  test('quem terminou há tempo sai; quem sumiu da lista e está mudo há muito é largado', () => {
    const ended = agent({ id: 'old', state: 'done', endedAt: NOW - 9_000 })
    const recent = agent({ id: 'new', state: 'done', endedAt: NOW - 1_000 })
    const lost = agent({ id: 'lost', seenAt: NOW - 700_000 })
    const workflow = agent({ id: 'wf', seenAt: NOW - 5_000 }) // agente de workflow: fora da lista, mas vivo
    expect(reconcileRows([ended, recent, lost, workflow], [], NOW).map(a => a.id)).toEqual(['new', 'wf'])
  })
})
