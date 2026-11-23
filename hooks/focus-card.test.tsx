import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { landingKey } from './focus'
import type { Standing } from './focus'

// O anel de foco da faixa, na barra montada. Quem navega pelo teclado (ctrl+x tab, Tab ou as setas,
// Enter) tem o anel num botão; a barra pede ao engine que ele acompanhe o que abre e fecha. Qual botão
// é pedido está em focus.test.ts; aqui se confere que esse botão existe na tela em cada situação, e
// que a barra segue igual quando o pedido não é atendido. O kit de testes não entrega a um teste o
// `$.ui.focus` que um plugin faz (responde "no implementation"): o anel andando de fato foi conferido
// num Claude Code de verdade.

const band = () =>
  ({
    plugin: 'legends-claude', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 19 }, view: {} },
  }) as never

const startSession = async ($: { session: { start: (e: never) => Promise<unknown> } }, on: On, settings: Record<string, unknown> = {}) => {
  mock.env(on, { LANG: 'pt_BR.UTF-8' })
  const store: Record<string, unknown> = { settings: { resolution: 'classica', ...settings } }
  const said: string[] = []
  on('ui.toast', ($, e) => (said.push(JSON.stringify(e)), { value: undefined }) as never)
  on('ui.log', ($, e) => (said.push(JSON.stringify(e)), { value: undefined }) as never)
  on('command.run', { command: 'effort' }, () => ({ text: 'ok' }))
  on('turn.step', async function* ($, e) { return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never })
  on('store.get', ($, e) => ({ value: store[e.key] }) as never)
  on('store.set', ($, e) => ((store[e.key] = e.value), { value: undefined }) as never)
  on('store.keys', () => ({ value: Object.keys(store) }))
  // o que a barra pergunta da sessão ao começar: o id (de onde saem as contas dela) e o sistema (se há como tocar som)
  on('session.id', () => ({ value: 'sessao-1' }))
  on('session.info', () => ({ value: { transcriptPath: '', platform: 'macos' } }) as never)
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
  return { said }
}

// O que está em vigor numa sessão de teste: Fable, sem effort lido, em português.
const STANDING: Standing = { models: ['fable', 'opus', 'sonnet', 'haiku'], model: 'fable 5.2', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], effort: null, language: 'pt' }

test('o botão em que o anel cai existe em cada coisa que abre, e é a opção em vigor', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band())
  const text = async (key: string) => (await ui.find({ type: 'Button', key }))?.text

  await ui.press({ key: 'model' })
  expect(await text(landingKey('model', STANDING))).toBe('● Fable')
  await ui.press({ key: 'pick-close' })

  await ui.press({ key: 'effort' })
  expect(await text(landingKey('effort', STANDING))).toBe('low') // sem effort lido não há opção marcada: a primeira
  await ui.press({ key: 'pick-close' })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-fable-5-2', effort: 'high', messageCount: 1 })) void _
  await ui.press({ key: 'effort' })
  expect(await text(landingKey('effort', { ...STANDING, effort: 'high' }))).toBe('● high')
  await ui.press({ key: 'pick-close' })

  await ui.press({ key: 'settings' })
  expect(await text(landingKey('settings', STANDING))).toBe('● Português')
  await ui.unmount()
})

test('em inglês, a aba de ajustes abre com o anel no idioma em vigor', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on, { language: 'en' })
  const ui = await $.ui.mount(band())
  await ui.press({ key: 'settings' })
  expect((await ui.find({ type: 'Button', key: landingKey('settings', { ...STANDING, language: 'en' }) }))?.text).toBe('● English')
  await ui.unmount()
})

test('os botões para onde o anel volta existem quando ele volta', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band())
  const has = async (key: string) => (await ui.find({ type: 'Button', key })) !== undefined
  // fechado um seletor ou a aba: o botão que os abriu
  for (const opener of ['model', 'effort', 'settings'] as const) {
    await ui.press({ key: opener })
    await ui.press({ key: opener === 'settings' ? 'set-close' : 'pick-close' })
    expect(await has(opener)).toBe(true)
  }
  // escondida a barra: o botão que a traz de volta; mostrada de novo: o que a esconde
  await ui.press({ key: 'hide' })
  expect([await has('show'), await has('hide')]).toEqual([true, false])
  await ui.press({ key: 'show' })
  expect([await has('show'), await has('hide')]).toEqual([false, true])
  await ui.unmount()
})

test('sem resposta ao pedido de mover o anel, a barra funciona igual e avisa uma vez só', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const { said } = await startSession($, on)
  const ui = await $.ui.mount(band())
  await ui.press({ key: 'model' })
  expect(await ui.find({ type: 'Button', key: 'pick-opus' })).toBeDefined() // o seletor abriu do mesmo jeito
  await ui.press({ key: 'pick-close' })
  expect(await ui.find({ type: 'Button', key: 'pick-opus' })).toBeUndefined()
  await ui.press({ key: 'effort' })
  await ui.press({ key: 'pick-max' })
  expect(await ui.find({ type: 'Text', text: /^max$/ })).toBeDefined() // a escolha valeu
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'set-close' })
  await ui.press({ key: 'hide' })
  await ui.press({ key: 'show' })
  // um erro de fundo aparece uma vez por origem, nunca vira enxurrada
  expect(said.filter(line => /legends-claude: focus: /.test(line)).length).toBeLessThanOrEqual(1)
  expect(said.filter(line => !/legends-claude: focus: /.test(line))).toEqual([])
  await ui.unmount()
})
