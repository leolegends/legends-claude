import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// A linha do contexto na barra montada: o botão de compactar pede confirmação, roda o /compact do
// Claude Code, e a barra avisa uma vez quando o contexto cruza a linha da sugestão.

const NOW = new Date(2026, 10, 24, 12).getTime()

const band = () =>
  ({
    plugin: 'legends-claude', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 24, bodyColumns: 140, scroll: { offset: 0, bodyRows: 23 }, view: {} },
  }) as never

type World = { settings?: Record<string, unknown>; refuse?: string }

const startSession = async ($: { session: { start: (e: never) => Promise<unknown> } }, on: On, world: World = {}) => {
  mock.env(on, { LANG: 'pt_BR.UTF-8' })
  const store: Record<string, unknown> = { settings: { resolution: 'classica', showStage: false, ...world.settings } }
  const ran: { command: string; args?: string }[] = []
  const toasts: string[] = []
  on('store.get', ($, e) => ({ value: store[e.key] }) as never)
  on('store.set', ($, e) => ((store[e.key] = e.value), { value: undefined }) as never)
  on('store.keys', () => ({ value: Object.keys(store) }))
  on('session.id', () => ({ value: 'esta' }))
  on('session.info', () => ({ value: { transcriptPath: '', platform: 'macos' } }) as never)
  on('command.register', () => ({ value: { command: 'legends-claude' } }))
  on('command.run', ($, e) => {
    ran.push({ command: e.command, args: e.args })
    if (world.refuse) throw new Error(world.refuse)
    return { text: '' }
  })
  on('ui.toast', ($, e) => ((toasts.push(String((e as never as { text: string }).text)), { value: undefined }) as never))
  on('ui.log', () => ({ value: undefined }) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000, tokens: 40_000, percent: 20 }, rateLimits: [], cost: { usd: 0 } } }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  on('config.list', () => ({ value: [{ key: 'theme', value: 'dark' }] }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true } as never)
  return { ran, toasts }
}

const context = (tokens: number, percent: number) =>
  ({ context: { window: 200_000, tokens, percent }, rateLimits: [], cost: { usd: 0 }, changed: ['context'] }) as never

test('a linha do contexto aparece com o medidor e o botão', async ($, on) => {
  mock.clock(on, { now: NOW })
  await startSession($, on)
  const ui = await $.ui.mount(band())
  expect(await ui.find({ type: 'Text', text: /20% · 40k\/200k/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '⟳ compactar' })).toBeDefined()
  await ui.unmount()
})

test('compactar pede confirmação: um clique arma, o segundo roda o /compact', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { ran } = await startSession($, on)
  const ui = await $.ui.mount(band())
  await ui.press({ key: 'compact' })
  expect(ran).toEqual([])
  expect(await ui.find({ type: 'Text', text: '⟳ confirmar compactação?' })).toBeDefined()
  await ui.press({ key: 'compact' })
  await clock.settle()
  expect(ran).toEqual([{ command: 'compact', args: '' }])
  // depois de compactar, a linha mostra só a janela até a próxima resposta
  expect(await ui.find({ type: 'Text', text: /— \/ 200k/ })).toBeDefined()
  await ui.unmount()
})

test('sem o segundo clique, a confirmação expira e nada é compactado', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { ran } = await startSession($, on)
  const ui = await $.ui.mount(band())
  await ui.press({ key: 'compact' })
  await clock.advance(6_000)
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: '⟳ compactar' })).toBeDefined()
  await ui.press({ key: 'compact' }) // arma de novo, não compacta
  expect(ran).toEqual([])
  await ui.unmount()
})

test('uma recusa do /compact vira um aviso', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { toasts } = await startSession($, on, { refuse: 'nada a compactar' })
  const ui = await $.ui.mount(band())
  await ui.press({ key: 'compact' })
  await ui.press({ key: 'compact' })
  await clock.settle()
  expect(toasts.some(t => t.startsWith('Não deu para compactar:'))).toBe(true)
  expect(await ui.find({ type: 'Text', text: '⟳ compactar' })).toBeDefined()
  await ui.unmount()
})

test('o comando compacta sem confirmação, com as instruções do resumo', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { ran } = await startSession($, on)
  const out = (await $.command.run({ command: 'legends-claude', args: 'compactar mantenha o plano' } as never)) as { text: string; isTextDisplayOnly?: boolean }
  expect(out.isTextDisplayOnly).toBe(true)
  await clock.advance(10)
  await clock.settle()
  expect(ran).toEqual([{ command: 'compact', args: 'mantenha o plano' }])
})

test('ao cruzar a linha da sugestão a barra avisa uma vez', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { toasts } = await startSession($, on)
  await $.session.measure(context(150_000, 75))
  await $.session.measure(context(160_000, 80))
  expect(toasts.filter(t => t.startsWith('O contexto está em'))).toEqual([expect.stringContaining('75%')])
  // depois de compactar (desceu), volta a avisar na próxima subida
  await $.session.measure(context(20_000, 10))
  await $.session.measure(context(142_000, 71))
  expect(toasts.filter(t => t.startsWith('O contexto está em'))).toHaveLength(2)
})

test('com a linha desligada nos ajustes, nada de contexto nem de aviso', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { toasts } = await startSession($, on, { settings: { showContext: false } })
  const ui = await $.ui.mount(band())
  expect(await ui.find({ type: 'Text', text: /contexto/ })).toBeUndefined()
  await $.session.measure(context(150_000, 75))
  expect(toasts).toEqual([])
  await ui.unmount()
})
