import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import { LINGER_MS, isExpired, reconcileRows, upsert } from './agents'
import { DEMO_CAST, DEMO_FRAMES, applyDemo } from './demo'
import { BURST_FRAMES, ruleParts } from './effects'
import { clean, prettyModel, shortTool } from './format'
import { hdScene } from './hd'
import type { Zoom } from './hd'
import { localeLanguage, stringsOf } from './i18n'
import type { Strings } from './i18n'
import { BUTTONS_WIDTH, EFFORTS, STAGE_SLOT, cardLines, fromUsage, hudParts } from './lines'
import { askAgain, askPixels, canRepaint, dropStage, resetPainter, watchStage } from './painter'
import type { Host } from './painter'
import { kindOf } from './palette'
import { TAIL_GAP, lineWidth } from './parts'
import type { Line, Part, Switch } from './parts'
import { TIER_NAMES, energyOf, lookOf, powerOf } from './power'
import type { Power } from './power'
import { SCENE_ROWS, sceneRows } from './scene'
import { SettingsPanel } from './settings-panel'
import { EMPTY_SIM, MAIN, begin, blank, enqueue, finish, fold, geometry, halt, hasScene, isAnimating, settle, step, syncHelpers, think } from './sim'
import type { Geo, Sim } from './sim'
import { DEFAULT_SETTINGS, FULL_EFFECTS, accentColor, effectsOf, sanitize } from './settings'
import type { Effects } from './settings'
import { alphaOf, backendOf, zoomOf } from './stage'
import type { Abilities, Backend, Pixels } from './stage'
import { offeredBy, probeNode, stageNode } from './stage-node'
import type {
  StatusAgent as Agent,
  StatusAgentState as AgentState,
  StatusFigures as Figures,
  StatusMain as Main,
  StatusPicker as Picker,
  StatusSettings as Settings,
} from '../types'

const EMPTY: Figures = { model: null, effort: null }
const IDLE: Main = { startedAt: 0, tools: 0, lastTool: null, costAtStart: null }
const NO_AGENTS: Agent[] = []

const figures = atom({ plugin: 'legends-claude', key: 'figures' } as const, EMPTY)
const main = atom({ plugin: 'legends-claude', key: 'main' } as const, IDLE)
const agents = atom({ plugin: 'legends-claude', key: 'agents' } as const, NO_AGENTS)
const frame = atom({ plugin: 'legends-claude', key: 'frame' } as const, 0)
const isHidden = atom({ plugin: 'legends-claude', key: 'isHidden' } as const, false)
const picker = atom({ plugin: 'legends-claude', key: 'picker' } as const, null as Picker)
const settings = atom({ plugin: 'legends-claude', key: 'settings' } as const, DEFAULT_SETTINGS)
// O que o terminal respondeu sobre desenhar imagens; quem pergunta e grava a resposta é o pintor (painter.ts).
const pixels = atom({ plugin: 'legends-claude', key: 'pixels' } as const, 'unknown' as Pixels)
const SETTINGS_KEY = 'settings' // a chave no $.store: os ajustes valem para todas as sessões

const COMMAND = 'legends-claude'
const MIN_COLUMNS = 60 // mais estreito que isso a barra cobriria a conversa: não desenha
const BAR_RIGHT_PAD = 1 // a barra vai de ponta a ponta da faixa, menos essa folga à direita
const HIDDEN_RIGHT_PAD = 5 // livre do [-] que o Claude Code desenha no canto da faixa
const RECONCILE_MS = 1_000 // a lista de agentes do engine é conferida no máximo uma vez por segundo
const FRAME_WRAP = 1_000_000
const FLASH_MS = 1_500 // quanto tempo o custo fica aceso depois de crescer
const HEAL_AFTER_MS = 5_000 // um turno em curso com a faixa dizendo "parada" por esse tempo: o fim dele não foi avisado
const STAGE_MIN_ROWS = SCENE_ROWS + 3 // a régua, o cabeçalho, o palco e ao menos uma linha de folga: menos que isso, sem palco
// Os apelidos que o /model aceita: cada um aponta sempre para a versão mais nova da família.
const MODELS = [
  { value: 'fable', label: 'Fable' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
] as const
// Os sinais da barra, iguais em qualquer idioma. Os textos vêm de i18n.ts, no idioma dos ajustes.
const MARKS = { hide: ' ▾ ', show: '◂ status', settings: ' ⚙ ', current: '● ', close: ' ✕ ' } as const

type Timer = ReturnType<EngineInterface['clock']['every']>

// Variáveis do módulo: um reload zera todas, e os timers do módulo anterior caem junto.
let ticker: Timer | null = null
let isTickBusy = false
let isBandWorking = false
let lastBandColumns = Infinity
let lastZoom: Zoom = 1 // o tamanho do palco no último desenho: a cena anda com as medidas do mundo que ele mostrou
let tickerMs = 0 // a cadência do ticker em curso: muda com a velocidade dos ajustes
let lastReconcileAt = -Infinity
let fx: Effects = FULL_EFFECTS // os efeitos em vigor, lidos dos ajustes
let strings: Strings = stringsOf(DEFAULT_SETTINGS.language) // os textos no idioma em vigor, para o que fala fora do desenho
let sim: Sim = EMPTY_SIM // a cena do palco: anda a cada quadro, recomeça a cada sessão
let shownSim: Sim = EMPTY_SIM // a cena de antes do último passo: o palco em pixels desliza dela para `sim`
let steppedAt = 0 // quando foi o último passo da cena
let demoFrame = -1 // o quadro da demonstração em curso; -1 quando não há
let demoLook: Power | null = null // o poder que a demonstração em curso mostra no mascote, quando foi pedido outro
let isLightTheme = false // o tema do Claude Code é claro: a aura do palco esmaece para branco
let isTurnOn = false // um turno principal está em curso, pelos eventos de início e de fim dele
let quietSince: number | null = null // desde quando a faixa diz "parada" com um turno em curso
const reported = new Set<string>()

// Um erro de fundo aparece uma vez por origem, numa linha discreta: nunca é engolido, nunca vira enxurrada.
const report = ($: EngineInterface, where: string, err: unknown) => {
  if (reported.has(where)) return
  reported.add(where)
  $.ui.log(`legends-claude: ${where}: ${clean(err instanceof Error ? err.message : String(err), 200)}`)
}

const stopTicker = () => {
  ticker?.cancel()
  ticker = null
  tickerMs = 0
}

// A cena troca inteira (recomeça, esvazia, sai de vista): o que havia em cena não fica para ser
// desenhado a caminho da nova.
const setScene = (next: Sim) => {
  sim = next
  shownSim = next
}

// O palco é enfeite: um erro nele nunca pode derrubar uma ferramenta, um turno ou a barra.
// Vira uma cena vazia e uma linha de aviso, uma vez.
const onStage = <T,>($: EngineInterface, run: () => T, fallback: T): T => {
  try {
    return run()
  } catch (err) {
    report($, 'stage', err)
    setScene(isTurnOn ? { ...EMPTY_SIM, isOn: true } : EMPTY_SIM)
    demoFrame = -1
    return fallback
  }
}

// O que a barra empresta a quem repinta o palco entre os quadros: a cena de agora, o aviso e a guarda.
const hostOf = ($: EngineInterface): Host => ({
  tween: () => ({ prev: shownSim, cur: sim, steppedAt, frameMs: fx.frameMs, isRunning: ticker !== null }),
  report: (where, err) => report($, where, err),
  guard: (run, fallback) => onStage($, run, fallback),
})

// O tema é claro quando o nome dele diz ("light", "light-daltonized"); um tema de nome desconhecido vale como escuro.
const isLightName = (value: unknown) => /light/i.test(String(value ?? ''))

// O tema em vigor, lido da linha dele no /config.
async function readTheme($: EngineInterface) {
  try {
    isLightTheme = isLightName((await $.config.list()).find(row => row.key === 'theme')?.value)
  } catch (err) {
    report($, 'theme', err)
  }
}

// O poder de cada um em cena: o do loop principal pelo modelo e effort do cabeçalho (ou o que a
// demonstração pediu), o de cada agente pelos dele, e o do elenco da demonstração.
const powersOf = (f: Figures, list: readonly Agent[]): Map<string, Power> =>
  new Map<string, Power>([
    ...(demoFrame >= 0 ? DEMO_CAST : []),
    ...list.map((a): [string, Power] => [a.id, powerOf(a.model, a.effort)]),
    [MAIN, (demoFrame >= 0 && demoLook) || powerOf(f.model, f.effort)],
  ])

// Há o que animar: o turno, um agente rodando, o estouro de faíscas de quem acabou de terminar,
// a demonstração, ou a cena do palco ainda se mexendo (um tijolo na esteira, o confete caindo).
const hasWork = (list: readonly Agent[], now: number) =>
  isBandWorking || isTurnOn || demoFrame >= 0 || (fx.hasStage && isAnimating(sim)) ||
  list.some(a => a.state === 'running' || (fx.isFull && a.endedAt !== undefined && now - a.endedAt < BURST_FRAMES * fx.frameMs))

// Um quadro da cena: a demonstração marca os seus eventos, os ajudantes acompanham os agentes, tudo anda.
// A cena de antes do passo fica guardada: é dela que o palco em pixels desliza até a nova.
const stepScene = ($: EngineInterface, list: readonly Agent[], now: number) =>
  onStage($, () => {
    // As medidas do mundo são as do último desenho: no tamanho dobrado, as de uma barra com a metade das colunas.
    const geo = fx.hasStage ? geometry(Math.floor((lastBandColumns - BAR_RIGHT_PAD) / lastZoom)) : null
    if (!geo) {
      // Sem lugar para o palco a cena não anda: se guardasse a comemoração ou a demonstração, o relógio nunca pararia.
      setScene(blank(sim))
      demoFrame = -1
      return
    }
    if (demoFrame >= 0) {
      sim = applyDemo(sim, demoFrame)
      demoFrame += 1
    }
    shownSim = syncHelpers(sim, list)
    sim = step(shownSim, geo)
    steppedAt = now
    if (demoFrame > DEMO_FRAMES) {
      demoFrame = -1
      setScene(EMPTY_SIM) // o que a demonstração construiu não fica para a sessão
    } else if (!hasScene(sim)) {
      setScene(fold(sim))
    }
  }, undefined)

// O turno principal acabou: pelo evento de fim, ou porque a faixa diz "parada" há tempo demais.
// Se acabou bem, o mascote comemora; interrompido, com erro ou sem aviso, a cena só se recolhe.
const endTurn = ($: EngineInterface, isHappy: boolean) => {
  isTurnOn = false
  quietSince = null
  onStage($, () => {
    if (sim.isOn && demoFrame < 0) sim = isHappy ? finish(sim) : halt(sim)
  }, undefined)
}

async function reconcile($: EngineInterface, now: number) {
  const listed = await $.agent.list()
  return update($, agents, rows => reconcileRows(rows, listed, now))
}

// Tira do card quem terminou há mais de LINGER_MS; fica marcado de novo enquanto restar alguém terminado.
async function purge($: EngineInterface) {
  try {
    const now = await $.clock.now()
    const rest = await update($, agents, rows => rows.filter(a => !isExpired(a, now)))
    if (!ticker && rest.some(a => a.endedAt !== undefined)) $.clock.after(LINGER_MS, () => void purge($))
  } catch (err) {
    report($, 'purge', err)
  }
}

// Um quadro: avança a animação, confere os agentes a cada segundo e para quando não há mais trabalho.
async function tick($: EngineInterface) {
  if (isTickBusy) return
  isTickBusy = true
  try {
    const now = await $.clock.now()
    const isDue = now - lastReconcileAt >= RECONCILE_MS
    if (isDue) lastReconcileAt = now
    const list = isDue ? await reconcile($, now) : await read($, agents)
    // Um turno cujo fim não foi avisado (um erro no evento dele): a faixa diz "parada" e o turno segue "em curso".
    if (isTurnOn && !isBandWorking) {
      quietSince ??= now
      if (now - quietSince >= HEAL_AFTER_MS) endTurn($, false)
    } else {
      quietSince = null
    }
    stepScene($, list, now)
    await update($, frame, f => (f + 1) % FRAME_WRAP) // por último: o redesenho já vê a cena deste quadro
    if (hasWork(list, now)) return
    stopTicker()
    if (list.length) $.clock.after(LINGER_MS, () => void purge($))
  } catch (err) {
    report($, 'tick', err)
  } finally {
    isTickBusy = false
  }
}

// Um ticker só, na cadência dos ajustes: trocar a velocidade troca o ticker em curso.
const ensureTicker = ($: EngineInterface) => {
  if (ticker && tickerMs === fx.frameMs) return
  stopTicker()
  tickerMs = fx.frameMs
  ticker = $.clock.every(fx.frameMs, () => void tick($))
}

async function touchAgent($: EngineInterface, id: string, fn: (a: Agent, now: number) => Agent) {
  const now = await $.clock.now()
  await update($, agents, rows => upsert(rows, id, now, a => fn(a, now)))
  ensureTicker($)
}

// Uma chamada de ferramenta: conta para o agente que a fez, ou para o turno principal.
async function noteTool($: EngineInterface, agentId: string | undefined, tool: string) {
  try {
    const lastTool = shortTool(tool)
    if (agentId) await touchAgent($, agentId, (a, now) => ({ ...a, tools: a.tools + 1, lastTool, seenAt: now }))
    else await update($, main, m => ({ ...m, tools: m.tools + 1, lastTool }))
  } catch (err) {
    report($, 'tool.call', err)
  }
}

// Um clique num item do seletor: roda /model ou /effort como se a pessoa tivesse digitado. O comando
// entra na fila e roda quando a sessão fica ociosa; a troca é a da sessão, não um desvio do mod.
async function switchTo($: EngineInterface, command: Switch, value: string) {
  try {
    await update($, picker, () => null)
    await $.command.run({ command, args: value })
    const model = await $.session.model()
    await update($, figures, f => ({ ...f, model: model || f.model, ...(command === 'effort' && { effort: value }) }))
  } catch (err) {
    $.ui.toast(strings.switchFailed(command, clean(err instanceof Error ? err.message : String(err), 120)))
  }
}

// O idioma em vigor: os textos dos avisos e o que o comando mostra no menu (registrar de novo substitui).
async function speak($: EngineInterface, language: Settings['language']) {
  strings = stringsOf(language)
  await $.command.register({ name: COMMAND, description: strings.commandDescription, argumentHint: strings.argumentHint })
}

// Os ajustes desta sessão: os salvos, conferidos campo a campo. Quando nenhum idioma foi salvo:
// quem já tinha ajustes de antes de haver idiomas continua em português, a única língua da barra até
// então; numa instalação nova, vale o idioma do sistema.
async function loadSettings($: EngineInterface): Promise<Settings> {
  const stored = await $.store.get(SETTINGS_KEY)
  if (stored && typeof stored === 'object') return sanitize(stored)
  const locales = await Promise.all([$.env.get('LC_ALL'), $.env.get('LC_MESSAGES'), $.env.get('LANG')]).catch(() => [])
  return sanitize(undefined, localeLanguage(...locales))
}

// Uma mudança na aba de ajustes: vale na hora nesta sessão e fica salva para as próximas.
async function applySettings($: EngineInterface, change: (s: Settings) => Settings) {
  try {
    const next = await update($, settings, s => sanitize(change(s), s.language))
    fx = effectsOf(next)
    if (stringsOf(next.language) !== strings) await speak($, next.language)
    if (!fx.hasStage) {
      setScene(EMPTY_SIM)
      demoFrame = -1
    } else if (isTurnOn && !sim.isOn) {
      sim = begin(sim) // o palco voltou no meio de um turno: a cena entra agora
    }
    if (ticker) ensureTicker($) // a velocidade pode ter mudado
    await $.store.set(SETTINGS_KEY, next)
  } catch (err) {
    $.ui.toast(strings.saveFailed(clean(err instanceof Error ? err.message : String(err), 120)))
  }
}

// A demonstração: um turno de mentira no palco. Só com a sessão parada e o palco ligado. `look` pede
// outra aparência para o mascote ("opus max", "haiku"): sem ele, vale o modelo e o effort da sessão.
async function startDemo($: EngineInterface, look = ''): Promise<string> {
  const words = look.trim()
  // A única espera antes de marcar a cena: as conferências vêm depois dela, para valerem no instante em que a cena entra.
  const f = await read($, figures)
  if (isBandWorking || isTurnOn) return strings.demoBusy
  if (!fx.hasStage) return strings.demoOff
  if (lastBandColumns < MIN_COLUMNS) return strings.demoNarrow(MIN_COLUMNS)
  const asked = words ? lookOf(words, powerOf(f.model, f.effort)) : null
  if (words && !asked) return strings.demoUnknown(clean(words, 40))
  // A cena é marcada antes de qualquer outra espera: um turno de verdade que comece no meio encontra a demonstração e a encerra.
  setScene(EMPTY_SIM)
  demoFrame = 0
  demoLook = asked
  await update($, isHidden, () => false)
  await update($, picker, () => null)
  if (demoFrame >= 0) ensureTicker($)
  return asked ? strings.demoAs(TIER_NAMES[asked.tier], EFFORTS[asked.level] ?? '') : strings.demo
}

// A pessoa escolheu a resolução automática de novo: se o terminal tinha dito que não desenha imagens
// (um tmux sem passthrough, já corrigido, por exemplo), pergunta-se outra vez.
async function recheckPixels($: EngineInterface) {
  try {
    askAgain()
    await update($, pixels, known => (known === 'no' ? 'unknown' : known))
  } catch (err) {
    report($, 'pixels', err)
  }
}

/** O que um desenho da barra sabe do palco: em que ele sai, as medidas, o placar, o poder de cada um, os ajustes e a hora. */
type StageInput = {
  backend: Backend
  /** O que o terminal respondeu sobre desenhar imagens. */
  known: Pixels
  /** O palco está à vista: não com a barra recolhida, nem com a aba de ajustes no lugar das linhas. */
  isShown: boolean
  geo: Geo | null
  zoom: Zoom
  hud: Part[]
  powers: ReadonlyMap<string, Power>
  settings: Settings
  strings: Strings
  now: number
}
/**
 * O palco de um desenho: em que ele sai nesta tela, o elemento dele (uma imagem, uma grade de blocos,
 * um SVG) ou, sem elemento, as linhas de texto de sempre; e a imagem de sondagem, quando é hora dela.
 */
type StageDraw = { backend: Backend; node: RenderElement | null; lines: Line[]; probe: RenderElement | null }
type BandInput = { surface: string; requestId: string }

// O palco deste desenho. No terminal a cena em pixels ou em blocos segue a caminho entre dois quadros,
// e quem repinta completa o caminho; fora dele (ou sem como repintar) mostra o quadro inteiro. Se a
// tela não tem como desenhar o elemento, ficam as linhas de texto. Só um palco à vista é repintado: o
// que não está na tela recusaria cada pintura.
function drawStage($: EngineInterface, e: BandInput, table: object, { backend, known, isShown, geo, zoom, hud, powers, settings: s, strings: t, now }: StageInput): StageDraw {
  const isTerminal = e.surface === 'terminal'
  if (!isShown) {
    if (isTerminal) dropStage()
    return { backend, node: null, lines: [], probe: null }
  }
  const look = { isLight: isLightTheme, accent: accentColor(s) }
  const alpha = isTerminal && canRepaint() ? alphaOf(now, steppedAt, fx.frameMs) : 1
  const scene = geo && hasScene(sim) && backend !== 'text'
    ? onStage($, () => hdScene({ prev: shownSim, cur: sim, alpha, geo, hud, powers, ...look, trace: backend === 'raster' ? 'blocks' : 'pixels', zoom }), null)
    : null
  const node = scene ? onStage($, () => stageNode(table, backend, scene, look, t.stageAlt), null) : null
  if (isTerminal) {
    if (node && scene && geo && (backend === 'image' || backend === 'raster'))
      watchStage($, { requestId: e.requestId, backend, columns: scene.columns, rows: scene.rows }, { geo, zoom, hud, powers, look }, hostOf($), now)
    else dropStage()
  }
  // Enquanto não se sabe se o terminal desenha imagens, uma imagem de sondagem vai no canto da barra.
  const probe = isTerminal && s.resolution === 'auto' && known === 'unknown' && canRepaint() ? probeNode(table) : null
  if (probe) askPixels($, e.requestId, now, (where, err) => report($, where, err))
  const lines = node || !geo || !hasScene(sim) ? [] : onStage($, () => sceneRows({ sim, geo, hud, powers, isLight: isLightTheme }).map(parts => ({ parts })), [])
  return { backend, node, lines, probe }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      isBandWorking = false
      isTurnOn = false
      quietSince = null
      setScene(EMPTY_SIM)
      resetPainter()
      demoFrame = -1
      // Os ajustes salvos valem antes do primeiro desenho; um valor estragado volta ao padrão campo a campo.
      const initial = await loadSettings($).catch(err => (report($, 'settings', err), DEFAULT_SETTINGS))
      const loaded = await update($, settings, () => initial)
      fx = effectsOf(loaded)
      await speak($, loaded.language) // registra o comando, já no idioma dos ajustes
      await readTheme($)
      const model = await $.session.model()
      const usage = fromUsage(await $.session.usage())
      await update($, figures, f => ({ ...f, ...usage, model: model || f.model }))
      // O que o módulo anterior deixou (o estado sobrevive ao reload) é conferido com o engine.
      const startedAt = await $.clock.now()
      const list = await reconcile($, startedAt)
      if (hasWork(list, startedAt)) ensureTicker($)
      else if (list.length) $.clock.after(LINGER_MS, () => void purge($))
    } catch (err) {
      report($, 'session.start', err)
    }
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    if (/^\s*(ajustes|settings|config)\s*$/i.test(e.args)) {
      await update($, isHidden, () => false)
      await update($, picker, () => 'settings')
      return { text: strings.opened }
    }
    const demo = /^\s*demo\S*(\s.*)?$/i.exec(e.args) // "demo", "demonstração", "demonstration"; o resto é a aparência pedida
    if (demo) return { text: await startDemo($, demo[1]) }
    const hidden = await update($, isHidden, h => !h)
    if (hidden) return { text: strings.hidden }
    return { text: lastBandColumns < MIN_COLUMNS ? strings.tooNarrow(MIN_COLUMNS) : strings.shown }
  })

  on('turn.start', async ($, e, next) => {
    try {
      if (e.agentId) {
        // Um agente que volta a rodar (acordado por uma mensagem) recomeça a contagem.
        await touchAgent($, e.agentId, (a, now) => ({
          ...a, state: 'running', seenAt: now, endedAt: undefined, tokens: undefined,
          ...(a.endedAt !== undefined && { startedAt: now, tools: 0, lastTool: null }),
        }))
      } else {
        isBandWorking = true
        isTurnOn = true
        quietSince = null
        // Um turno de verdade encerra a demonstração e abre a cena dele.
        onStage($, () => {
          if (demoFrame >= 0) setScene(EMPTY_SIM)
          demoFrame = -1
          if (fx.hasStage) sim = begin(sim)
        }, undefined)
        const now = await $.clock.now()
        const costAtStart = (await read($, figures)).costUsd ?? 0
        await update($, main, () => ({ startedAt: now, tools: 0, lastTool: null, costAtStart }))
        ensureTicker($)
      }
    } catch (err) {
      report($, 'turn.start', err)
    }
    return next(e)
  })

  // O modelo e o effort de cada pedido: do loop principal para o cabeçalho, de um agente para a linha dele.
  on('turn.step', async function* ($, e, next) {
    try {
      const effort = e.effort === undefined ? null : String(e.effort)
      if (e.agentId) {
        const row = (await read($, agents)).find(a => a.id === e.agentId)
        if (row?.model !== e.model || (row.effort ?? null) !== effort)
          await touchAgent($, e.agentId, (a, now) => ({ ...a, model: e.model, effort, seenAt: now }))
      } else {
        const f = await read($, figures)
        if (f.model !== e.model || f.effort !== effort) await update($, figures, g => ({ ...g, model: e.model, effort }))
      }
    } catch (err) {
      report($, 'turn.step', err)
    }
    // Enquanto o pedido ao modelo está em curso, quem o fez está pensando.
    const who = e.agentId ?? MAIN
    onStage($, () => void (sim = think(sim, who, true)), undefined)
    try {
      return yield* next(e)
    } finally {
      onStage($, () => void (sim = think(sim, who, false)), undefined)
    }
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    try {
      if (result.agentId) {
        const model = result.model
        await touchAgent($, result.agentId, (a, now) => ({
          ...a, type: clean(e.subagentType, 40) || a.type, description: clean(e.description, 120), model, seenAt: now,
        }))
      }
    } catch (err) {
      report($, 'agent.spawn', err)
    }
    return result
  })

  // Cada chamada de ferramenta conta na barra e vira um tijolo no palco, de quem a fez.
  on('tool.call', async ($, e, next) => {
    const who = e.agentId ?? MAIN
    const tool = String(e.tool)
    void noteTool($, e.agentId, tool) // sem esperar: a chamada não fica atrás da barra
    onStage($, () => {
      if (fx.hasStage && demoFrame < 0 && (who !== MAIN || sim.isOn)) sim = enqueue(sim, who, kindOf(tool), shortTool(tool))
    }, undefined)
    try {
      return await next(e) // o tempo da ferramenta não conta no orçamento deste hook
    } finally {
      onStage($, () => void (sim = settle(sim, who)), undefined)
    }
  })

  on('turn.complete', async ($, e, next) => {
    try {
      return await next(e)
    } finally {
      // Mesmo que o que está abaixo falhe, o turno acabou: a barra e a cena têm de saber.
      try {
        if (e.agentId) {
          const state: AgentState = e.isAborted || e.reason === 'error' ? 'failed' : 'done'
          const u = e.usage
          const tokens = u ? u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens : undefined
          await touchAgent($, e.agentId, (a, now) => ({ ...a, state, endedAt: now, seenAt: now, tokens }))
        } else {
          isBandWorking = false
          endTurn($, e.reason === 'answer' && !e.isAborted) // só uma resposta de verdade merece festa
          ensureTicker($) // os próximos quadros veem que o trabalho acabou, redesenham e param
        }
      } catch (err) {
        report($, 'turn.complete', err)
      }
    }
  })

  on('session.measure', async ($, e, next) => {
    try {
      const usage = fromUsage(e)
      const hasCostMoved = e.changed.includes('cost')
      const now = hasCostMoved ? await $.clock.now() : undefined
      await update($, figures, f => ({ ...f, ...usage, ...(now !== undefined && { costMovedAt: now }) }))
      // Fora de um turno ninguém redesenha sozinho: um quadro a mais apaga o destaque do custo.
      if (hasCostMoved) $.clock.after(FLASH_MS + 50, () => void update($, frame, f => (f + 1) % FRAME_WRAP).catch(err => report($, 'flash', err)))
    } catch (err) {
      report($, 'session.measure', err)
    }
    return next(e)
  })

  // O tema trocado no /config: a aura do palco passa a esmaecer para o fundo novo.
  on('config.set', { key: 'theme' }, async (_, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) isLightTheme = isLightName(result.value)
    return result
  })

  // A faixa acima do prompt vira uma barra na largura toda.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    lastBandColumns = e.props.bodyColumns
    isBandWorking = e.props.isWorking
    const isTerminal = e.surface === 'terminal'
    if (e.props.hasSurvey || e.props.bodyColumns < MIN_COLUMNS) {
      if (isTerminal) dropStage() // sem barra não há palco no terminal para repintar
      return next(e)
    }
    const table = $.ui.resolve(e)
    const { Box, Button, Text } = table
    // O que os plugins abaixo desenharam aqui fica, acima do card.
    const below = await next(e).catch(() => null)
    const withBelow = (ours: RenderElement): RenderElement => (below ? <Box flexDirection="column">{below}{ours}</Box> : ours)
    const setHidden = (hidden: boolean) => update($, isHidden, () => hidden)

    if (await read($, isHidden)) {
      if (isTerminal) dropStage()
      return withBelow(
        <Box justifyContent="flex-end" paddingRight={HIDDEN_RIGHT_PAD}>
          <Button key="show" label={MARKS.show} dimColor onPress={() => setHidden(false)} />
        </Box>,
      )
    }

    const list = await read($, agents)
    const now = await $.clock.now()
    const isActive = hasWork(list, now)
    if (isActive) ensureTicker($)
    // A barra ocupa a faixa toda, de ponta a ponta.
    const width = e.props.bodyColumns - BAR_RIGHT_PAD
    const f = await read($, figures)
    const s = await read($, settings)
    const fr = await read($, frame)
    const m = await read($, main)
    // O idioma e os efeitos saem dos ajustes lidos neste desenho: uma troca na aba vale já no quadro que ela provoca.
    const t = stringsOf(s.language)
    const shown = effectsOf(s)
    // Em que o palco sai nesta tela: pixels, blocos, vetor ou texto, pelo ajuste e pelo que ela oferece.
    const known = await read($, pixels)
    const offered: Abilities = { ...offeredBy(table), pixels: known }
    const backend = backendOf(s.resolution, e.surface, offered)
    // O palco: a cena do quadro, com o placar do turno no canto. Numa faixa baixa demais ele não entra;
    // o tamanho dobrado só vale fora do texto, quando foi pedido e a barra tem largura e altura para ele.
    const zoom = backend === 'text' ? 1 : zoomOf(shown.isLarge, width, e.props.maxRows)
    lastZoom = zoom
    const geo = shown.hasStage && e.props.maxRows >= STAGE_MIN_ROWS ? geometry(Math.floor(width / zoom)) : null
    const hud: Part[] = demoFrame >= 0 ? [{ text: t.demoHud, dim: true }] : e.props.isWorking && m.startedAt > 0 ? hudParts(m, now, t) : []
    // O poder de cada um: a aparência dos bichos no palco. A energia do pulso da régua é a do effort
    // (ou a que a demonstração pediu); sem effort lido, o pulso é o de sempre.
    const powers = powersOf(f, list)
    const energy = demoFrame >= 0 && demoLook ? demoLook.level : energyOf(f.effort)
    const open = await read($, picker)
    const isShown = !e.props.isCollapsed && open !== 'settings' // a aba de ajustes toma o lugar das linhas, palco incluído
    const draw = drawStage($, e, table, { backend, known, isShown, geo, zoom, hud, powers, settings: s, strings: t, now })
    // Um palco de imagem ou de vetor não leva texto: o placar volta para a linha de trabalho, abaixo dele.
    const hasStageHud = !draw.node || draw.backend === 'raster'
    const hasWorkRow = !hasStageHud && e.props.isWorking && m.startedAt > 0
    const stageRows = draw.node ? SCENE_ROWS * zoom + (hasWorkRow ? 1 : 0) : draw.lines.length
    // Com o palco em cena numa faixa baixa, é a lista de agentes que encolhe (o resto vira "+N agentes").
    const chrome = (s.showRule ? 1 : 0) + 1
    const agentRows = stageRows ? Math.max(1, e.props.maxRows - chrome - stageRows - 1) : undefined
    const lines = cardLines({
      figures: f, main: m, agents: list, now, frame: fr, isWorking: e.props.isWorking, max: width, settings: s,
      stage: draw.node ? [STAGE_SLOT] : draw.lines, hasStageHud, agentRows,
    })
    const toggle = (kind: Exclude<Picker, null>) => update($, picker, p => (p === kind ? null : kind))
    // A cor de destaque dos ajustes entra aqui, no desenho: as linhas falam 'claude', a barra pinta com a escolhida.
    const accent = accentColor(s)
    const paint = (color: string | undefined) => (color === 'claude' ? accent : color)
    const run = (q: Part) => <Text color={paint(q.color)} backgroundColor={paint(q.bg)} dimColor={q.dim} bold={q.bold}>{q.text}</Text>
    const gap = (l: Line, room: number) =>
      ' '.repeat(Math.max(l.tail?.length ? TAIL_GAP : 0, room - lineWidth(l) + (l.tail?.length ? TAIL_GAP : 0)))
    // Uma linha é um Text só, cortado na borda da barra; o trecho da direita encosta na borda.
    const row = (l: Line, room: number) => (
      <Text wrap="truncate-end">
        {l.parts.map(run)}
        {gap(l, room)}
        {(l.tail ?? []).map(run)}
      </Text>
    )
    const [first = { parts: [] }, ...rest] = lines
    // Na primeira linha, modelo e effort são botões: um clique abre o seletor logo abaixo.
    const headParts = first.parts.map(q => {
      const action = q.action
      return action ? <Button key={action} plain onPress={() => void toggle(action)}>{run(q)}</Button> : run(q)
    })
    const current = f.model ? prettyModel(f.model).toLowerCase() : ''
    const choices =
      open === 'settings' ? []
      : open === 'model'
        ? MODELS.map(m => ({ value: m.value, label: m.label, isCurrent: current.startsWith(m.value) }))
        : EFFORTS.map(level => ({ value: level, label: level, isCurrent: f.effort === level }))
    const pickerRow = open === 'model' || open === 'effort' ? (
      <Box key="picker">
        <Text dimColor>{open === 'model' ? t.pickModel : t.pickEffort}</Text>
        {choices.flatMap(c => [
          <Text> </Text>,
          <Button key={`pick-${c.value}`} plain onPress={() => void switchTo($, open, c.value)}>
            <Text color={c.isCurrent ? accent : undefined} bold={c.isCurrent}>{c.isCurrent ? `${MARKS.current}${c.label}` : c.label}</Text>
          </Button>,
        ])}
        <Button key="pick-close" label={MARKS.close} plain dimColor onPress={() => void toggle(open)} />
      </Box>
    ) : null

    return withBelow(
      <Box paddingRight={BAR_RIGHT_PAD}>
        <Box width={width} flexDirection="column">
          {s.showRule ? <Text key="rule" wrap="truncate-end">{ruleParts(width, fr, isActive && shown.isFull, energy).map(run)}</Text> : null}
          <Box key="head">
            {headParts}
            <Text wrap="truncate-end">
              {gap(first, width - BUTTONS_WIDTH - (draw.probe ? 1 : 0))}
              {(first.tail ?? []).map(run)}
            </Text>
            <Button key="settings" label={MARKS.settings} plain dimColor={open !== 'settings'} hover={{ color: accent }} onPress={() => void toggle('settings')} />
            <Button key="hide" label={MARKS.hide} plain dimColor hover={{ color: accent }} onPress={() => setHidden(true)} />
            {draw.probe}
          </Box>
          {open === 'settings'
            ? SettingsPanel({
                el: { Box, Button, Text } as never, settings: s, strings: t, accent, inUse: t.backends[draw.backend], isCramped: s.size === 'grande' && zoom === 1,
                onChange: patch => {
                  // escolher "automática" de novo é pedir para conferir outra vez se o terminal desenha imagens
                  if (patch.resolution === 'auto') void recheckPixels($)
                  void applySettings($, cur => ({ ...cur, ...patch }))
                },
                onReset: () => void applySettings($, cur => ({ ...DEFAULT_SETTINGS, language: cur.language })), // o idioma não é aparência: fica
                onDemo: () => void startDemo($).then(text => text === strings.demo || $.ui.toast(text)),
                onClose: () => void update($, picker, () => null),
              })
            : [...(pickerRow ? [pickerRow] : []), ...rest.map(l => (l === STAGE_SLOT && draw.node ? draw.node : row(l, width)))]}
        </Box>
      </Box>,
    )
  })
}
