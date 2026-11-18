import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// As fases de um pedido ao modelo, de ponta a ponta: os trechos que o engine transmite passam pela
// barra sem mudar, e o palco mostra o que cada um diz (pensa, escreve a resposta, monta a chamada de
// uma ferramenta). Aqui o palco é o de texto; os sinais em pixels e em blocos têm os testes em stage.test.ts.

const band = (isWorking = true) =>
  ({
    plugin: 'legends-claude', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isCollapsed: false, isWorking, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 19 }, view: {} },
  }) as never

// O pedido que o engine responderia, trecho a trecho: raciocínio, texto, uma chamada de ferramenta e a parada.
const CHUNKS = [
  { kind: 'thinking', index: 0, text: 'hmm' },
  { kind: 'text', index: 1, text: 'Vou ler o arquivo.' },
  { kind: 'tool', index: 2, id: 'call-1', name: 'Read' },
  { kind: 'input', index: 2, json: '{"file_path":"a.ts"}' },
  { kind: 'stop', stopReason: 'tool_use', usage: null },
] as const
const STEP = { turnId: 't1', index: 0, model: 'claude-fable-5-2', effort: 'high', messageCount: 1 } as const

// O mundo abaixo de uma sessão iniciada, com o palco de texto. O passo do modelo é registrado antes da
// primeira chamada em $, como o engine o teria.
// `broken`: o passo quebra depois de tantos trechos, como uma resposta que a API corta no meio.
const startSession = async (
  $: { session: { start: (e: never) => Promise<unknown> } }, on: On, settings: Record<string, unknown> = {}, broken?: { after: number; message: string },
) => {
  mock.env(on, { LANG: 'pt_BR.UTF-8' })
  const store: Record<string, unknown> = { settings: { resolution: 'classica', ...settings } }
  on('turn.step', async function* ($, e) {
    for (const [i, chunk] of CHUNKS.entries()) {
      if (broken && i === broken.after) throw new Error(broken.message)
      yield chunk as never
    }
    return { turnId: e.turnId, index: e.index, answer: 'Vou ler o arquivo.', toolUses: [{ name: 'Read', input: {} }], stopReason: 'tool_use', usage: null } as never
  })
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
}

const TYPING = /●/ // os pontinhos de quem escreve
const DRAFT = /Read/ // o nome da ferramenta cuja chamada é montada
// A faísca de quem pensa: um glifo da classe do modelo (aqui Fable), sozinho e em negrito. Uma estrela
// do ar usa um desses glifos, mas sem negrito; a faísca do cabeçalho leva um espaço depois.
const SPARK = /^[✧✦✪❂❉]$/

type Drawing = { find: (query: never) => Promise<unknown>; findAll: (query: never) => Promise<{ props: Record<string, unknown> }[]> }
/** O sinal sobre a cabeça do mascote, pelo que a barra desenhou: pensa, escreve, monta uma chamada, ou nenhum. */
const signOf = async (ui: Drawing) => {
  const shows = async (sign: RegExp) => (await ui.find({ type: 'Text', text: sign } as never)) !== undefined
  const isThinking = (await ui.findAll({ type: 'Text', text: SPARK } as never)).some(text => text.props.bold === true)
  return { thinks: isThinking, writes: await shows(TYPING), drafts: await shows(DRAFT) }
}
const THINKS = { thinks: true, writes: false, drafts: false }
const WRITES = { thinks: false, writes: true, drafts: false }
const DRAFTS = { thinks: false, writes: false, drafts: true }
const NO_SIGN = { thinks: false, writes: false, drafts: false }

test('os trechos do pedido passam pela barra sem mudar, e o resultado também', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const stream = $.turn.step(STEP)
  const seen: unknown[] = []
  // lido à mão, para ver também o que o fluxo devolve no fim: a resposta inteira do passo
  let read = await stream.next()
  while (!read.done) {
    seen.push(read.value)
    read = await stream.next()
  }
  expect(seen).toEqual([...CHUNKS])
  expect(read.value).toMatchObject({ stopReason: 'tool_use', answer: 'Vou ler o arquivo.', toolUses: [{ name: 'Read' }] })
})

test('o palco mostra o que o pedido faz: pensa, escreve a resposta, monta a chamada da ferramenta', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band())
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(3_000) // o mascote entra e chega ao meio da pista
  expect(await signOf(ui)).toEqual(NO_SIGN) // sem pedido em curso, sinal nenhum

  const stream = $.turn.step(STEP)
  await stream.next() // raciocínio: a faísca de quem pensa
  await clock.advance(125)
  expect(await signOf(ui)).toEqual(THINKS)

  await stream.next() // texto: os pontinhos de quem escreve
  await clock.advance(125)
  expect(await signOf(ui)).toEqual(WRITES)

  await stream.next() // o começo da chamada: o nome da ferramenta
  await clock.advance(125)
  expect(await signOf(ui)).toEqual(DRAFTS)

  await stream.next() // os argumentos dela: a fase segue a mesma
  await clock.advance(125)
  expect(await signOf(ui)).toEqual(DRAFTS)

  while (!(await stream.next()).done) void 0
  await clock.advance(125)
  expect(await signOf(ui)).toEqual(NO_SIGN) // o pedido acabou e a ferramenta ainda não começou
  await ui.unmount()
})

test('um pedido largado no meio não deixa o mascote escrevendo', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band())
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(3_000)
  const stream = $.turn.step(STEP)
  await stream.next()
  await stream.next()
  await clock.advance(125)
  expect(await signOf(ui)).toEqual(WRITES)
  await stream.return(undefined as never) // quem lia parou de ler: a interrupção de um turno
  await clock.advance(125)
  expect(await signOf(ui)).toEqual(NO_SIGN)
  await ui.unmount()
})

test('um pedido que quebra no meio não deixa o mascote escrevendo, e o erro segue para quem lia', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on, {}, { after: 2, message: 'a API caiu' })
  const ui = await $.ui.mount(band())
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(3_000)
  const stream = $.turn.step(STEP)
  await stream.next()
  await stream.next()
  await clock.advance(125)
  expect(await signOf(ui)).toEqual(WRITES)
  // o kit dá o passo que quebrou como ausente e diz que nada respondeu: o que importa é a leitura falhar
  const outcome = await stream.next().then(() => 'seguiu', () => 'falhou')
  expect(outcome).toBe('falhou')
  await clock.advance(125)
  expect(await signOf(ui)).toEqual(NO_SIGN)
  await ui.unmount()
})

test('um pedido novo começa pensando, mesmo com outro ainda no meio de uma chamada', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on)
  const ui = await $.ui.mount(band())
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(3_000)
  const first = $.turn.step(STEP)
  for (const _ of [1, 2, 3]) await first.next() // raciocínio, texto e o começo da chamada
  await clock.advance(125)
  expect(await signOf(ui)).toEqual(DRAFTS)
  const second = $.turn.step({ ...STEP, index: 1, messageCount: 3 })
  await second.next() // o raciocínio do segundo pedido
  await clock.advance(125)
  expect(await signOf(ui)).toEqual(THINKS)
  await first.next() // os argumentos da chamada do primeiro seguem chegando: não trazem a fase dele de volta
  await clock.advance(125)
  expect(await signOf(ui)).toEqual(THINKS)
  while (!(await first.next()).done) void 0
  await clock.advance(125)
  expect(await signOf(ui)).toEqual(THINKS) // o segundo segue em curso
  while (!(await second.next()).done) void 0
  await clock.advance(125)
  expect(await signOf(ui)).toEqual(NO_SIGN)
  await ui.unmount()
})

test('com o palco desligado os trechos passam do mesmo jeito', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  await startSession($, on, { showStage: false })
  const ui = await $.ui.mount(band())
  await $.turn.start({ text: 'oi', turnId: 't1' })
  const seen: unknown[] = []
  for await (const chunk of $.turn.step(STEP)) seen.push(chunk)
  expect(seen).toEqual([...CHUNKS])
  expect(await ui.find({ type: 'Text', text: TYPING })).toBeUndefined()
  await ui.unmount()
})
