import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { KIND_PAINT, tintOf } from './palette'
import { VERSION } from './version'

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const band = (surface: (typeof SURFACES)[number], isWorking = false, bodyColumns = 120, maxRows = 20) =>
  ({
    plugin: 'legends-claude', surface, component: 'AbovePrompt',
    props: { hasSurvey: false, isCollapsed: false, isWorking, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows - 1 }, view: {} },
  }) as never

type Listed = { id: string; status: string; type: string; description: string }

// Os testes desta parte conferem o palco de texto: pedem a resolução `classica`. Numa instalação nova
// o padrão é `auto` (blocos, pixels ou vetor, pelo que a tela oferece): esses têm os seus testes no fim.
const classic = (extra: Record<string, unknown> = {}) => ({ settings: { resolution: 'classica', ...extra } })

// O mundo abaixo de uma sessão iniciada: modelo, custo, lista de agentes e os eventos que o engine responderia.
const startSession = async (
  $: { session: { start: (e: never) => Promise<unknown> } }, on: On, listed: () => Listed[] = () => [],
  model: () => string = () => 'claude-fable-5-2', store: Record<string, unknown> = classic(),
  env: Record<string, string> = { LANG: 'pt_BR.UTF-8' }, // os testes de sempre rodam num sistema em português
  theme = 'dark',
) => {
  mock.env(on, env)
  // o store do plugin, em memória: o que o mod salva fica em `saved`, para o teste conferir
  const saved: unknown[] = []
  // o comando como foi registrado a cada vez: a descrição e a dica mudam com o idioma
  const registered: { description?: string; argumentHint?: string }[] = []
  on('store.get', ($, e) => ({ value: store[e.key] }) as never)
  on('store.set', ($, e) => ((store[e.key] = e.value), saved.push(e.value), { value: undefined }) as never)
  on('command.register', ($, e) => (registered.push(e as never), { value: { command: 'legends-claude' } }))
  on('session.model', () => ({ value: model() }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [], cost: { usd: 1.5 } } }) as never)
  on('agent.list', () => ({ value: listed() }) as never)
  on('config.list', () => ({ value: [{ key: 'verbose', value: false }, { key: 'theme', value: theme }] }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }) as never)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true } as never)
  return { saved, store, registered }
}

const SPAWN = { tool_use_id: 't1', prompt: 'p', description: 'buscar rotas HLS', subagentType: 'Explore', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-fable-5-2' } as never

test('o card mostra modelo e custo em toda superfície, sem contexto', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(surface))
    expect(await ui.find({ type: 'Text', text: /Fable 5\.2/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\$1\.50 sessão/ })).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: /Fable 5\.2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^high$/ })).toBeDefined()
  await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], cost: { usd: 1.75 }, changed: ['cost'] } as never)
  expect(await ui.find({ type: 'Text', text: /\$1\.75 ▲ sessão · turno \+\$0\.25/ })).toBeDefined()
  await ui.unmount()
})

test('um agente aparece ao nascer, conta ferramentas e termina com ✓', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal', true))
  expect(await ui.find({ type: 'Text', text: /Explore/ })).toBeUndefined()

  await $.agent.spawn(SPAWN)
  // ao nascer o nome ainda é um punhado de faíscas; a descrição já está lá
  expect(await ui.find({ type: 'Text', text: /Explore/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /buscar rotas HLS/ })).toBeDefined()
  await clock.advance(1_500)
  expect(await ui.find({ type: 'Text', text: /Explore/ })).toBeDefined()

  await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'a1' } as never)
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /1 tool · Grep/ })).toBeDefined()

  await clock.advance(10_500)
  expect(await ui.find({ type: 'Text', text: /12s · 1 tool · Grep/ })).toBeDefined()

  await $.turn.complete({ answer: '', durationMs: 12_000, isAborted: false, turnId: 'at1', agentId: 'a1', reason: 'answer', usage: { model: 'claude-haiku-5-5', input_tokens: 10_000, output_tokens: 2_000, cache_read_input_tokens: 400, cache_creation_input_tokens: 0 } } as never)
  expect(await ui.find({ type: 'Text', text: /✓/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /12s · 12\.4k tok/ })).toBeDefined()
  // o estouro de faíscas de quem terminou anda sozinho e some
  expect(await ui.find({ type: 'Text', text: /✓ Explore ✽/ })).toBeDefined()
  await clock.advance(300)
  expect(await ui.find({ type: 'Text', text: /✓ Explore ✶✳✢/ })).toBeDefined()
  await clock.advance(1_200)
  expect(await ui.find({ type: 'Text', text: /✓ Explore {2}buscar/ })).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: /^✧ $/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^0s$/ })).toBeDefined() // o placar do palco faz as vezes da linha de trabalho
  await clock.advance(125)
  expect(await ui.find({ type: 'Text', text: /^✦ $/ })).toBeDefined()
  await clock.advance(1_000)
  expect(await ui.find({ type: 'Text', text: /^1s$/ })).toBeDefined()
  await ui.unmount()

  // Fim do turno: passada a comemoração, a faixa volta a ociosa, o relógio para e nada mais anda.
  const idle = await $.ui.mount(band('terminal', false))
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await clock.advance(5_000)
  const drawn = async () => (await idle.findAll({ type: 'Text' })).map(t => t.text).join('|')
  const before = await drawn()
  expect(before).toContain('❂ ') // a faísca apagada do cabeçalho: a de Fable
  await clock.advance(5_000)
  expect(await drawn()).toBe(before)
  await idle.unmount()
})

test('com o palco desligado, a linha de trabalho com o cometa volta', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on, () => [], () => 'claude-fable-5-2', { settings: { showStage: false } })
  const ui = await $.ui.mount(band('terminal', true))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  expect(await ui.find({ type: 'Text', text: /✻······· 0s/ })).toBeDefined()
  await clock.advance(125)
  expect(await ui.find({ type: 'Text', text: /✶✻······ 0s/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /█/ })).toBeUndefined() // nenhum mascote
  await ui.unmount()
})

test('um agente que já rodava quando o mod carregou é adotado da lista do engine', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on, () => [{ id: 'bg1', status: 'running', type: 'code-reviewer', description: 'revisar diff' }])
  const ui = await $.ui.mount(band('terminal'))
  await clock.advance(2_000) // o nome assenta
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
  expect((await $.command.run({ command: 'legends-claude', args: '' } as never) as { text: string }).text).toBe('Barra de status escondida.')
  expect(await ui.find({ type: 'Text', text: /Fable/ })).toBeUndefined()
  expect((await $.command.run({ command: 'legends-claude', args: '' } as never) as { text: string }).text).toBe('Barra de status visível.')
  await ui.unmount()
})

test('num terminal estreito ou durante uma pesquisa o card não desenha', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const narrow = await $.ui.mount(band('terminal', false, 50))
  expect(await narrow.find({ type: 'Text', text: /Fable/ })).toBeUndefined()
  await narrow.unmount()
})

test('um clique no modelo abre o seletor, e escolher roda /model de verdade', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const ran: string[] = []
  let model = 'claude-fable-5-2'
  on('command.run', { command: 'model' }, ($, e) => {
    ran.push(`/model ${e.args}`)
    model = 'claude-opus-5-5'
    return { text: 'ok' }
  })
  await startSession($, on, () => [], () => model)
  const ui = await $.ui.mount(band('terminal'))
  expect(await ui.find({ type: 'Text', text: /^Opus$/ })).toBeUndefined()

  await ui.press({ key: 'model' })
  expect(await ui.find({ type: 'Text', text: /^● Fable$/ })).toBeDefined() // o atual vem marcado
  expect(await ui.find({ type: 'Text', text: /^Opus$/ })).toBeDefined()

  await ui.press({ key: 'pick-opus' })
  expect(ran).toEqual(['/model opus'])
  expect(await ui.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined() // o cabeçalho já mostra o novo
  expect(await ui.find({ type: 'Text', text: /^Sonnet$/ })).toBeUndefined() // e o seletor fechou
  await ui.unmount()
})

test('um clique no effort abre o seletor, escolher roda /effort, e ✕ fecha sem trocar', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const ran: string[] = []
  on('command.run', { command: 'effort' }, ($, e) => (ran.push(`/effort ${e.args}`), { text: 'ok' }))
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))

  await ui.press({ key: 'effort' })
  expect(await ui.find({ type: 'Text', text: /^xhigh$/ })).toBeDefined()
  await ui.press({ key: 'pick-close' })
  expect(await ui.find({ type: 'Text', text: /^xhigh$/ })).toBeUndefined()
  expect(ran).toEqual([])

  await ui.press({ key: 'effort' })
  await ui.press({ key: 'pick-max' })
  expect(ran).toEqual(['/effort max'])
  expect(await ui.find({ type: 'Text', text: /^max$/ })).toBeDefined()
  await ui.unmount()
})

test('se o comando de troca é recusado, a pessoa é avisada e o card segue como estava', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const toasts: string[] = []
  on('ui.toast', ($, e) => (toasts.push(JSON.stringify(e)), { value: undefined }) as never)
  // nada responde a /model nesta sessão: a chamada é recusada
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await ui.press({ key: 'model' })
  await ui.press({ key: 'pick-haiku' })
  expect(toasts.some(t => /Não deu para trocar model: /.test(t))).toBe(true)
  expect(await ui.find({ type: 'Text', text: /Fable 5\.2/ })).toBeDefined()
  await ui.unmount()
})

// ─── Aba de ajustes ───────────────────────────────────────────────────────────

const colorOf = async (ui: { find: (q: { type: string; text: RegExp }) => Promise<{ props: Record<string, unknown> } | undefined> }, text: RegExp) =>
  (await ui.find({ type: 'Text', text }))?.props.color

test('o ⚙ abre a aba de ajustes no lugar das linhas, e ✕ fecha', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(band(surface))
    expect(await ui.find({ type: 'Text', text: /^ajustes$/ })).toBeUndefined()
    await ui.press({ key: 'settings' })
    expect(await ui.find({ type: 'Text', text: /^ajustes$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^● Claude$/ })).toBeDefined() // a cor atual vem marcada
    expect(await ui.find({ type: 'Text', text: /^Azul$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^☑ régua$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Fable 5\.2/ })).toBeDefined() // o cabeçalho continua
    await ui.press({ key: 'set-close' })
    expect(await ui.find({ type: 'Text', text: /^ajustes$/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('escolher uma cor pinta a barra na hora e salva no store', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const { saved } = await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  expect(await colorOf(ui, /^Fable 5\.2$/)).toBe('claude')
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'set-accent-azul' })
  expect(await colorOf(ui, /^Fable 5\.2$/)).toBe('#5FA8FF')
  expect(await ui.find({ type: 'Text', text: /^● Azul$/ })).toBeDefined()
  expect(saved.at(-1)).toMatchObject({ accent: 'azul' })
  await ui.unmount()
})

test('os ajustes salvos valem desde a abertura da sessão; um campo estragado volta ao padrão', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on, () => [], () => 'claude-fable-5-2', {
    settings: { accent: 'verde', showRule: false, showTurnCost: 'talvez', maxAgents: 99 },
  })
  const ui = await $.ui.mount(band('terminal'))
  expect(await colorOf(ui, /^Fable 5\.2$/)).toBe('#4EC98B')
  expect(await ui.find({ type: 'Text', text: /─{10}/ })).toBeUndefined() // régua desligada
  await ui.press({ key: 'settings' })
  expect(await ui.find({ type: 'Text', text: /^☑ custo do turno$/ })).toBeDefined() // 'talvez' voltou a true
  expect(await ui.find({ type: 'Text', text: /^● 6$/ })).toBeDefined() // 99 voltou a 6
  await ui.unmount()
})

test('desligar a régua e os limites tira as duas coisas da barra', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 42 }], cost: { usd: 1.5 }, changed: ['rateLimits'] } as never)
  const ui = await $.ui.mount(band('terminal'))
  expect(await ui.find({ type: 'Text', text: /5h ▰▰▱▱▱ 42%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /─{10}/ })).toBeDefined()
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'set-showLimits' })
  await ui.press({ key: 'set-showRule' })
  expect(await ui.find({ type: 'Text', text: /^☐ limites$/ })).toBeDefined()
  await ui.press({ key: 'set-close' })
  expect(await ui.find({ type: 'Text', text: /5h/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /─{10}/ })).toBeUndefined()
  await ui.unmount()
})

test('restaurar padrão volta tudo e salva', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const { saved } = await startSession($, on, () => [], () => 'claude-fable-5-2', { settings: { accent: 'rosa', motion: 'parada' } })
  const ui = await $.ui.mount(band('terminal'))
  await ui.press({ key: 'settings' })
  expect(await ui.find({ type: 'Text', text: /^● Rosa$/ })).toBeDefined()
  await ui.press({ key: 'set-reset' })
  expect(await ui.find({ type: 'Text', text: /^● Claude$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^● completa$/ })).toBeDefined()
  expect(saved.at(-1)).toMatchObject({ accent: 'claude', motion: 'completa', speed: 'normal', maxAgents: 6 })
  await ui.unmount()
})

test('animação parada: nada pulsa, mas o tempo do turno continua contando', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on, () => [], () => 'claude-fable-5-2', { settings: { motion: 'parada' } })
  const ui = await $.ui.mount(band('terminal', true))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  expect(await ui.find({ type: 'Text', text: /^❂ $/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^✻$/ })).toBeDefined() // a linha de trabalho sem cometa
  await clock.advance(450)
  expect(await ui.find({ type: 'Text', text: /^❂ $/ })).toBeDefined() // mesmo glifo, não girou
  await clock.advance(2_000)
  expect(await ui.find({ type: 'Text', text: /^ 2s$/ })).toBeDefined()
  await ui.unmount()
})

test('a velocidade troca a cadência da animação em curso', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal', true))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'set-speed-rapida' })
  await ui.press({ key: 'set-close' })
  expect(await ui.find({ type: 'Text', text: /^✧ $/ })).toBeDefined()
  await clock.advance(90) // um quadro rápido; no normal seriam 150
  expect(await ui.find({ type: 'Text', text: /^✦ $/ })).toBeDefined()
  await ui.unmount()
})

test('/legends-claude ajustes abre a aba, mesmo com a barra escondida', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await ui.press({ key: 'hide' })
  const r = (await $.command.run({ command: 'legends-claude', args: 'ajustes' } as never)) as { text: string }
  expect(r.text).toBe('Ajustes abertos na barra.')
  expect(await ui.find({ type: 'Text', text: /^ajustes$/ })).toBeDefined()
  await ui.unmount()
})

// ─── Palco ────────────────────────────────────────────────────────────────────

const BLOCKS = /[▀▄█▌▐▘▝▖▗▛▜▙▟▚▞]/ // os blocos com que o palco desenha
// A cor de um trecho que contém `text`, em qualquer linha da faixa.
const paintOf = async (ui: { findAll: (q: { type: string; text: RegExp }) => Promise<{ text: string; props: Record<string, unknown> }[]> }, text: RegExp) =>
  (await ui.findAll({ type: 'Text', text })).map(t => t.props.color)

test('durante o turno o mascote entra em cena, e cada ferramenta vira um tijolo da cor da família dela', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(band(surface, true))
    expect(await ui.find({ type: 'Text', text: BLOCKS })).toBeUndefined() // sem o início de um turno, não há cena

    await $.turn.start({ text: 'oi', turnId: 't1' })
    await clock.advance(2_500) // o mascote entra e chega ao meio da pista
    expect(await paintOf(ui, /█/)).toContain('claude') // o corpo dele, na cor de destaque (a faixa de brilho pode estar passando por um pedaço)

    await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
    await clock.settle()
    expect(await paintOf(ui, /^▀▀$/)).toContain('#F5B841') // o tijolo do shell, na pilha
    await clock.advance(12_000) // busca, carrega, põe na esteira, e o tijolo chega ao mosaico
    expect(await ui.find({ type: 'Text', text: /1 tool/ })).toBeDefined()
    expect(await paintOf(ui, /^▀▀$/)).toContain('#F5B841')

    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await clock.advance(250)
    expect((await ui.findAll({ type: 'Text', text: /✓/ })).length > 0).toBe(true) // comemora
    await clock.advance(6_000)
    expect(await ui.find({ type: 'Text', text: BLOCKS })).toBeUndefined() // e a cena sai
    await ui.unmount()
  }
})

test('um agente vira um ajudante em cena, na cor da faísca dele na lista', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal', true))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(2_500)
  const tint = tintOf('a1') // o agente que o engine de teste devolve
  expect(await paintOf(ui, BLOCKS)).not.toContain(tint) // ainda não há bicho dessa cor em cena
  await $.agent.spawn(SPAWN)
  await clock.advance(250)
  expect(await ui.find({ type: 'Text', text: /^!$/ })).toBeDefined() // o mascote grita por ele
  await clock.advance(2_000)
  expect(await paintOf(ui, /^[·✢✣✤]$/)).toContain(tint) // a faísca do agente na lista (a de Haiku, o modelo dele) tem a cor dele
  expect(await paintOf(ui, BLOCKS)).toContain(tint) // e agora há um bicho dessa cor no palco
  await ui.unmount()
})

test('o interruptor "palco" tira a cena, e numa faixa baixa demais ela nem entra', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal', true))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(2_500)
  expect(await ui.find({ type: 'Text', text: BLOCKS })).toBeDefined()
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'set-showStage' })
  await ui.press({ key: 'set-close' })
  expect(await ui.find({ type: 'Text', text: BLOCKS })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /\ds$/ })).toBeDefined() // a linha de trabalho está de volta
  await ui.unmount()

})

test('numa faixa baixa o palco ainda entra e a lista de agentes encolhe; baixa demais, o palco não entra', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const three = () => ['x', 'y', 'z'].map(id => ({ id, status: 'running', type: `tipo-${id}`, description: 'd' }))
  await startSession($, on, three)
  const low = await $.ui.mount(band('terminal', true, 120, 8)) // régua + cabeçalho + palco = 6: sobra uma linha de agente e o resumo
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(3_000)
  expect(await low.find({ type: 'Text', text: BLOCKS })).toBeDefined()
  expect((await low.findAll({ type: 'Text', text: /tipo-[xyz]/ })).filter(t => t.props.wrap).length).toBe(1)
  expect(await low.find({ type: 'Text', text: /\+2 agentes/ })).toBeDefined()
  await low.unmount()

  const tiny = await $.ui.mount(band('terminal', true, 120, 6))
  await clock.advance(250)
  expect(await tiny.find({ type: 'Text', text: BLOCKS })).toBeUndefined()
  expect((await tiny.findAll({ type: 'Text', text: /tipo-[xyz]/ })).filter(t => t.props.wrap).length).toBe(3) // sem palco, a lista inteira
  await tiny.unmount()
})

test('/legends-claude demo mostra o palco em ação sem um turno, e termina sozinho', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  expect(await ui.find({ type: 'Text', text: BLOCKS })).toBeUndefined()
  const said = (await $.command.run({ command: 'legends-claude', args: 'demo' } as never)) as { text: string }
  expect(said.text).toBe('Demonstração do palco em cena.')
  await clock.advance(3_000)
  expect(await ui.find({ type: 'Text', text: /▶ demonstração/ })).toBeDefined()
  expect(await paintOf(ui, /█████/)).toContain('claude')
  await clock.advance(12_000) // já com ajudantes e tijolos de várias cores
  const colors = new Set(await paintOf(ui, BLOCKS))
  expect(colors.size > 4).toBe(true)
  await clock.advance(20_000) // o roteiro acaba, o confete cai, a cena sai
  expect(await ui.find({ type: 'Text', text: BLOCKS })).toBeUndefined()
  const drawn = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')
  const after = await drawn()
  await clock.advance(5_000)
  expect(await drawn()).toBe(after) // e o relógio da animação parou
  await ui.unmount()
})

test('a demonstração não começa no meio de um turno nem com o palco desligado; um turno de verdade a encerra', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const demo = async () => ((await $.command.run({ command: 'legends-claude', args: 'demo' } as never)) as { text: string }).text
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  expect(await demo()).toBe('Demonstração do palco em cena.')
  await clock.advance(3_000)
  expect(await ui.find({ type: 'Text', text: /▶ demonstração/ })).toBeDefined()
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(250)
  expect(await ui.find({ type: 'Text', text: /▶ demonstração/ })).toBeUndefined() // o turno de verdade assumiu a cena
  expect(await demo()).toMatch(/sessão parada/)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await clock.advance(6_000)

  await ui.press({ key: 'settings' })
  await ui.press({ key: 'set-showStage' })
  expect(await demo()).toMatch(/palco está desligado/)
  await ui.unmount()
})

test('o botão de demonstração da aba de ajustes fecha a aba e põe a cena no ar', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'set-demo' })
  await clock.advance(3_000)
  expect(await ui.find({ type: 'Text', text: /^ajustes$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /▶ demonstração/ })).toBeDefined()
  await ui.unmount()
})

// ─── O relógio da animação não fica ligado à toa ──────────────────────────────

// O relógio da animação confere a lista de agentes uma vez por segundo: se as consultas param, ele parou.
const countingAgentList = () => {
  const seen = { calls: 0 }
  return { seen, listed: () => ((seen.calls += 1), [] as Listed[]) }
}

test('num terminal estreito demais para o palco, o fim do turno não deixa o relógio ligado', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const { seen, listed } = countingAgentList()
  await startSession($, on, listed)
  const working = await $.ui.mount(band('terminal', true, 50))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/x' } as never)
  await clock.advance(1_000)
  await working.unmount()
  const idle = await $.ui.mount(band('terminal', false, 50))
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await clock.advance(5_000)
  const stopped = seen.calls
  await clock.advance(10_000)
  expect(seen.calls).toBe(stopped)
  await idle.unmount()
})

test('um turno cujo fim não é avisado se encerra sozinho, e o relógio para', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const { seen, listed } = countingAgentList()
  await startSession($, on, listed)
  const working = await $.ui.mount(band('terminal', true))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(2_000)
  expect(await working.find({ type: 'Text', text: BLOCKS })).toBeDefined()
  await working.unmount()
  // a faixa passa a dizer "parada", mas o evento de fim de turno nunca chega
  const idle = await $.ui.mount(band('terminal', false))
  await clock.advance(3_000)
  expect(await idle.find({ type: 'Text', text: BLOCKS })).toBeDefined() // ainda dentro da tolerância: a cena segue
  await clock.advance(12_000)
  expect(await idle.find({ type: 'Text', text: BLOCKS })).toBeUndefined() // a cena se despediu
  const stopped = seen.calls
  await clock.advance(10_000)
  expect(seen.calls).toBe(stopped)
  expect(((await $.command.run({ command: 'legends-claude', args: 'demo' } as never)) as { text: string }).text).toBe('Demonstração do palco em cena.')
  await idle.unmount()
})

test('religar o palco no meio de um turno põe a cena no ar na hora', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on, () => [], () => 'claude-fable-5-2', classic({ showStage: false }))
  const ui = await $.ui.mount(band('terminal', true))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(1_000)
  expect(await ui.find({ type: 'Text', text: BLOCKS })).toBeUndefined()
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'set-showStage' })
  await ui.press({ key: 'set-close' })
  await clock.advance(2_500)
  expect(await paintOf(ui, /█/)).toContain('claude')
  await ui.unmount()
})

test('num terminal estreito a demonstração avisa que não cabe, em vez de ficar rodando no vazio', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal', false, 50))
  expect(((await $.command.run({ command: 'legends-claude', args: 'demo' } as never)) as { text: string }).text).toMatch(/60 colunas/)
  await ui.unmount()
})

test('um turno interrompido se recolhe sem festa; um turno curto ganha só um pulinho', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal', true))
  const checks = async () => (await ui.findAll({ type: 'Text', text: /^✓$/ })).length

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(2_500)
  for (const tool of ['Read', 'Edit', 'Bash', 'Grep']) await $.tool.call({ tool } as never)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' } as never)
  await clock.advance(250)
  expect(await checks()).toBe(0)
  expect(await ui.find({ type: 'Text', text: BLOCKS })).toBeUndefined() // a cena já saiu

  await $.turn.start({ text: 'oi', turnId: 't2' })
  await clock.advance(2_500)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' } as never)
  await clock.advance(250)
  expect(await checks()).toBe(1) // comemora
  // o confete são pontos soltos (um quarto de célula) nas cores dos tijolos: aqui não há nenhum
  const dots = (await ui.findAll({ type: 'Text', text: /^[▘▝▖▗]+$/ })).filter(t => String(t.props.color).startsWith('#'))
  expect(dots.length).toBe(0)
  expect(await paintOf(ui, /^▀▀$/)).toContain('#5FA8FF') // e a parede guarda o tijolo do turno interrompido
  await clock.advance(3_000)
  expect(await ui.find({ type: 'Text', text: BLOCKS })).toBeUndefined()
  await ui.unmount()
})

// ─── Idiomas ──────────────────────────────────────────────────────────────────

const find = (ui: { find: (q: { type: string; text: RegExp }) => Promise<unknown> }, text: RegExp) => ui.find({ type: 'Text', text })

test('o idioma é a primeira linha da aba de ajustes; trocar muda a barra inteira na hora e fica salvo', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const { saved, registered } = await startSession($, on)
  expect(registered.at(-1)).toMatchObject({ argumentHint: '[ajustes|demo [modelo] [effort]]' })
  const ui = await $.ui.mount(band('terminal'))
  await ui.press({ key: 'settings' })
  for (const text of [/^ajustes$/, /^● Português$/, /^English$/, /^Azul$/, /^● completa$/, /^☑ palco$/, / sessão$/]) expect(await find(ui, text)).toBeDefined()
  expect((await ui.findAll({ type: 'Box' })).map(b => b.key).filter(k => k?.startsWith('set-'))[1]).toBe('set-language') // logo abaixo do cabeçalho da aba

  await ui.press({ key: 'set-language-en' })
  for (const text of [/^settings$/, /^● English$/, /^Português$/, /^Blue$/, /^● full$/, /^☑ stage$/, / session$/]) expect(await find(ui, text)).toBeDefined()
  for (const text of [/^ajustes$/, /^Azul$/, /^☑ palco$/, / sessão$/]) expect(await find(ui, text)).toBeUndefined()
  expect(saved.at(-1)).toMatchObject({ language: 'en' })
  // o comando foi registrado de novo, com a descrição e a dica em inglês
  expect(registered.at(-1)).toMatchObject({ argumentHint: '[settings|demo [model] [effort]]' })
  expect(registered.at(-1)?.description).toMatch(/^Shows or hides the status bar/)

  await ui.press({ key: 'set-language-pt' })
  expect(await find(ui, /^ajustes$/)).toBeDefined()
  expect(saved.at(-1)).toMatchObject({ language: 'pt' })
  expect(registered.at(-1)).toMatchObject({ argumentHint: '[ajustes|demo [modelo] [effort]]' })
  await ui.unmount()
})

test('em inglês, o comando responde em inglês e aceita "settings"', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on, () => [], () => 'claude-fable-5-2', { settings: { language: 'en' } })
  const run = async (args: string) => ((await $.command.run({ command: 'legends-claude', args } as never)) as { text: string }).text
  const ui = await $.ui.mount(band('terminal'))
  expect(await run('')).toBe('Status bar hidden.')
  expect(await run('')).toBe('Status bar visible.')
  expect(await run('settings')).toBe('Settings opened in the bar.')
  expect(await find(ui, /^settings$/)).toBeDefined()
  expect(await run('demo')).toBe('Stage demo playing.')
  await ui.unmount()
})

test('em inglês, a demonstração e o placar dela falam inglês', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on, () => [], () => 'claude-fable-5-2', classic({ language: 'en' }))
  const ui = await $.ui.mount(band('terminal'))
  await $.command.run({ command: 'legends-claude', args: 'demo' } as never)
  await clock.advance(3_000)
  expect(await find(ui, /▶ demo$/)).toBeDefined()
  expect(await find(ui, /demonstração/)).toBeUndefined()
  await ui.unmount()
})

test('restaurar padrão volta a aparência, mas não mexe no idioma', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const { saved } = await startSession($, on, () => [], () => 'claude-fable-5-2', { settings: { language: 'en', accent: 'rosa', motion: 'suave' } })
  const ui = await $.ui.mount(band('terminal'))
  await ui.press({ key: 'settings' })
  expect(await find(ui, /^● Pink$/)).toBeDefined()
  await ui.press({ key: 'set-reset' })
  expect(await find(ui, /^● Claude$/)).toBeDefined()
  expect(await find(ui, /^● full$/)).toBeDefined()
  expect(await find(ui, /^● English$/)).toBeDefined()
  expect(saved.at(-1)).toMatchObject({ language: 'en', accent: 'claude', motion: 'completa' })
  await ui.unmount()
})

// De onde vem o idioma quando a pessoa ainda não escolheu um na aba.
const FIRST_LANGUAGE: { name: string; store: Record<string, unknown>; env: Record<string, string>; title: RegExp }[] = [
  { name: 'instalação nova num sistema em português: português', store: {}, env: { LANG: 'pt_BR.UTF-8' }, title: /^ajustes$/ },
  { name: 'instalação nova num sistema em inglês: inglês', store: {}, env: { LANG: 'en_US.UTF-8' }, title: /^settings$/ },
  { name: 'instalação nova sem idioma no ambiente: inglês', store: {}, env: {}, title: /^settings$/ },
  { name: 'instalação nova: LC_ALL vale mais que LANG', store: {}, env: { LC_ALL: 'pt_BR.UTF-8', LANG: 'en_US.UTF-8' }, title: /^ajustes$/ },
  { name: 'ajustes salvos antes de haver idiomas continuam em português, mesmo num sistema em inglês', store: { settings: { accent: 'ambar' } }, env: { LANG: 'en_US.UTF-8' }, title: /^ajustes$/ },
  { name: 'o idioma escolhido na aba vale mais que o do sistema', store: { settings: { language: 'en' } }, env: { LANG: 'pt_BR.UTF-8' }, title: /^settings$/ },
  { name: 'um store estragado conta como instalação nova', store: { settings: 'lixo' }, env: { LANG: 'en_US.UTF-8' }, title: /^settings$/ },
]
for (const { name, store, env, title } of FIRST_LANGUAGE) {
  test(`o primeiro idioma — ${name}`, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    await startSession($, on, () => [], () => 'claude-fable-5-2', store, env)
    const ui = await $.ui.mount(band('terminal'))
    await ui.press({ key: 'settings' })
    expect(await find(ui, title)).toBeDefined()
    await ui.unmount()
  })
}

test('a aba de ajustes mostra a versão do mod no cabeçalho', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on, () => [], () => 'claude-fable-5-2', {}, { LANG: 'pt_BR.UTF-8' })
  const ui = await $.ui.mount(band('terminal'))
  await ui.press({ key: 'settings' })
  expect(await find(ui, new RegExp(`v${VERSION.replace(/\./g, '\\.')}$`))).toBeDefined()
  await ui.unmount()
})

// As tintas que só o poder põe no palco: os hex que não são de tijolo (a aura, o brilho do corpo, os olhos, as fagulhas).
const BRICK_PAINTS = new Set<unknown>(Object.values(KIND_PAINT))
const powerPaints = async (ui: { findAll: (q: { type: string; text: RegExp }) => Promise<{ props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Text', text: BLOCKS }))
    .flatMap(t => [t.props.color, t.props.backgroundColor])
    .filter((paint): paint is string => typeof paint === 'string' && paint.startsWith('#') && !BRICK_PAINTS.has(paint))
const brightness = (hex: string) => [1, 3, 5].reduce((n, i) => n + parseInt(hex.slice(i, i + 2), 16), 0)
// O passo do modelo que o engine responderia: registrado antes da primeira chamada em $.
const answerSteps = (on: On) =>
  on('turn.step', async function* ($, e) { return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never })

test('o modelo e o effort do pedido dão o poder do mascote: sem effort, nada; em max, a aura da classe', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  answerSteps(on)
  await startSession($, on, () => [], () => 'claude-sonnet-5-5')
  const ui = await $.ui.mount(band('terminal', true))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(7_000) // o mascote chega em casa, e a faixa de brilho de Sonnet já passou
  expect(await powerPaints(ui)).toEqual([]) // nenhum effort lido ainda: o mascote de sempre
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', effort: 'max', messageCount: 1 })) void _
  await clock.advance(125)
  const paints = await powerPaints(ui)
  expect(paints.length > 4).toBe(true)
  expect(await ui.find({ type: 'Text', text: /^max$/ })).toBeDefined()
  // um modelo mais fraco no pedido seguinte, e a aura some
  for await (const _ of $.turn.step({ turnId: 't1', index: 1, model: 'claude-haiku-5-5', effort: 'low', messageCount: 2 })) void _
  await clock.advance(125)
  expect(await powerPaints(ui)).toEqual([])
  await ui.unmount()
})

test('o modelo e o effort de um agente dão o poder do ajudante dele', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  answerSteps(on)
  await startSession($, on, () => [], () => 'claude-haiku-5-5') // um mascote sem brilho: o que aparecer é do ajudante
  const ui = await $.ui.mount(band('terminal', true))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.agent.spawn(SPAWN)
  await clock.advance(2_500) // o ajudante brota e pousa
  expect(await paintOf(ui, BLOCKS)).toContain(tintOf('a1'))
  expect(await powerPaints(ui)).toEqual([]) // um Haiku sem effort lido: sem aura
  for await (const _ of $.turn.step({ turnId: 'at1', index: 0, model: 'claude-opus-5-5', effort: 'max', messageCount: 1, agentId: 'a1' })) void _
  await clock.advance(125)
  expect((await powerPaints(ui)).length > 4).toBe(true)
  expect(await paintOf(ui, /^[✶✸✹✺❋]$/)).toContain(tintOf('a1')) // e a faísca dele na lista passa a ser a de Opus
  await ui.unmount()
})

test('/legends-claude demo aceita um modelo e um effort, e o mascote aparece com esse poder', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on, () => [], () => 'claude-haiku-5-5')
  const run = async (args: string) => ((await $.command.run({ command: 'legends-claude', args } as never)) as { text: string }).text
  const ui = await $.ui.mount(band('terminal'))
  expect(await run('demo')).toBe('Demonstração do palco em cena.')
  await clock.advance(1_500)
  expect(await ui.find({ type: 'Text', text: BLOCKS })).toBeDefined()
  expect(await powerPaints(ui)).toEqual([]) // sem pedir nada, vale o da sessão: um Haiku sem effort
  expect(await run('demo opus max')).toBe('Demonstração do palco em cena, como Opus · max.')
  await clock.advance(1_500)
  expect((await powerPaints(ui)).length > 4).toBe(true)
  expect(await run('demo   XHIGH')).toBe('Demonstração do palco em cena, como Haiku · xhigh.') // só o effort: o modelo segue o da sessão
  expect(await run('demonstração fable')).toBe('Demonstração do palco em cena, como Fable · low.')
  // uma palavra que não é modelo nem effort: avisa, e a demonstração em curso segue como estava
  expect(await run('demo opuss')).toBe('Não entendi "opuss". Depois de "demo" vai um modelo (haiku, sonnet, opus, fable), um effort (low, medium, high, xhigh, max), ou os dois.')
  await clock.advance(1_500)
  expect((await powerPaints(ui)).length > 0).toBe(true) // segue a de Fable, que tem aura até em low
  // a demonstração seguinte, sem pedido, volta ao da sessão
  expect(await run('demo')).toBe('Demonstração do palco em cena.')
  await clock.advance(1_500)
  expect(await powerPaints(ui)).toEqual([])
  expect(await ui.find({ type: 'Text', text: /Haiku 5\.5/ })).toBeDefined() // o cabeçalho segue o da sessão: a demonstração não troca o modelo
  await ui.unmount()
})

test('num tema claro a aura clareia em vez de escurecer, e trocar o tema no /config vale na hora', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  answerSteps(on)
  on('config.set', ($, e) => ({ value: e.value }) as never)
  await startSession($, on, () => [], () => 'claude-sonnet-5-5', classic(), { LANG: 'pt_BR.UTF-8' }, 'light')
  const ui = await $.ui.mount(band('terminal', true))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', effort: 'high', messageCount: 1 })) void _
  await clock.advance(7_000)
  const darkest = async () => Math.min(...(await powerPaints(ui)).map(brightness))
  const light = await darkest()
  await $.config.set({ key: 'theme', value: 'dark' } as never)
  await clock.advance(125)
  const dark = await darkest()
  expect(dark < light).toBe(true)
  await $.config.set({ key: 'theme', value: 'light-daltonized' } as never)
  await clock.advance(125)
  expect(await darkest()).toBe(light)
  await $.config.set({ key: 'theme', value: 'um-tema-qualquer' } as never) // um nome que não diz se é claro vale como escuro
  await clock.advance(125)
  expect(await darkest()).toBe(dark)
  await ui.unmount()
})

