import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { unpackCells } from './blocks'
import type { Cell } from './blocks'

// O palco fora do texto, de ponta a ponta: em blocos e em pixels no terminal, em vetor no app desktop,
// repintado entre os quadros, e a resolução escolhida nos ajustes. O palco de texto tem os seus testes
// em card.test.tsx.

const COLUMNS = 120
const STAGE_COLUMNS = COLUMNS - 1 // a barra deixa uma coluna de folga à direita
const CLAUDE = 0xd97757
const NO_PIXELS = 'the Image draws its alt here: the terminal draws neither kitty placeholder images (probe: no) nor iTerm2 inline images (probe: no)'

const band = (surface: 'terminal' | 'desktop', isWorking = true, maxRows = 20, bodyColumns = COLUMNS) =>
  ({
    plugin: 'legends-claude', surface, component: 'AbovePrompt',
    props: { hasSurvey: false, isCollapsed: false, isWorking, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows - 1 }, view: {} },
  }) as never

// O mundo abaixo de uma sessão iniciada. Sem ajustes salvos: uma instalação nova, com a resolução automática.
const startSession = async ($: { session: { start: (e: never) => Promise<unknown> } }, on: On, store: Record<string, unknown> = {}) => {
  mock.env(on, { LANG: 'pt_BR.UTF-8' })
  const saved: unknown[] = []
  on('store.get', ($, e) => ({ value: store[e.key] }) as never)
  on('store.set', ($, e) => ((store[e.key] = e.value), saved.push(e.value), { value: undefined }) as never)
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
  return { saved }
}

/** Um pedido de pintura como o mod o faz: do palco (células ou imagem) ou da imagem de sondagem. */
type Blit = { requestId: string; key: string; cells?: string; source?: { png?: string }; columns?: number; rows?: number }

// O terminal respondendo às pinturas: guarda cada pedido e responde o que o teste disser (aceita, se não disser).
const answerBlits = (on: On, answer: (blit: Blit) => { deny?: string; fix?: string } = () => ({})) => {
  const blits: Blit[] = []
  on('ui.blit', ($, e) => {
    const blit = e as unknown as Blit
    blits.push(blit)
    return { value: answer(blit) } as never
  })
  return blits
}

// Um terminal que não desenha imagens: recusa a de sondagem como o Claude Code recusa, e aceita as células.
const withoutPixels = (blit: Blit) => (blit.source ? { deny: NO_PIXELS } : {})

type Found = { props: Record<string, unknown> } | undefined
const cellsOf = (raster: Found): Cell[] => unpackCells(String(raster?.props.cells ?? ''))
const rowText = (cells: Cell[], row: number) => cells.slice(row * STAGE_COLUMNS, (row + 1) * STAGE_COLUMNS).map(c => String.fromCodePoint(c.code)).join('')
const BLOCKS = /[▀▄█▌▐▘▝▖▗▛▜▙▟▚▞]/

test('num terminal que não desenha imagens o palco sai em blocos, com o placar e o chão em texto', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  answerBlits(on, withoutPixels)
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(2_500) // o mascote entra e chega ao meio da pista

  const raster = await ui.find({ type: 'Raster', key: 'stage' })
  expect(raster?.props.columns).toBe(STAGE_COLUMNS)
  expect(raster?.props.rows).toBe(4)
  const cells = cellsOf(raster)
  expect(cells.length).toBe(STAGE_COLUMNS * 4)
  expect(cells.some(c => c.fg === CLAUDE || c.bg === CLAUDE)).toBe(true) // o corpo do mascote, na cor de destaque
  expect(BLOCKS.test(rowText(cells, 1) + rowText(cells, 2))).toBe(true)
  expect(/\ds$/.test(rowText(cells, 0).trimEnd())).toBe(true) // o placar do turno, no canto
  expect(rowText(cells, 3)).toContain('─') // a pista
  expect(rowText(cells, 3)).toContain('═') // e a esteira
  // o palco de texto não é desenhado junto, nem a linha de trabalho: o placar já está no palco
  expect(await ui.find({ type: 'Text', text: BLOCKS })).toBeUndefined()
  expect(await ui.find({ type: 'Image', key: 'stage' })).toBeUndefined()
  await ui.unmount()
})

test('a imagem de sondagem pergunta uma vez se o terminal desenha imagens, e some com a resposta', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const blits = answerBlits(on, withoutPixels)
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal', false))
  const probe = await ui.find({ type: 'Image', key: 'probe' })
  expect(probe?.props.columns).toBe(1)
  expect(probe?.props.rows).toBe(1)
  expect(probe?.props.alt).toBe(' ') // onde a imagem não é desenhada, um espaço: nada aparece
  expect(blits.length).toBe(0) // ainda não perguntou: espera a imagem chegar à tela
  await clock.advance(200)
  expect(blits.map(b => b.key)).toEqual(['probe'])
  expect(await ui.find({ type: 'Image', key: 'probe' })).toBeUndefined() // respondido: a imagem de sondagem sai
  await clock.advance(10_000)
  expect(blits.length).toBe(1) // e não pergunta de novo
  await ui.unmount()
})

test('num terminal que desenha imagens o palco sai em pixels, e o placar volta para a linha de trabalho', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  answerBlits(on) // aceita tudo: a imagem de sondagem e as do palco
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await clock.advance(200) // a sondagem responde que sim
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(2_500)

  const image = await ui.find({ type: 'Image', key: 'stage' })
  expect(image?.props.columns).toBe(STAGE_COLUMNS)
  expect(image?.props.rows).toBe(4)
  expect(String((image?.props.source as { png?: string } | undefined)?.png).startsWith('iVBORw0KGgo')).toBe(true) // um PNG
  expect(image?.props.alt).toBe('O palco: o mascote leva os tijolos das ferramentas até a parede.')
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: BLOCKS })).toBeUndefined()
  // uma imagem não leva texto: o tempo do turno aparece na linha de trabalho, abaixo do palco
  expect(await ui.find({ type: 'Text', text: /^ 2s$/ })).toBeDefined()
  await ui.unmount()
})

test('entre dois quadros o palco é repintado no lugar, e cada pintura mostra a cena mais adiante', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const blits = answerBlits(on, withoutPixels)
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await clock.advance(200)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(1_000) // o mascote vem entrando
  const before = blits.filter(b => b.key === 'stage').length
  await clock.advance(1_000)
  const painted = blits.filter(b => b.key === 'stage').slice(before)
  // oito quadros por segundo, e perto de três pinturas em cada um
  expect(painted.length).toBeGreaterThan(16)
  expect(painted.every(b => b.columns === STAGE_COLUMNS && b.rows === 4 && unpackCells(b.cells ?? '').length === STAGE_COLUMNS * 4)).toBe(true)
  // o mascote anda: as pinturas não são todas iguais
  expect(new Set(painted.map(b => b.cells)).size).toBeGreaterThan(8)
  await ui.unmount()
})

test('com a cena parada, o palco para de ser repintado', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const blits = answerBlits(on, withoutPixels)
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await clock.advance(200)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(2_000)
  const idle = await $.ui.mount(band('terminal', false))
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await clock.advance(8_000) // a comemoração passa e a cena sai
  expect(await idle.find({ type: 'Raster' })).toBeUndefined()
  const settled = blits.length
  await clock.advance(5_000)
  expect(blits.length).toBe(settled)
  await ui.unmount()
  await idle.unmount()
})

test('se o terminal deixa de desenhar a imagem no meio do caminho, o palco volta aos blocos', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  let hasPixels = true
  answerBlits(on, blit => (hasPixels ? {} : withoutPixels(blit)))
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await clock.advance(200)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(1_000)
  expect(await ui.find({ type: 'Image', key: 'stage' })).toBeDefined()
  hasPixels = false // um tmux sem passthrough entrou no caminho, por exemplo
  await clock.advance(500)
  expect(await ui.find({ type: 'Image', key: 'stage' })).toBeUndefined()
  expect(await ui.find({ type: 'Raster', key: 'stage' })).toBeDefined()
  await ui.unmount()
})

test('numa versão do Claude Code que não repinta, o palco em blocos segue no ritmo dos quadros', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const logged: string[] = []
  on('ui.log', ($, e) => (logged.push(String((e as { text?: unknown }).text ?? e)), { value: undefined }) as never)
  on('ui.blit', () => {
    throw new Error('blit não existe aqui')
  })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(1_000)
  const early = cellsOf(await ui.find({ type: 'Raster', key: 'stage' }))
  await clock.advance(1_500)
  const later = cellsOf(await ui.find({ type: 'Raster', key: 'stage' }))
  expect(early.length).toBe(STAGE_COLUMNS * 4)
  expect(later).not.toEqual(early) // a cena anda, redesenhada com a barra
  expect(await ui.find({ type: 'Image', key: 'probe' })).toBeUndefined() // sem como perguntar, não fica perguntando
  expect(logged.filter(line => /probe|blit/.test(line)).length).toBe(1) // o motivo aparece uma vez, não a cada quadro
  await ui.unmount()
})

test('no app desktop o palco sai em vetor, e o placar fica na linha de trabalho', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const blits = answerBlits(on)
  await startSession($, on)
  const ui = await $.ui.mount(band('desktop'))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(2_500)

  const svg = await ui.find({ type: 'Svg' })
  const source = String(svg?.props.source ?? '')
  expect(source.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${STAGE_COLUMNS * 8} 64"`)).toBe(true)
  expect(source).toContain('fill="#d97757"') // o mascote
  expect(source.length).toBeLessThan(131_072)
  expect(svg?.props.alt).toBe('O palco: o mascote leva os tijolos das ferramentas até a parede.')
  expect(await ui.find({ type: 'Text', text: BLOCKS })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^ 2s$/ })).toBeDefined()
  expect(blits.length).toBe(0) // fora do terminal não há o que repintar nem o que sondar
  await ui.unmount()
})

test('a resolução dos ajustes troca o palco na hora, diz em que ele está saindo, e fica salva', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  answerBlits(on) // um terminal que desenha imagens
  const { saved } = await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await clock.advance(200)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(1_000)
  expect(await ui.find({ type: 'Image', key: 'stage' })).toBeDefined()

  await ui.press({ key: 'settings' })
  expect(await ui.find({ type: 'Text', text: /^resolução/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /em uso: pixels/ })).toBeDefined()
  await ui.press({ key: 'set-resolution-blocos' })
  expect(await ui.find({ type: 'Text', text: /em uso: blocos/ })).toBeDefined()
  expect((saved.at(-1) as { resolution?: string }).resolution).toBe('blocos')
  await ui.press({ key: 'set-close' })
  await clock.advance(250)
  expect(await ui.find({ type: 'Raster', key: 'stage' })).toBeDefined()
  expect(await ui.find({ type: 'Image', key: 'stage' })).toBeUndefined()

  await ui.press({ key: 'settings' })
  await ui.press({ key: 'set-resolution-classica' })
  expect(await ui.find({ type: 'Text', text: /em uso: texto/ })).toBeDefined()
  await ui.press({ key: 'set-close' })
  await clock.advance(250)
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: BLOCKS })).toBeDefined() // o palco de texto de sempre
  expect((saved.at(-1) as { resolution?: string }).resolution).toBe('classica')
  await ui.unmount()
})

test('com a resolução em blocos ou clássica nem se pergunta ao terminal se ele desenha imagens', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const blits = answerBlits(on)
  await startSession($, on, { settings: { resolution: 'blocos' } })
  const ui = await $.ui.mount(band('terminal'))
  expect(await ui.find({ type: 'Image', key: 'probe' })).toBeUndefined()
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(1_000)
  expect(await ui.find({ type: 'Raster', key: 'stage' })).toBeDefined()
  expect(blits.some(b => b.key === 'probe')).toBe(false)
  expect(blits.some(b => b.source !== undefined)).toBe(false)
  await ui.unmount()
})

test('a demonstração roda no palco em blocos como roda no de texto', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  answerBlits(on, withoutPixels)
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal', false))
  await clock.advance(200)
  await $.command.run({ command: 'legends-claude', args: 'demo opus max' } as never)
  await clock.advance(6_000)
  const cells = cellsOf(await ui.find({ type: 'Raster', key: 'stage' }))
  expect(cells.some(c => c.fg === CLAUDE || c.bg === CLAUDE)).toBe(true)
  expect(rowText(cells, 0).trimEnd().endsWith('▶ demonstração')).toBe(true)
  await clock.advance(40_000) // a demonstração termina sozinha e a cena sai
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
})

test('no tamanho grande o palco tem o dobro das linhas e o mundo a metade das colunas', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  answerBlits(on, withoutPixels)
  await startSession($, on, { settings: { size: 'grande' } })
  const ui = await $.ui.mount(band('terminal'))
  await clock.advance(200)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(2_500)
  const raster = await ui.find({ type: 'Raster', key: 'stage' })
  expect(raster?.props.rows).toBe(8)
  expect(raster?.props.columns).toBe(Math.floor(STAGE_COLUMNS / 2) * 2)
  expect(cellsOf(raster).length).toBe(Math.floor(STAGE_COLUMNS / 2) * 2 * 8)
  await ui.unmount()
})

test('sem largura ou altura para o tamanho grande, o palco fica no de sempre, e os ajustes dizem por quê', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  answerBlits(on, withoutPixels)
  await startSession($, on, { settings: { size: 'grande' } })
  for (const [maxRows, columns] of [[20, 100], [10, 120]] as const) {
    const ui = await $.ui.mount(band('terminal', true, maxRows, columns))
    await clock.advance(200)
    await $.turn.start({ text: 'oi', turnId: `t${maxRows}` })
    await clock.advance(2_500)
    const raster = await ui.find({ type: 'Raster', key: 'stage' })
    expect(raster?.props.rows).toBe(4)
    expect(raster?.props.columns).toBe(columns - 1)
    await ui.press({ key: 'settings' })
    expect(await ui.find({ type: 'Text', text: /sem efeito agora/ })).toBeDefined()
    await ui.press({ key: 'set-close' })
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: `t${maxRows}`, reason: 'aborted' } as never)
    await clock.advance(1_000)
    await ui.unmount()
  }
})

test('o tamanho se troca nos ajustes, vale na hora e fica salvo', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  answerBlits(on, withoutPixels)
  const { saved } = await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await clock.advance(200)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(1_000)
  expect((await ui.find({ type: 'Raster', key: 'stage' }))?.props.rows).toBe(4)
  await ui.press({ key: 'settings' })
  expect(await ui.find({ type: 'Text', text: /^tamanho/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /sem efeito agora/ })).toBeUndefined()
  await ui.press({ key: 'set-size-grande' })
  expect((saved.at(-1) as { size?: string }).size).toBe('grande')
  await ui.press({ key: 'set-close' })
  await clock.advance(500)
  expect((await ui.find({ type: 'Raster', key: 'stage' }))?.props.rows).toBe(8)
  await ui.unmount()
})

test('no app desktop o tamanho grande dobra o desenho em vetor', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await startSession($, on, { settings: { size: 'grande' } })
  const ui = await $.ui.mount(band('desktop'))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(2_500)
  const source = String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
  expect(source.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.floor(STAGE_COLUMNS / 2) * 2 * 8} 128"`)).toBe(true)
  await ui.unmount()
})

// ─── O que pode dar errado no meio do caminho ─────────────────────────────────

const stageBlits = (blits: Blit[]) => blits.filter(b => b.key === 'stage').length

test('muitas pinturas recusadas em seguida: o palco descansa um instante e volta a ser repintado', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  let isOffScreen = false
  const blits = answerBlits(on, blit => (blit.source ? { deny: NO_PIXELS } : isOffScreen ? { deny: 'nothing of this plugin is mounted there' } : {}))
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await clock.advance(200)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(1_000)
  isOffScreen = true // algo cobriu a barra: cada pintura volta recusada
  await clock.advance(2_000)
  const refused = stageBlits(blits)
  isOffScreen = false
  await clock.advance(2_500)
  // dois segundos e meio, menos o descanso: bem mais que as oito recusas de cada tentativa
  expect(stageBlits(blits) - refused).toBeGreaterThan(24)
  await ui.unmount()
})

test('com a aba de ajustes aberta o palco não é repintado; fechada, volta a ser', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const blits = answerBlits(on, withoutPixels)
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await clock.advance(200)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(1_000)
  await ui.press({ key: 'settings' })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined() // a aba toma o lugar das linhas, palco incluído
  const opened = stageBlits(blits)
  await clock.advance(2_000)
  expect(stageBlits(blits)).toBe(opened) // nada para repintar: nenhuma pintura recusada à toa
  await ui.press({ key: 'set-close' })
  await clock.advance(1_000)
  expect(stageBlits(blits) - opened).toBeGreaterThan(16)
  await ui.unmount()
})

test('um estouro passageiro numa pintura não desliga a repintura nem vira aviso', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const logged: string[] = []
  const blits: Blit[] = []
  let failing = 0
  on('ui.log', ($, e) => (logged.push(String((e as { text?: unknown }).text ?? e)), { value: undefined }) as never)
  on('ui.blit', ($, e) => {
    const blit = e as unknown as Blit
    blits.push(blit)
    if (failing > 0 && blit.key === 'stage') {
      failing -= 1
      throw new Error('passageiro')
    }
    return { value: withoutPixels(blit) } as never
  })
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await clock.advance(200)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(1_000)
  failing = 2 // duas pinturas seguidas estouram, e passa
  const before = stageBlits(blits)
  await clock.advance(1_000)
  expect(stageBlits(blits) - before).toBeGreaterThan(16)
  expect(logged.filter(line => /blit|paint/.test(line))).toEqual([])
  await ui.unmount()
})

test('o tmux segurando as imagens dá blocos; escolher a resolução automática de novo pergunta outra vez ao terminal', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  let isHeld = true
  const blits = answerBlits(on, blit => (blit.source && isHeld ? { deny: 'tmux holds the image back', fix: 'tmux-passthrough' } : {}))
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await clock.advance(200)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(1_000)
  expect(await ui.find({ type: 'Raster', key: 'stage' })).toBeDefined()
  isHeld = false // o passthrough foi ligado
  await clock.advance(10_000)
  expect(blits.filter(b => b.key === 'probe').length).toBe(1) // sozinho, o mod não fica perguntando
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'set-resolution-auto' })
  await ui.press({ key: 'set-close' })
  await clock.advance(500)
  expect(blits.filter(b => b.key === 'probe').length).toBe(2)
  expect(await ui.find({ type: 'Image', key: 'stage' })).toBeDefined()
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
})

test('a imagem recusada com outras palavras, várias vezes em seguida: o palco volta aos blocos e o terminal é perguntado de novo depois', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  let isOdd = false
  answerBlits(on, blit => (isOdd && blit.key === 'stage' && blit.source ? { deny: 'a refusal this version of the mod has never read' } : {}))
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await clock.advance(200)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(1_000)
  expect(await ui.find({ type: 'Image', key: 'stage' })).toBeDefined()
  isOdd = true
  await clock.advance(1_000)
  expect(await ui.find({ type: 'Image', key: 'stage' })).toBeUndefined() // não fica uma imagem que ninguém vê
  expect(await ui.find({ type: 'Raster', key: 'stage' })).toBeDefined()
  isOdd = false
  await clock.advance(6_000) // passado o descanso, a pergunta volta, e a resposta é sim
  expect(await ui.find({ type: 'Image', key: 'stage' })).toBeDefined()
  await ui.unmount()
})

test('uma sessão que recomeça no meio da pergunta ao terminal não ouve a resposta da anterior, e pergunta a dela', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const blits = answerBlits(on)
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal', false))
  await clock.advance(100) // a pergunta está marcada, ainda não foi feita
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true } as never)
  await clock.advance(100) // a hora da pergunta da sessão anterior passa: ela não é feita
  expect(blits.length).toBe(0)
  await clock.advance(1_000)
  expect(blits.map(b => b.key)).toEqual(['probe'])
  await ui.unmount()
})

test('em blocos, os sinais do palco são caracteres que o terminal aceita numa célula', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  answerBlits(on, withoutPixels)
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await clock.advance(200)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(1_000)
  // As faíscas de todas as classes, os sinais e os traços do chão, postos no placar pelo nome de uma
  // ferramenta: se o terminal recusasse um deles numa célula, a barra inteira deixaria de ser desenhada.
  for (const glyphs of ['·✢✣✤✳✶✻✽', '✸✹✺❋✧✦✪❂❉', '✓✗▶─═╪…!+']) {
    await $.tool.call({ tool: glyphs } as never)
    await clock.advance(250)
    const cells = cellsOf(await ui.find({ type: 'Raster', key: 'stage' }))
    expect(cells.length).toBe(STAGE_COLUMNS * 4)
    expect(rowText(cells, 0)).toContain(glyphs)
  }
  await ui.unmount()
})

test('um nome de ferramenta com um caractere que o terminal recusaria numa célula não derruba a barra', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  answerBlits(on, withoutPixels)
  await startSession($, on)
  const ui = await $.ui.mount(band('terminal'))
  await clock.advance(200)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(1_000)
  await $.tool.call({ tool: 'cafe\u0301 日 ✨' } as never) // um acento solto (largura zero) e dois caracteres largos
  await clock.advance(250)
  const cells = cellsOf(await ui.find({ type: 'Raster', key: 'stage' }))
  expect(cells.length).toBe(STAGE_COLUMNS * 4)
  expect(rowText(cells, 0)).toContain('cafe?')
  expect(await ui.find({ type: 'Text', text: /Fable 5\.2/ })).toBeDefined() // a barra segue de pé
  await ui.unmount()
})
