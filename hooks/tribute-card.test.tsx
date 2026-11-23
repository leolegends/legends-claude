import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// A dedicatória de um mascote, de ponta a ponta: com a Elsa escolhida, a linha `mascote` da aba de
// ajustes diz a quem ela é dedicada, no idioma da barra. Com outro mascote, ou com a aba fechada, não.

const band = () =>
  ({ plugin: 'legends-claude', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 19 }, view: {} } }) as never

const PT = /em homenagem à minha filha/
const EN = /in honor of my daughter/

// O mundo abaixo de uma sessão iniciada, com os ajustes dados já salvos e a animação parada.
const startSession = async ($: { session: { start: (e: never) => Promise<unknown> } }, on: On, settings: Record<string, unknown>) => {
  mock.env(on, { LANG: 'pt_BR.UTF-8' })
  const store: Record<string, unknown> = { settings: { motion: 'parada', ...settings } }
  on('store.get', ($, e) => ({ value: store[e.key] }) as never)
  on('store.set', ($, e) => ((store[e.key] = e.value), { value: undefined }) as never)
  on('command.register', () => ({ value: { command: 'legends-claude' } }))
  on('session.model', () => ({ value: 'claude-fable-5-2' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [], cost: { usd: 1.5 } } }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  on('config.list', () => ({ value: [{ key: 'theme', value: 'dark' }] }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true } as never)
  return store
}

test('com a Elsa como mascote, a linha de mascotes da aba de ajustes traz a dedicatória dela', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on, { avatar: 'elsa' })
  const ui = await $.ui.mount(band())
  expect(await ui.find({ type: 'Text', text: PT })).toBeUndefined() // com a aba fechada, nada
  await ui.press({ key: 'settings' })
  expect(await ui.find({ type: 'Text', text: PT })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: EN })).toBeUndefined()
  await ui.unmount()
})

test('com outro mascote não há dedicatória; ao escolher a Elsa ela aparece na hora, e ao trocar de novo, some', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const store = await startSession($, on, { avatar: 'mario' })
  const ui = await $.ui.mount(band())
  await ui.press({ key: 'settings' })
  expect(await ui.find({ type: 'Text', text: PT })).toBeUndefined()
  await ui.press({ key: 'set-avatar-elsa' })
  expect(await ui.find({ type: 'Text', text: PT })).toBeDefined()
  expect((store.settings as { avatar?: string }).avatar).toBe('elsa')
  await ui.press({ key: 'set-avatar-clawd' })
  expect(await ui.find({ type: 'Text', text: PT })).toBeUndefined()
  await ui.unmount()
})

test('em inglês, a dedicatória vem em inglês', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on, { avatar: 'elsa', language: 'en' })
  const ui = await $.ui.mount(band())
  await ui.press({ key: 'settings' })
  expect(await ui.find({ type: 'Text', text: EN })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: PT })).toBeUndefined()
  await ui.unmount()
})
