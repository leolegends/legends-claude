import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { CRACKED_PAINT, KIND_PAINT } from './palette'

// A barra montada, diante de uma ferramenta que não deu certo: o tijolo dela racha, e a falha entra no
// placar do turno e na linha do agente que a chamou.

const band = (isWorking = true) =>
  ({
    plugin: 'legends-claude', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isCollapsed: false, isWorking, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 19 }, view: {} },
  }) as never

// O mundo abaixo de uma sessão iniciada, com o palco de texto; `answer` é o que cada ferramenta devolve.
const startSession = async ($: { session: { start: (e: never) => Promise<unknown> } }, on: On, settings: Record<string, unknown>, answer: () => unknown) => {
  mock.env(on, { LANG: 'pt_BR.UTF-8' })
  const store: Record<string, unknown> = { settings: { resolution: 'classica', ...settings } }
  on('store.get', ($, e) => ({ value: store[e.key] }) as never)
  on('store.set', ($, e) => ((store[e.key] = e.value), { value: undefined }) as never)
  on('store.keys', () => ({ value: Object.keys(store) }))
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
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('tool.call', () => answer() as never)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true } as never)
}

const BLOCKS = /[▀▄█▌▐▘▝▖▗▛▜▙▟▚▞]/
const OK = { result: {} }
const ERROR = { result: 'exit 1', isError: true, text: 'exit 1' }
const SPAWN = { tool_use_id: 't1', prompt: 'p', description: 'buscar rotas HLS', subagentType: 'Explore', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-fable-5-2' } as never
type Drawn = { findAll: (q: { type: string; text: RegExp }) => Promise<{ text: string; props: Record<string, unknown> }[]> }
const paintOf = async (ui: Drawn, text: RegExp) => (await ui.findAll({ type: 'Text', text })).map(t => t.props.color)

test('uma ferramenta que termina em erro vira um tijolo rachado, e a falha entra no placar', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const answers = [OK, ERROR, { deny: 'um plugin recusou' }]
  await startSession($, on, {}, () => answers.shift())
  const ui = await $.ui.mount(band())
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(2_500) // o mascote entra e chega ao meio da pista: entrando, ele passa na frente da pilha
  await $.tool.call({ tool: 'Read', file_path: '/w/a' } as never)
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /falha/ })).toBeUndefined() // a que deu certo não conta
  await $.tool.call({ tool: 'Bash', command: 'false' } as never)
  await clock.settle()
  expect(await paintOf(ui, /^1 falha$/)).toEqual(['error'])
  await $.tool.call({ tool: 'Bash', command: 'true' } as never) // recusada: também não rodou
  await clock.settle()
  expect(await paintOf(ui, /^2 falhas$/)).toEqual(['error'])
  // os três tijolos já estão em cena (na pilha, ou a caminho da parede): o da leitura inteiro, os do shell rachados
  await clock.advance(250)
  const bricks = (await ui.findAll({ type: 'Text', text: BLOCKS })).flatMap(t => [t.props.color, t.props.backgroundColor])
  expect(bricks).toContain(KIND_PAINT.r)
  expect(bricks).toContain(CRACKED_PAINT.b)
  expect(bricks).not.toContain(KIND_PAINT.b)
  await ui.unmount()
})

test('com o palco desligado, a falha vai para a linha de trabalho, e some no turno seguinte', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const answers = [ERROR]
  await startSession($, on, { showStage: false }, () => answers.shift() ?? OK)
  const ui = await $.ui.mount(band())
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'false' } as never)
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /0s · 1 tool · 1 falha · Bash/ })).toBeDefined()
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await $.turn.start({ text: 'de novo', turnId: 't2' })
  await $.tool.call({ tool: 'Bash', command: 'true' } as never)
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /falha/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /1 tool · Bash/ })).toBeDefined()
  await ui.unmount()
})

test('a falha da ferramenta de um agente conta na linha dele, não na do turno', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on, { showStage: false }, () => ERROR)
  const ui = await $.ui.mount(band())
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.agent.spawn(SPAWN)
  await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'a1' } as never)
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /buscar rotas HLS.*1 tool · 1 falha · Grep/ })).toBeDefined()
  expect((await ui.findAll({ type: 'Text', text: /^1 falha$/ })).length).toBe(1) // só a do agente
  await ui.unmount()
})

test('uma ferramenta que estoura também é uma falha, e o erro segue para quem chamou', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on, { showStage: false }, () => {
    throw new Error('a ferramenta quebrou')
  })
  const ui = await $.ui.mount(band())
  await $.turn.start({ text: 'oi', turnId: 't1' })
  const outcome = await $.tool.call({ tool: 'Bash', command: 'x' } as never).then(() => 'respondeu', () => 'estourou')
  await clock.settle()
  expect(outcome).toBe('estourou')
  expect(await ui.find({ type: 'Text', text: /1 tool · 1 falha · Bash/ })).toBeDefined()
  await ui.unmount()
})
