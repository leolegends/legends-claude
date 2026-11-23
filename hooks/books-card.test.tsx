import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { dayOf } from './stats'

// A barra montada, com o que ela guarda de uma sessão para a outra (as contas, o custo do dia), os
// sons, o mascote que ela escolhe sozinha, e o que a lista de agentes do engine sabe de cada um.

const NOW = new Date(2026, 10, 23, 12).getTime() // meio-dia, na hora local: longe da virada do dia
const TODAY = dayOf(NOW)
const DAY = 86_400_000

const band = (isWorking = false, bodyColumns = 140) =>
  ({
    plugin: 'legends-claude', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isCollapsed: false, isWorking, maxRows: 24, bodyColumns, scroll: { offset: 0, bodyRows: 23 }, view: {} },
  }) as never

/** O que o engine responderia abaixo do mod, e o que o teste confere depois. */
type World = {
  /** O que já está no store do plugin além dos ajustes: registros de outras sessões, o total de sempre. */
  stored?: Record<string, unknown>
  settings?: Record<string, unknown>
  model?: string
  platform?: string
  cost?: () => number
  listed?: () => unknown[]
  /** O que cada ferramenta devolve; sem ele, um resultado vazio. */
  run?: () => unknown
  /** O id da sessão; pode estourar, como num engine que não o dá. */
  id?: () => string
}

const startSession = async ($: { session: { start: (e: never) => Promise<unknown> } }, on: On, world: World = {}) => {
  mock.env(on, { LANG: 'pt_BR.UTF-8' })
  const store: Record<string, unknown> = { settings: { resolution: 'classica', showStage: false, ...world.settings }, ...world.stored }
  const played: { base64: string; mime: string; gain?: number }[] = []
  on('store.get', ($, e) => ({ value: store[e.key] }) as never)
  on('store.set', ($, e) => ((store[e.key] = e.value), { value: undefined }) as never)
  on('store.delete', ($, e) => (delete store[e.key], { value: undefined }) as never)
  on('store.keys', () => ({ value: Object.keys(store) }))
  on('session.id', () => ({ value: world.id ? world.id() : 'esta' }))
  on('session.info', () => ({ value: { transcriptPath: '', platform: world.platform ?? 'macos' } }) as never)
  on('audio.play', ($, e) => {
    const { clip, gain } = e as never as { clip: { base64: string; mime: string }; gain?: number }
    played.push({ base64: clip.base64, mime: clip.mime, gain })
    return { value: undefined } as never
  })
  on('command.register', () => ({ value: { command: 'legends-claude' } }))
  on('session.model', () => ({ value: world.model ?? 'claude-fable-5-2' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [], cost: { usd: world.cost?.() ?? 0 } } }) as never)
  on('agent.list', () => ({ value: world.listed?.() ?? [] }) as never)
  on('config.list', () => ({ value: [{ key: 'theme', value: 'dark' }] }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('tool.call', () => (world.run?.() ?? { result: {} }) as never)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true } as never)
  return { store, played }
}

const measure = (usd: number, rateLimits: unknown[] = []) =>
  ({ context: { window: 1_000_000 }, rateLimits, cost: { usd }, changed: ['cost', 'rateLimits'] }) as never
const done = (reason = 'answer', agentId?: string) => ({ answer: '', durationMs: 1, isAborted: reason === 'aborted', turnId: 't1', reason, ...(agentId && { agentId }) }) as never
const stats = async ($: { command: { run: (e: never) => Promise<unknown> } }) =>
  (await $.command.run({ command: 'legends-claude', args: 'stats' } as never)) as { text: string; isTextDisplayOnly?: boolean }
const SPAWN = { tool_use_id: 't1', prompt: 'p', description: 'buscar rotas HLS', subagentType: 'Explore', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-fable-5-2' } as never
const other = (over: Record<string, unknown>) => ({ startedAt: NOW - 3_600_000, updatedAt: NOW - 60_000, bricks: 0, fails: 0, turns: 0, longestTurnMs: 0, mostTools: 0, mostHelpers: 0, lastCost: 0, days: {}, ...over })

test('as contas da sessão: cada ferramenta é um tijolo, e o comando as mostra só para a pessoa', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const answers = [{ result: {} }, { result: 'erro', isError: true, text: 'erro' }, { result: {} }]
  const { store } = await startSession($, on, { run: () => answers.shift() })
  await $.turn.start({ text: 'oi', turnId: 't1' })
  for (const tool of ['Read', 'Bash', 'Edit']) await $.tool.call({ tool } as never)
  await clock.advance(90_000)
  await $.session.measure(measure(1.25))
  await $.turn.complete(done())
  await clock.settle()

  const report = await stats($)
  expect(report.isTextDisplayOnly).toBe(true) // as contas não vão para o modelo
  expect(report.text.split('\n')).toEqual([
    'estatísticas',
    'esta sessão       3 tijolos · 1 falha · 1 turno · $1.25',
    'hoje              $1.25 · 1 sessão',
    `desde ${TODAY}  3 tijolos · 1 falha · 1 turno · 1 sessão · $1.25`,
    'recordes          turno mais longo 1m30s · 3 tools num turno',
  ])
  // o registro da sessão fica no store, na chave dela, para as outras sessões somarem
  expect(store['stats:esta']).toMatchObject({ bricks: 3, fails: 1, turns: 1, longestTurnMs: 90_000, mostTools: 3, lastCost: 1.25, days: { [TODAY]: 1.25 } })
  expect((await $.command.run({ command: 'legends-claude', args: 'estatísticas' } as never) as { text: string }).text).toContain('esta sessão')
})

test('o custo de hoje soma as outras sessões, e a barra o mostra ao lado do da sessão', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = await startSession($, on, {
    stored: {
      'stats:outra': other({ bricks: 40, turns: 5, days: { [TODAY]: 8.3, '2026-11-22': 2 } }),
      'stats:ontem': other({ updatedAt: NOW - DAY, bricks: 10, turns: 1, days: { '2026-11-22': 4 } }), // não gastou hoje
    },
  })
  const ui = await $.ui.mount(band())
  await $.session.measure(measure(1.5))
  expect(await ui.find({ type: 'Text', text: /\$1\.50 ▲ sessão · hoje \$9\.80/ })).toBeDefined()
  expect((await stats($)).text).toContain('hoje              $9.80 · 2 sessões')
  expect(Object.keys(store).sort()).toEqual(['settings', 'stats:esta', 'stats:ontem', 'stats:outra'].sort().filter(key => key !== 'stats:esta')) // nada gravado ainda: nenhum turno acabou

  // com o interruptor desligado, o custo do dia sai da barra
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'set-showDayCost' })
  await ui.press({ key: 'set-close' })
  expect(await ui.find({ type: 'Text', text: /hoje/ })).toBeUndefined()
  await ui.unmount()
})

test('sozinha no dia, a sessão não repete o próprio custo como custo de hoje', async ($, on) => {
  mock.clock(on, { now: NOW })
  await startSession($, on)
  const ui = await $.ui.mount(band())
  await $.session.measure(measure(1.5))
  expect(await ui.find({ type: 'Text', text: /\$1\.50 ▲ sessão/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /hoje/ })).toBeUndefined()
  await ui.unmount()
})

test('uma sessão retomada não conta de novo o que já tinha gasto', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  // a sessão volta com $12 na conta, de ontem: a barra a vê pela primeira vez agora
  const { store } = await startSession($, on, { cost: () => 12 })
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.session.measure(measure(12.4))
  await $.turn.complete(done())
  await clock.settle()
  expect(store['stats:esta']).toMatchObject({ lastCost: 12.4 })
  expect(Math.round(((store['stats:esta'] as { days: Record<string, number> }).days[TODAY] ?? 0) * 100)).toBe(40)
})

test('ao abrir, um registro parado há dias entra no total de sempre e sai do store', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = await startSession($, on, {
    stored: {
      stats: { since: NOW - 30 * DAY, sessions: 10, usd: 100, bricks: 1_000, fails: 0, turns: 50, longestTurnMs: 60_000, mostTools: 20, mostHelpers: 1 },
      'stats:velha': other({ startedAt: NOW - 6 * DAY, updatedAt: NOW - 5 * DAY, bricks: 250, fails: 3, turns: 9, longestTurnMs: 842_000, mostTools: 87, mostHelpers: 4, days: { '2026-11-18': 7 } }),
      'stats:recente': other({ bricks: 5, turns: 1, days: { [TODAY]: 1 } }),
      'stats:estragada': 'isto não é um registro',
    },
  })
  expect(store.stats).toMatchObject({ sessions: 11, usd: 107, bricks: 1_250, fails: 3, turns: 59, longestTurnMs: 842_000, mostTools: 87, mostHelpers: 4 })
  expect('stats:velha' in store).toBe(false)
  expect('stats:recente' in store).toBe(true) // ainda pode estar aberta: quem a grava é ela
  expect('stats:estragada' in store).toBe(true) // o que a barra não entende, ela não apaga
  const report = (await stats($)).text
  expect(report).toContain('1.255 tijolos · 12 andares · 3 falhas · 60 turnos · 13 sessões · $108.00')
  expect(report).toContain('recordes          turno mais longo 14m02s · 87 tools num turno · 4 agentes de uma vez')
})

test('sem como saber qual é a sessão, a barra segue sem as contas, e o comando diz isso', async ($, on) => {
  mock.clock(on, { now: NOW })
  await startSession($, on, {
    id: () => {
      throw new Error('sem id')
    },
  })
  const ui = await $.ui.mount(band())
  expect(await ui.find({ type: 'Text', text: /Fable 5\.2/ })).toBeDefined()
  expect((await stats($)).text).toBe('Sem estatísticas nesta sessão: a barra não conseguiu abrir o registro dela.')
  await ui.unmount()
})

test('mudo por padrão: nenhum som toca', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { played } = await startSession($, on)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.agent.spawn(SPAWN)
  await $.turn.complete(done())
  await clock.advance(2_000)
  expect(played).toEqual([])
})

test('com o som ligado: um ajudante que nasce, a fanfarra de um turno que trabalhou, o plim de um turno curto, e a falha', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { played } = await startSession($, on, { settings: { sound: 'baixo' } })
  const heard = () => played.splice(0).map(clip => clip.base64)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.agent.spawn(SPAWN)
  await clock.settle()
  const spawn = heard()
  expect(spawn.length).toBe(1)

  for (const tool of ['Read', 'Bash', 'Edit']) await $.tool.call({ tool } as never)
  await $.turn.complete(done())
  await clock.settle()
  const party = heard()
  expect(party.length).toBe(1)

  await clock.advance(1_000)
  await $.turn.start({ text: 'oi', turnId: 't2' })
  await $.turn.complete(done())
  await clock.settle()
  const plim = heard()
  expect(plim.length).toBe(1)

  await clock.advance(1_000)
  await $.turn.start({ text: 'oi', turnId: 't3' })
  await $.turn.complete(done('error'))
  await clock.settle()
  const fail = heard()
  expect(fail.length).toBe(1)

  // um agente que acaba em erro soa como falha; um que a pessoa interrompeu, não
  await clock.advance(1_000)
  await $.turn.complete(done('error', 'a1'))
  await clock.settle()
  expect(heard()).toEqual(fail)
  await clock.advance(1_000)
  await $.turn.complete(done('aborted', 'a1'))
  await clock.settle()
  expect(heard()).toEqual([])

  await clock.advance(1_000)
  await $.turn.start({ text: 'oi', turnId: 't4' })
  await $.turn.complete(done('aborted')) // uma interrupção é a pessoa quem fez: não precisa de aviso
  await clock.settle()
  expect(heard()).toEqual([])
  // quatro sons diferentes, todos WAV, no volume baixo
  expect(new Set([spawn[0], party[0], plim[0], fail[0]]).size).toBe(4)
  for (const clip of [spawn[0], party[0], plim[0], fail[0]]) expect(clip?.startsWith('UklGR')).toBe(true)
})

test('escolher um volume na aba de ajustes toca uma amostra, no volume escolhido, e fica salvo', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { played, store } = await startSession($, on)
  const ui = await $.ui.mount(band())
  await ui.press({ key: 'settings' })
  expect(await ui.find({ type: 'Text', text: /● mudo/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /só toca no macOS/ })).toBeUndefined() // aqui é macOS
  await ui.press({ key: 'set-sound-alto' })
  await clock.settle()
  expect(played.map(clip => [clip.mime, clip.gain])).toEqual([['audio/wav', 1]])
  expect((store.settings as { sound?: string }).sound).toBe('alto')
  await clock.advance(1_000)
  await ui.press({ key: 'set-sound-baixo' })
  await clock.settle()
  expect(played.at(-1)?.gain).toBe(0.35)
  await clock.advance(1_000)
  await ui.press({ key: 'set-sound-mudo' })
  await clock.settle()
  expect(played.length).toBe(2) // mudo não toca nada, nem a amostra
  await ui.unmount()
})

test('fora do macOS a aba avisa que o som não toca', async ($, on) => {
  mock.clock(on, { now: NOW })
  await startSession($, on, { platform: 'linux' })
  const ui = await $.ui.mount(band())
  await ui.press({ key: 'settings' })
  expect(await ui.find({ type: 'Text', text: /\(só toca no macOS\)/ })).toBeDefined()
  await ui.unmount()
})

test('uma pergunta do Claude à pessoa soa, e um plano à espera de aprovação também; uma ferramenta qualquer, não', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { played } = await startSession($, on, { settings: { sound: 'alto' } })
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  await clock.settle()
  expect(played).toEqual([])
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
  await clock.settle()
  expect(played.length).toBe(1)
  await clock.advance(1_000)
  await $.tool.call({ tool: 'ExitPlanMode', plan: 'p' } as never)
  await clock.settle()
  expect(played.length).toBe(2)
  expect(played[0]?.base64).toBe(played[1]?.base64) // o mesmo som: é com você
})

test('a demonstração toca os sons dela: os ajudantes que nascem e a fanfarra do fim', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { played } = await startSession($, on, { settings: { sound: 'alto', showStage: true } })
  const ui = await $.ui.mount(band())
  await $.command.run({ command: 'legends-claude', args: 'demo' } as never)
  await clock.advance(40_000)
  expect(played.length).toBe(3)
  expect(played[0]?.base64).toBe(played[1]?.base64) // os dois ajudantes
  expect(played[2]?.base64).not.toBe(played[0]?.base64) // e a fanfarra
  await ui.unmount()
})

test('o mascote "por modelo" é o avatar da classe do modelo, e a aba diz quem está em cena', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = await startSession($, on, { model: 'claude-opus-5-5' })
  const ui = await $.ui.mount(band())
  await ui.press({ key: 'settings' })
  expect(await ui.find({ type: 'Text', text: /● Clawd/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /em cena/ })).toBeUndefined() // um avatar fixo já diz quem é
  await ui.press({ key: 'set-avatar-modelo' })
  expect(await ui.find({ type: 'Text', text: /● por modelo/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /em cena: Kratos/ })).toBeDefined() // Opus
  expect((store.settings as { avatar?: string }).avatar).toBe('modelo')
  await ui.press({ key: 'set-avatar-sessao' })
  expect(await ui.find({ type: 'Text', text: /● por sessão/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /em cena: (Pikachu|Mario|Kratos|Elsa)/ })).toBeDefined()
  await ui.unmount()
})

test('com Fable, o mascote "por modelo" é a Elsa, e a dedicatória dela aparece', async ($, on) => {
  mock.clock(on, { now: NOW })
  await startSession($, on, { settings: { avatar: 'modelo' } })
  const ui = await $.ui.mount(band())
  await ui.press({ key: 'settings' })
  expect(await ui.find({ type: 'Text', text: /em cena: Elsa/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /em homenagem à minha filha/ })).toBeDefined()
  await ui.unmount()
})

test('a linha de um agente traz o que a lista do engine sabe dele: o que faz agora, a atividade e o custo', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const listed = [{
    id: 'a1', status: 'running', type: 'Explore', description: 'buscar rotas HLS',
    label: 'lendo os testes do player', cost: { usd: 0.42 }, tokenSamples: [0, 10, 10, 50, 130],
  }]
  await startSession($, on, { listed: () => listed })
  const ui = await $.ui.mount(band(true))
  await clock.advance(2_000) // o nome assenta
  expect(await ui.find({ type: 'Text', text: /Explore.*lendo os testes do player/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▂▁▅█ \d+s · \$0\.42/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /buscar rotas HLS/ })).toBeUndefined() // o resumo de agora toma o lugar da descrição
  await ui.unmount()
})

test('a medição do limite guarda o ritmo, e a barra avisa quando a janela enche antes de zerar', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  await startSession($, on)
  const ui = await $.ui.mount(band(false, 160))
  const fiveHour = (percentUsed: number) => [{ kind: 'five_hour', percentUsed, resetsAt: new Date(NOW + 140 * 60_000).toISOString() }]
  await $.session.measure(measure(1, fiveHour(40)))
  expect(await ui.find({ type: 'Text', text: /5h ▰▰▱▱▱ 40%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /enche/ })).toBeUndefined() // uma leitura só não dá ritmo
  await clock.advance(10 * 60_000)
  await $.session.measure(measure(2, fiveHour(60)))
  expect(await ui.find({ type: 'Text', text: /5h ▰▰▰▱▱ 60% ↻2h10m enche em ~20m/ })).toBeDefined()
  await ui.unmount()
})

test('cem ferramentas fecham um andar: a sessão soa e as contas dizem', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { played } = await startSession($, on, { settings: { sound: 'alto' } })
  await $.turn.start({ text: 'oi', turnId: 't1' })
  for (let i = 0; i < 99; i++) await $.tool.call({ tool: 'Read' } as never)
  await clock.settle()
  expect(played).toEqual([])
  await $.tool.call({ tool: 'Read' } as never)
  await clock.settle()
  expect(played.length).toBe(1)
  expect((await stats($)).text).toContain('100 tijolos · 1 andar')
})
