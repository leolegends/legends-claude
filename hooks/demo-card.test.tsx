import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Quando a demonstração pode começar, de ponta a ponta. O Claude Code (visto na versão 2.1.327) dá a
// faixa como "trabalhando" enquanto um comando roda, o próprio `/legends-claude demo` incluído: pedida
// pelo comando, só um turno de verdade a impede. Pedida pelo botão da aba de ajustes, sem comando em
// curso, uma faixa que diz "trabalhando" é um turno que a barra não viu começar, e ela espera.

const band = (isWorking: boolean) =>
  ({
    plugin: 'legends-claude', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isCollapsed: false, isWorking, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 19 }, view: {} },
  }) as never

const startSession = async ($: { session: { start: (e: never) => Promise<unknown> } }, on: On) => {
  mock.env(on, { LANG: 'pt_BR.UTF-8' })
  const store: Record<string, unknown> = { settings: { resolution: 'classica' } }
  const toasts: string[] = []
  on('ui.toast', ($, e) => (toasts.push(JSON.stringify(e)), { value: undefined }) as never)
  on('store.get', ($, e) => ({ value: store[e.key] }) as never)
  on('store.set', ($, e) => ((store[e.key] = e.value), { value: undefined }) as never)
  on('command.register', () => ({ value: { command: 'legends-claude' } }))
  on('session.model', () => ({ value: 'claude-fable-5-2' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [], cost: { usd: 1.5 } } }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  on('config.list', () => ({ value: [{ key: 'theme', value: 'dark' }] }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: {} }) as never)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true } as never)
  return { toasts }
}

const DEMO = { command: 'legends-claude', args: 'demo' } as never
const said = async (running: Promise<unknown>) => ((await running) as { text: string }).text

test('o comando da demonstração começa mesmo com a faixa dizendo "trabalhando": é o próprio comando rodando', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band(true)) // a faixa como o engine a desenha enquanto um comando roda
  expect(await said($.command.run(DEMO))).toBe('Demonstração do palco em cena.')
  await clock.advance(3_000)
  expect(await ui.find({ type: 'Text', text: /▶ demonstração/ })).toBeDefined()
  await ui.unmount()
})

test('com um turno de verdade em curso, o comando da demonstração espera', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band(true))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  expect(await said($.command.run(DEMO))).toMatch(/sessão parada/)
  expect(await ui.find({ type: 'Text', text: /▶ demonstração/ })).toBeUndefined()
  await ui.unmount()
})

test('pelo botão dos ajustes, uma faixa que diz "trabalhando" sem turno visto é um turno em curso: a demonstração espera e avisa', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const { toasts } = await startSession($, on)
  const ui = await $.ui.mount(band(true)) // o mod carregou no meio de um turno: não viu o começo dele
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'set-demo' })
  await clock.advance(1_000)
  expect(toasts.some(t => /sessão parada/.test(t))).toBe(true)
  expect(await ui.find({ type: 'Text', text: /▶ demonstração/ })).toBeUndefined()
  await ui.unmount()
})
