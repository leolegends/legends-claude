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
const startSession = async (
  $: { session: { start: (e: never) => Promise<unknown> } }, on: On, listed: () => Listed[] = () => [],
  model: () => string = () => 'claude-fable-5-2', store: Record<string, unknown> = {},
) => {
  // o store do plugin, em memória: o que o mod salva fica em `saved`, para o teste conferir
  const saved: unknown[] = []
  on('store.get', ($, e) => ({ value: store[e.key] }) as never)
  on('store.set', ($, e) => ((store[e.key] = e.value), saved.push(e.value), { value: undefined }) as never)
  on('command.register', () => ({ value: { command: 'legends-claude' } }))
  on('session.model', () => ({ value: model() }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [], cost: { usd: 1.5 } } }) as never)
  on('agent.list', () => ({ value: listed() }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }) as never)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true } as never)
  return { saved, store }
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
  expect(await ui.find({ type: 'Text', text: /^· $/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /✻······· 0s/ })).toBeDefined()
  await clock.advance(150)
  expect(await ui.find({ type: 'Text', text: /^✢ $/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /✶✻······ 0s/ })).toBeDefined()
  await clock.advance(1_050)
  expect(await ui.find({ type: 'Text', text: /1s/ })).toBeDefined()
  await ui.unmount()

  // Fim do turno: a faixa volta a ociosa, o próximo quadro para o relógio e nada mais anda.
  const idle = await $.ui.mount(band('terminal', false))
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await clock.advance(150)
  expect(await idle.find({ type: 'Text', text: /^✻ $/ })).toBeDefined()
  const before = (await idle.find({ type: 'Text', text: /^✻ $/ }))?.text
  await clock.advance(5_000)
  expect((await idle.find({ type: 'Text', text: /^✻ $/ }))?.text).toBe(before)
  await idle.unmount()
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
  expect(await ui.find({ type: 'Text', text: /^✻ $/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^✻$/ })).toBeDefined() // a linha de trabalho sem cometa
  await clock.advance(450)
  expect(await ui.find({ type: 'Text', text: /^✻ $/ })).toBeDefined() // mesmo glifo, não girou
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
  expect(await ui.find({ type: 'Text', text: /^· $/ })).toBeDefined()
  await clock.advance(90) // um quadro rápido; no normal seriam 150
  expect(await ui.find({ type: 'Text', text: /^✢ $/ })).toBeDefined()
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

test('durante o turno o mascote anda pelo palco com o arquivo; o interruptor "palco" tira a cena', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal', true))
  expect(await ui.find({ type: 'Text', text: /▐▛███▜▌/ })).toBeUndefined() // parado: sem cena
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  await clock.settle()
  await clock.advance(300)
  expect(await ui.find({ type: 'Text', text: /▐▛███▜▌▤ Bash/ })).toBeDefined() // leva o arquivo da ferramenta em uso
  const before = (await ui.find({ type: 'Text', text: /▐▛███▜▌/ }))?.text
  await clock.advance(450)
  expect((await ui.find({ type: 'Text', text: /▐▛███▜▌/ }))?.text).not.toBe(before) // andou

  await $.agent.spawn(SPAWN)
  await clock.advance(1_500)
  expect(await ui.find({ type: 'Text', text: /▐▛█▜▌/ })).toBeDefined() // o ajudante entrou em cena

  await ui.press({ key: 'settings' })
  await ui.press({ key: 'set-showStage' })
  await ui.press({ key: 'set-close' })
  expect(await ui.find({ type: 'Text', text: /▐▛/ })).toBeUndefined()
  await ui.unmount()
})
