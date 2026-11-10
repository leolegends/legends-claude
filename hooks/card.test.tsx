import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const band = (surface: (typeof SURFACES)[number], isWorking = false, bodyColumns = 120) =>
  ({
    plugin: 'legends-claude', surface, component: 'AbovePrompt',
    props: { hasSurvey: false, isCollapsed: false, isWorking, maxRows: 20, bodyColumns, scroll: { offset: 0, bodyRows: 19 }, view: {} },
  }) as never

type Listed = { id: string; status: string; type: string; description: string }

// O mundo abaixo de uma sessão iniciada: modelo, custo, lista de agentes e os eventos que o engine responderia.
const startSession = async ($: { session: { start: (e: never) => Promise<unknown> } }, on: On, listed: () => Listed[] = () => []) => {
  on('command.register', () => ({ value: { command: 'legends-claude' } }))
  on('session.model', () => ({ value: 'claude-fable-5-2' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [], cost: { usd: 1.5 } } }) as never)
  on('agent.list', () => ({ value: listed() }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }) as never)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true } as never)
}

const SPAWN = { tool_use_id: 't1', prompt: 'p', description: 'buscar rotas HLS', subagentType: 'Explore', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-fable-5-2' } as never

test('o card mostra modelo e custo em toda superfície, sem contexto', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(surface))
    expect(await ui.find({ type: 'Text', text: /Fable 5\.2/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\$1\.5000/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /ctx|context/i })).toBeUndefined()
    await ui.unmount()
  }
})

test('o effort do pedido e o custo medido chegam ao card', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  // o passo do modelo que o engine responderia: registrado antes da primeira chamada em $
  on('turn.step', async function* ($, e) { return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-fable-5-2', effort: 'high', messageCount: 1 })) void _
  expect(await ui.find({ type: 'Text', text: /Fable 5\.2 · high/ })).toBeDefined()
  await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], cost: { usd: 1.75 }, changed: ['cost'] } as never)
  expect(await ui.find({ type: 'Text', text: /\$1\.7500 ▲ sessão · turno \+\$0\.2500/ })).toBeDefined()
  await ui.unmount()
})

test('um agente aparece ao nascer, conta ferramentas e termina com ✓', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal', true))
  expect(await ui.find({ type: 'Text', text: /Explore/ })).toBeUndefined()

  await $.agent.spawn(SPAWN)
  expect(await ui.find({ type: 'Text', text: /Explore/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /buscar rotas HLS/ })).toBeDefined()

  await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'a1' } as never)
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /1 tool · Grep/ })).toBeDefined()

  await clock.advance(12_000)
  expect(await ui.find({ type: 'Text', text: /12s · 1 tool · Grep/ })).toBeDefined()

  await $.turn.complete({ answer: '', durationMs: 12_000, isAborted: false, turnId: 'at1', agentId: 'a1', reason: 'answer', usage: { model: 'claude-haiku-5-5', input_tokens: 10_000, output_tokens: 2_000, cache_read_input_tokens: 400, cache_creation_input_tokens: 0 } } as never)
  expect(await ui.find({ type: 'Text', text: /✓/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /12s · 12\.4k tok/ })).toBeDefined()
  await ui.unmount()
})

test('um agente terminado some do card depois de alguns segundos', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await $.agent.spawn(SPAWN)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'at1', agentId: 'a1', reason: 'answer' } as never)
  expect(await ui.find({ type: 'Text', text: /Explore/ })).toBeDefined()
  await clock.advance(20_000)
  expect(await ui.find({ type: 'Text', text: /Explore/ })).toBeUndefined()
  await ui.unmount()
})

test('um agente interrompido aparece como falho', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await $.agent.spawn(SPAWN)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 'at1', agentId: 'a1', reason: 'aborted' } as never)
  expect(await ui.find({ type: 'Text', text: /✗/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /falhou/ })).toBeDefined()
  await ui.unmount()
})

test('a animação anda enquanto o turno roda e para quando ele acaba', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal', true))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  expect(await ui.find({ type: 'Text', text: /⠋ Fable/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▰▰▱▱▱▱ 0s/ })).toBeDefined()
  await clock.advance(150)
  expect(await ui.find({ type: 'Text', text: /⠙ Fable/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▱▰▰▱▱▱ 0s/ })).toBeDefined()
  await clock.advance(1_050)
  expect(await ui.find({ type: 'Text', text: /1s/ })).toBeDefined()
  await ui.unmount()

  // Fim do turno: a faixa volta a ociosa, o próximo quadro para o relógio e nada mais anda.
  const idle = await $.ui.mount(band('terminal', false))
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await clock.advance(150)
  expect(await idle.find({ type: 'Text', text: /○ Fable/ })).toBeDefined()
  const before = (await idle.find({ type: 'Text', text: /○ Fable/ }))?.text
  await clock.advance(5_000)
  expect((await idle.find({ type: 'Text', text: /○ Fable/ }))?.text).toBe(before)
  await idle.unmount()
})

test('um agente que já rodava quando o mod carregou é adotado da lista do engine', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on, () => [{ id: 'bg1', status: 'running', type: 'code-reviewer', description: 'revisar diff' }])
  const ui = await $.ui.mount(band('terminal'))
  expect(await ui.find({ type: 'Text', text: /code-reviewer/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /revisar diff/ })).toBeDefined()
  await ui.unmount()
})

test('o botão ▾ esconde o card, ◂ status traz de volta, e o comando alterna', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /Fable/ })).toBeUndefined()
  await ui.press({ key: 'show' })
  expect(await ui.find({ type: 'Text', text: /Fable/ })).toBeDefined()
  expect((await $.command.run({ command: 'legends-claude', args: '' } as never) as { text: string }).text).toBe('Card de status escondido.')
  expect(await ui.find({ type: 'Text', text: /Fable/ })).toBeUndefined()
  expect((await $.command.run({ command: 'legends-claude', args: '' } as never) as { text: string }).text).toBe('Card de status visível.')
  await ui.unmount()
})

test('num terminal estreito ou durante uma pesquisa o card não desenha', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const narrow = await $.ui.mount(band('terminal', false, 50))
  expect(await narrow.find({ type: 'Text', text: /Fable/ })).toBeUndefined()
  await narrow.unmount()
})
