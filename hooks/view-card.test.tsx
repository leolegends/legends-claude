import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// A transcrição de um agente, de ponta a ponta: um clique na linha dele na barra pede ao engine que a
// ponha na vista principal (como a troca pela lista de tarefas), e com ela na tela a barra diz de quem
// é e oferece a volta à conversa principal.

type View = { agentId?: string }
const propsOf = (view: View = {}, isWorking = true, bodyColumns = 120) =>
  ({ hasSurvey: false, isCollapsed: false, isWorking, maxRows: 20, bodyColumns, scroll: { offset: 0, bodyRows: 19 }, view }) as never
const band = (view: View = {}, surface: 'terminal' | 'desktop' = 'terminal', bodyColumns = 120) =>
  ({ plugin: 'legends-claude', surface, component: 'AbovePrompt', props: propsOf(view, true, bodyColumns) }) as never

const SPAWN = { tool_use_id: 't1', prompt: 'p', description: 'buscar rotas HLS', subagentType: 'Explore', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-fable-5-2' } as never

// O mundo abaixo de uma sessão iniciada, com o palco de texto e a animação parada (o nome do agente
// num trecho só). `answer` é o que o engine responde a um pedido de troca de vista: aceita, se não disser.
const startSession = async (
  $: { session: { start: (e: never) => Promise<unknown> } }, on: On,
  settings: Record<string, unknown> = {}, answer: (view: View) => { deny?: string } = () => ({}),
) => {
  mock.env(on, { LANG: 'pt_BR.UTF-8' })
  const store: Record<string, unknown> = { settings: { resolution: 'classica', motion: 'parada', ...settings } }
  const views: View[] = []
  const toasts: string[] = []
  on('ui.view', ($, e) => {
    const view = e as unknown as View
    views.push(view)
    return { value: answer(view) } as never
  })
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
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }) as never)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true } as never)
  return { views, toasts }
}

test('um clique na linha de um agente pede a transcrição dele na vista principal', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const { views, toasts } = await startSession($, on)
  const ui = await $.ui.mount(band())
  expect(await ui.find({ type: 'Button', key: 'agent-a1' })).toBeUndefined() // sem agente, sem linha
  await $.agent.spawn(SPAWN)
  const row = await ui.find({ type: 'Button', key: 'agent-a1' })
  expect(row?.text).toContain('Explore')
  expect(row?.text).toContain('buscar rotas HLS')
  await ui.press({ key: 'agent-a1' })
  expect(views.map(v => v.agentId)).toEqual(['a1'])
  expect(toasts).toEqual([])
  await ui.unmount()
})

test('com a transcrição de um agente na tela, a barra diz de quem é, sublinha a linha dele e oferece a volta', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const { views } = await startSession($, on)
  const ui = await $.ui.mount(band())
  await $.agent.spawn(SPAWN)
  expect(await ui.find({ type: 'Text', text: /^vendo $/ })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'view-main' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /^Explore$/ }))?.props.underline).toBeFalsy()

  await ui.redraw(propsOf({ agentId: 'a1' })) // o engine trocou a vista: a faixa é desenhada de novo
  expect(await ui.find({ type: 'Text', text: /^vendo $/ })).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'view-main' }))?.text).toBe('← principal')
  expect((await ui.findAll({ type: 'Text', text: /^Explore$/ })).some(t => t.props.underline === true)).toBe(true)

  await ui.press({ key: 'view-main' })
  expect(views).toEqual([{}]) // sem agente: a conversa principal
  await ui.unmount()
})

test('outro clique na linha do agente em vista volta à conversa principal', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const { views } = await startSession($, on)
  const ui = await $.ui.mount(band({ agentId: 'a1' }))
  await $.agent.spawn(SPAWN)
  await ui.press({ key: 'agent-a1' })
  expect(views).toEqual([{}])
  await ui.unmount()
})

test('a vista de um agente que a barra já não mostra ainda tem a volta', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const { views } = await startSession($, on)
  const ui = await $.ui.mount(band({ agentId: 'sumido' }))
  expect(await ui.find({ type: 'Text', text: /^vendo $/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /agente/ })).toBeDefined() // sem linha dele, é só "agente"
  await ui.press({ key: 'view-main' })
  expect(views).toEqual([{}])
  await ui.unmount()
})

test('se o engine não troca a vista, um aviso diz por quê', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const { toasts } = await startSession($, on, {}, () => ({ deny: 'no agent holds the id' }))
  const ui = await $.ui.mount(band())
  await $.agent.spawn(SPAWN)
  await ui.press({ key: 'agent-a1' })
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('Não deu para abrir a transcrição: no agent holds the id')
  await ui.unmount()
})

test('em inglês, os textos da vista também mudam', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const { toasts } = await startSession($, on, { language: 'en' }, () => ({ deny: 'gone' }))
  const ui = await $.ui.mount(band({ agentId: 'a1' }))
  await $.agent.spawn(SPAWN)
  expect(await ui.find({ type: 'Text', text: /^viewing $/ })).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'view-main' }))?.text).toBe('← main')
  await ui.press({ key: 'view-main' })
  expect(toasts[0]).toContain('Could not open the transcript: gone')
  await ui.unmount()
})

test('a linha de quem está em vista cabe na barra: a descrição cede espaço ao botão de volta', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band({ agentId: 'a1' }, 'terminal', 64))
  await $.agent.spawn({ ...(SPAWN as object), description: 'uma descrição comprida demais para caber inteira numa barra estreita assim' } as never)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.some(t => /^vendo $/.test(t))).toBe(true)
  expect(texts.some(t => t.includes('…'))).toBe(true)
  expect((await ui.find({ type: 'Button', key: 'view-main' }))?.text).toBe('← principal')
  await ui.unmount()
})

test('com a aba de ajustes aberta, ela toma o lugar das linhas, a da vista incluída', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band({ agentId: 'a1' }))
  await $.agent.spawn(SPAWN)
  await ui.press({ key: 'settings' })
  expect(await ui.find({ type: 'Button', key: 'view-main' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'agent-a1' })).toBeUndefined()
  await ui.press({ key: 'set-close' })
  expect(await ui.find({ type: 'Button', key: 'view-main' })).toBeDefined()
  await ui.unmount()
})

test('no app desktop as linhas de agente seguem como texto: o clique é do terminal', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band({}, 'desktop'))
  await $.agent.spawn(SPAWN)
  expect(await ui.find({ type: 'Text', text: /buscar rotas HLS/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'agent-a1' })).toBeUndefined()
  await ui.unmount()
})
