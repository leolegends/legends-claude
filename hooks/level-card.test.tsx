import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { levelOf, tokensFor } from './level'

// O nível na barra montada: os tokens de cada turno (o da conversa e o dos agentes) somam no store,
// a linha mostra o nível, o total das outras sessões conta, e a subida de nível vira um aviso.

const NOW = new Date(2026, 10, 23, 12).getTime()

const band = () =>
  ({
    plugin: 'legends-claude', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 24, bodyColumns: 140, scroll: { offset: 0, bodyRows: 23 }, view: {} },
  }) as never

const startSession = async ($: { session: { start: (e: never) => Promise<unknown> } }, on: On, world: { stored?: Record<string, unknown>; settings?: Record<string, unknown> } = {}) => {
  mock.env(on, { LANG: 'pt_BR.UTF-8' })
  const store: Record<string, unknown> = { settings: { resolution: 'classica', showStage: false, ...world.settings }, ...world.stored }
  const toasts: string[] = []
  on('store.get', ($, e) => ({ value: store[e.key] }) as never)
  on('store.set', ($, e) => ((store[e.key] = e.value), { value: undefined }) as never)
  on('store.delete', ($, e) => (delete store[e.key], { value: undefined }) as never)
  on('store.keys', () => ({ value: Object.keys(store) }))
  on('session.id', () => ({ value: 'esta' }))
  on('session.info', () => ({ value: { transcriptPath: '', platform: 'linux' } }) as never)
  on('ui.toast', ($, e) => ((toasts.push(String((e as never as { text: string }).text)), { value: undefined }) as never))
  on('command.register', () => ({ value: { command: 'legends-claude' } }))
  on('session.model', () => ({ value: 'claude-fable-5-2' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [], cost: { usd: 0 } } }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  on('config.list', () => ({ value: [{ key: 'theme', value: 'dark' }] }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true } as never)
  return { store, toasts }
}

const usage = (output: number, cacheRead = 0) => ({ input_tokens: 0, output_tokens: output, cache_creation_input_tokens: 0, cache_read_input_tokens: cacheRead })
const done = (output: number, agentId?: string, cacheRead = 0) =>
  ({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(output, cacheRead), ...(agentId && { agentId }) }) as never
const other = (tokens: number) =>
  ({ startedAt: NOW - 3_600_000, updatedAt: NOW - 60_000, bricks: 0, fails: 0, turns: 0, longestTurnMs: 0, mostTools: 0, mostHelpers: 0, tokens, lastCost: 0, days: {} })

test('os tokens de cada turno somam no store, e a barra mostra o nível', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store } = await startSession($, on)
  const ui = await $.ui.mount(band())
  expect(await ui.find({ type: 'Text', text: /nível 1 / })).toBeDefined()

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(done(tokensFor(3), undefined, 9_000_000)) // a leitura do cache não conta
  await $.turn.complete(done(1000, 'a1')) // o turno de um agente também conta
  await clock.settle()

  expect(store['stats:esta']).toMatchObject({ tokens: tokensFor(3) + 1000 })
  expect(await ui.find({ type: 'Text', text: /nível 3 / })).toBeDefined()
  await ui.unmount()
})

test('o nível soma as outras sessões e o total de sempre', async ($, on) => {
  mock.clock(on, { now: NOW })
  await startSession($, on, { stored: { 'stats:outra': other(tokensFor(40)), stats: { since: 1, sessions: 3, tokens: tokensFor(10) } } })
  const ui = await $.ui.mount(band())
  const expected = tokensFor(40) + tokensFor(10)
  expect(await ui.find({ type: 'Text', text: new RegExp(`nível ${levelOf(expected).level} `) })).toBeDefined()
  await ui.unmount()
})

test('subir de nível avisa uma vez; com a linha desligada, nem linha nem aviso', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { toasts } = await startSession($, on)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(done(tokensFor(12)))
  await $.turn.complete(done(10)) // não sobe: sem aviso
  await clock.settle()
  expect(toasts).toEqual(['Nível 12! Iniciado'])
})

test('com o interruptor do nível desligado, a linha some e a subida não avisa', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { toasts, store } = await startSession($, on, { settings: { showLevel: false } })
  const ui = await $.ui.mount(band())
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(done(tokensFor(5)))
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /nível/ })).toBeUndefined()
  expect(toasts).toEqual([])
  expect(store['stats:esta']).toMatchObject({ tokens: tokensFor(5) }) // a conta segue: ligar de novo mostra o nível certo
  await ui.unmount()
})
