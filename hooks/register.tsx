import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import { LINGER_MS, isExpired, reconcileRows, upsert } from './agents'
import { Bar, HiddenBar } from './bar'
import { DEMO_CAST, DEMO_FRAMES, DEMO_SOUNDS, applyDemo } from './demo'
import { PickerRow } from './bar-rows'
import { BURST_FRAMES, ruleParts } from './effects'
import { SETTINGS_KEY, follow, isLightName, loadSettings, openBooks, readTheme, report, viewAgent } from './engine-calls'
import { landingKey } from './focus'
import type { Opened, Standing } from './focus'
import { clean, cols, prettyModel, shortTool } from './format'
import type { Zoom } from './hd'
import { stringsOf } from './i18n'
import type { Strings } from './i18n'
import { closeLedger, dayCost, ledgerReport, saveLedger, tally } from './ledger'
import { EFFORTS, STAGE_SLOT, cardLines, fromUsage, hudParts, viewParts } from './lines'
import { paced } from './pace'
import { dropStage, recheckPixels, resetPainter } from './painter'
import type { Host } from './painter'
import { isQuestion, kindOf } from './palette'
import type { Kind } from './palette'
import type { Part, Switch } from './parts'
import { THINKING, hear } from './phase'
import { PLAIN, TIER_NAMES, energyOf, lookOf, powerOf } from './power'
import type { Power } from './power'
import { SCENE_ROWS } from './scene'
import { SettingsPanel } from './settings-panel'
import { EMPTY_SIM, MAIN, PARTY_FROM, begin, blank, crack, enqueue, finish, fold, geometry, halt, hasScene, isAnimating, settle, shift, step, syncHelpers, think, top } from './sim'
import type { Sim } from './sim'
import { DEFAULT_SETTINGS, FULL_EFFECTS, accentColor, effectsOf, mascotOf, sanitize } from './settings'
import type { Effects } from './settings'
import { playCue } from './sound'
import type { Cue } from './sound'
import { backendOf, zoomOf } from './stage'
import type { Abilities, Pixels } from './stage'
import { drawStage } from './stage-draw'
import { offeredBy } from './stage-node'
import { countFail, countHelpers, countTool, countTurn } from './stats'
import type { SessionStats } from './stats'
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

const COMMAND = 'legends-claude'
const MIN_COLUMNS = 60 // mais estreito que isso a barra cobriria a conversa: não desenha
const BAR_RIGHT_PAD = 1 // a barra vai de ponta a ponta da faixa, menos essa folga à direita
const HIDDEN_RIGHT_PAD = 5 // livre do [-] que o Claude Code desenha no canto da faixa
const RECONCILE_MS = 1_000 // a lista de agentes do engine é conferida no máximo uma vez por segundo
const FRAME_WRAP = 1_000_000
const FLASH_MS = 1_500 // quanto tempo o custo fica aceso depois de crescer
const HEAL_AFTER_MS = 5_000 // um turno em curso com a faixa dizendo "parada" por esse tempo: o fim dele não foi avisado
const STATS_ARGS = /^\s*(stats|estat\S*|statistics)\s*$/i // "stats", "estatísticas", "statistics"
const STAGE_MIN_ROWS = SCENE_ROWS + 3 // a régua, o cabeçalho, o palco e ao menos uma linha de folga: menos que isso, sem palco
const VIEW_GAP = 2 // colunas entre o nome do agente em vista e o botão que volta à conversa principal
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
let volume: Settings['sound'] = DEFAULT_SETTINGS.sound // o som em vigor, lido dos ajustes
let isSilent = false // o Claude Code não tem como tocar som neste sistema (só toca no macOS)
let sessionSeed = '' // o id da sessão: dele sai o avatar "por sessão"
// Um som da barra, no volume dos ajustes. É enfeite: se não tocar, vira um aviso, uma vez.
const cue = ($: EngineInterface, name: Cue, now: number) => void playCue($, name, volume, now).catch(err => report($, 'sound', err))

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
      DEMO_SOUNDS.filter(([at]) => at === demoFrame).forEach(([, sound]) => cue($, sound, now))
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

// As contas da sessão mudaram (stats.ts). Quando os tijolos fecham um andar, sobem fogos sobre a parede.
const count = ($: EngineInterface, change: (stats: SessionStats) => SessionStats, now: number) => {
  if (tally(change) <= 0) return
  onStage($, () => void (sim = top(sim)), undefined)
  cue($, 'floor', now)
}

// Lança o custo de agora nas contas da sessão e grava o registro dela: no fim de cada turno, dela ou de um agente.
const keepBooks = ($: EngineInterface, now: number) =>
  void read($, figures).then(f => saveLedger($, f.costUsd, now)).catch(err => report($, 'stats', err))

async function reconcile($: EngineInterface, now: number) {
  const listed = await $.agent.list()
  const rows = await update($, agents, list => reconcileRows(list, listed, now))
  tally(stats => countHelpers(stats, rows.filter(a => a.state === 'running').length))
  return rows
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

// Uma chamada de ferramenta: conta para o agente que a fez, ou para o turno principal, e é um tijolo nas contas da sessão.
async function noteTool($: EngineInterface, agentId: string | undefined, tool: string) {
  try {
    const lastTool = shortTool(tool)
    if (agentId) await touchAgent($, agentId, (a, now) => ({ ...a, tools: a.tools + 1, lastTool, seenAt: now }))
    else await update($, main, m => ({ ...m, tools: m.tools + 1, lastTool }))
    count($, countTool, await $.clock.now())
  } catch (err) {
    report($, 'tool.call', err)
  }
}

// Uma chamada terminou em erro (ou foi recusada): o tijolo dela racha, e a falha conta para quem a fez.
async function noteFail($: EngineInterface, agentId: string | undefined, kind: Kind) {
  try {
    onStage($, () => void (sim = crack(sim, agentId ?? MAIN, kind)), undefined)
    if (agentId) await touchAgent($, agentId, a => ({ ...a, fails: (a.fails ?? 0) + 1 }))
    else await update($, main, m => ({ ...m, fails: (m.fails ?? 0) + 1 }))
    tally(countFail)
  } catch (err) {
    report($, 'tool.fail', err)
  }
}

// Um clique num item do seletor: roda /model ou /effort como se a pessoa tivesse digitado. O comando
// entra na fila e roda quando a sessão fica ociosa; a troca é a da sessão, não um desvio do mod.
// `requestId` é a faixa em que o seletor estava: com ele fechado, o anel de foco volta ao botão que o abriu.
async function switchTo($: EngineInterface, command: Switch, value: string, requestId: string) {
  try {
    await update($, picker, () => null)
    void follow($, requestId, command)
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

// Uma mudança na aba de ajustes: vale na hora nesta sessão e fica salva para as próximas.
async function applySettings($: EngineInterface, change: (s: Settings) => Settings) {
  try {
    const next = await update($, settings, s => sanitize(change(s), s.language))
    fx = effectsOf(next)
    if (next.sound !== volume) {
      volume = next.sound
      cue($, 'done', await $.clock.now()) // quem escolhe um volume ouve como ele soa
    }
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
// `isCommand`: quem pede é o comando `/legends-claude demo`. O Claude Code (visto na versão 2.1.327) dá
// a faixa como "trabalhando" enquanto um comando roda, o próprio incluído: vinda dele, só um turno de
// verdade impede a demonstração. Vinda do botão, a faixa "trabalhando" é um turno cujo começo o mod não viu.
async function startDemo($: EngineInterface, look = '', isCommand = false): Promise<string> {
  const words = look.trim()
  // A única espera antes de marcar a cena: as conferências vêm depois dela, para valerem no instante em que a cena entra.
  const f = await read($, figures)
  if (isTurnOn || (isBandWorking && !isCommand)) return strings.demoBusy
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      isBandWorking = false
      isTurnOn = false
      quietSince = null
      setScene(EMPTY_SIM)
      resetPainter()
      closeLedger()
      demoFrame = -1
      // Os ajustes salvos valem antes do primeiro desenho; um valor estragado volta ao padrão campo a campo.
      const initial = await loadSettings($).catch(err => (report($, 'settings', err), DEFAULT_SETTINGS))
      const loaded = await update($, settings, () => initial)
      fx = effectsOf(loaded)
      volume = loaded.sound
      await speak($, loaded.language) // registra o comando, já no idioma dos ajustes
      isLightTheme = (await readTheme($)) ?? isLightTheme
      const model = await $.session.model()
      const usage = fromUsage(await $.session.usage())
      const startedAt = await $.clock.now()
      await update($, figures, f => ({ ...f, ...usage, ...paced(f, usage, startedAt), model: model || f.model }))
      // O que o módulo anterior deixou (o estado sobrevive ao reload) é conferido com o engine.
      const list = await reconcile($, startedAt)
      if (hasWork(list, startedAt)) ensureTicker($)
      else if (list.length) $.clock.after(LINGER_MS, () => void purge($))
      const facts = await openBooks($, startedAt, usage.costUsd)
      sessionSeed = facts.seed
      isSilent = facts.isSilent
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
    if (STATS_ARGS.test(e.args)) {
      // As contas são para a pessoa: o texto aparece na conversa e não vai para o modelo.
      const now = await $.clock.now()
      const text = await ledgerReport($, (await read($, figures)).costUsd, now, strings.stats).catch(err => (report($, 'stats', err), null))
      return { text: text ?? strings.statsOff, isTextDisplayOnly: true }
    }
    const demo = /^\s*demo\S*(\s.*)?$/i.exec(e.args) // "demo", "demonstração", "demonstration"; o resto é a aparência pedida
    if (demo) return { text: await startDemo($, demo[1], true) }
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
          ...(a.endedAt !== undefined && { startedAt: now, tools: 0, lastTool: null, fails: 0 }),
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
        await update($, main, () => ({ startedAt: now, tools: 0, lastTool: null, costAtStart, fails: 0 }))
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
    // Enquanto o pedido ao modelo está em curso, quem o fez está pensando. Cada trecho da resposta passa
    // adiante como veio e diz o que o pedido faz agora (pensa, escreve, monta uma chamada): o palco mostra.
    const who = e.agentId ?? MAIN
    onStage($, () => void (sim = think(sim, who, true)), undefined)
    try {
      const stream = next(e)
      let heard = THINKING
      for await (const chunk of stream) {
        const now = hear(heard, chunk)
        if (now !== heard) {
          heard = now
          onStage($, () => void (sim = shift(sim, who, now.phase, now.tool)), undefined)
        }
        yield chunk
      }
      return await stream.result
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
          ...(e.parentAgentId && { parentId: e.parentAgentId }), // um agente de agente: a linha dele recua sob a de quem o chamou
        }))
        cue($, 'spawn', await $.clock.now())
      }
    } catch (err) {
      report($, 'agent.spawn', err)
    }
    return result
  })

  // Cada chamada de ferramenta conta na barra e vira um tijolo no palco, de quem a fez. Se termina em
  // erro (ou é recusada), o tijolo racha.
  on('tool.call', async ($, e, next) => {
    const who = e.agentId ?? MAIN
    const tool = String(e.tool)
    const kind = kindOf(tool)
    void noteTool($, e.agentId, tool) // sem esperar: a chamada não fica atrás da barra
    onStage($, () => {
      if (fx.hasStage && demoFrame < 0 && (who !== MAIN || sim.isOn)) sim = enqueue(sim, who, kind, shortTool(tool))
    }, undefined)
    // Uma pergunta à pessoa (ou um plano à espera da aprovação dela) para o turno até ela responder: soa.
    if (isQuestion(tool)) void $.clock.now().then(now => cue($, 'ask', now)).catch(err => report($, 'sound', err))
    let hasFailed = true // até a resposta dizer que não: uma chamada que estoura também falhou
    try {
      const result = await next(e) // o tempo da ferramenta não conta no orçamento deste hook
      hasFailed = result?.isError === true || result?.deny !== undefined
      return result
    } finally {
      if (hasFailed) void noteFail($, e.agentId, kind)
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
          const now = await $.clock.now()
          if (e.reason === 'error' && !e.isAborted) cue($, 'fail', now) // um agente interrompido pela pessoa não precisa de aviso
          keepBooks($, now)
        } else {
          const isHappy = e.reason === 'answer' && !e.isAborted // só uma resposta de verdade merece festa
          isBandWorking = false
          endTurn($, isHappy)
          ensureTicker($) // os próximos quadros veem que o trabalho acabou, redesenham e param
          const m = await read($, main)
          const now = await $.clock.now()
          if (m.startedAt > 0) tally(stats => countTurn(stats, now - m.startedAt, m.tools))
          // A fanfarra é do tamanho do trabalho, como a festa do palco; um erro soa, uma interrupção não.
          if (isHappy) cue($, m.tools >= PARTY_FROM ? 'party' : 'done', now)
          else if (e.reason === 'error') cue($, 'fail', now)
          keepBooks($, now)
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
      const now = await $.clock.now()
      // Cada janela de limite leva as leituras recentes dela: de onde sai a previsão de quando enche.
      await update($, figures, f => ({ ...f, ...usage, ...paced(f, usage, now), ...(hasCostMoved && { costMovedAt: now }) }))
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
    const el = { Box, Button, Text } as never
    // O que os plugins abaixo desenharam aqui fica, acima do card.
    const below = await next(e).catch(() => null)
    const withBelow = (ours: RenderElement): RenderElement => (below ? <Box flexDirection="column">{below}{ours}</Box> : ours)
    // Esconder e mostrar trocam o botão em cena: o anel de foco vai para o que ficou.
    const setHidden = async (hidden: boolean) => {
      await update($, isHidden, () => hidden)
      await follow($, e.requestId, hidden ? 'show' : 'hide')
    }

    if (await read($, isHidden)) {
      if (isTerminal) dropStage()
      return withBelow(HiddenBar({ el, label: MARKS.show, rightPad: HIDDEN_RIGHT_PAD, onShow: () => void setHidden(false) }))
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
    // A cor de destaque dos ajustes entra aqui, no desenho: as linhas falam 'claude', a barra pinta com a escolhida.
    const accent = accentColor(s)
    // Quem é o mascote: o avatar dos ajustes, ou o que a barra tira para a classe do modelo ou para a sessão.
    const mascot = mascotOf(s.avatar, (powers.get(MAIN) ?? PLAIN).tier, sessionSeed)
    const draw = drawStage($, e, table, {
      backend, known, isShown, isAuto: s.resolution === 'auto', geo, zoom, hud, powers, alt: t.stageAlt, now,
      look: { isLight: isLightTheme, accent, avatar: mascot },
    }, { prev: shownSim, cur: sim, steppedAt, frameMs: fx.frameMs, host: hostOf($) })
    // Um palco de imagem ou de vetor não leva texto: o placar volta para a linha de trabalho, abaixo dele.
    const hasStageHud = !draw.node || draw.backend === 'raster'
    const hasWorkRow = !hasStageHud && e.props.isWorking && m.startedAt > 0
    const stageRows = draw.node ? SCENE_ROWS * zoom + (hasWorkRow ? 1 : 0) : draw.lines.length
    // Com o palco em cena numa faixa baixa, é a lista de agentes que encolhe (o resto vira "+N agentes").
    const chrome = (s.showRule ? 1 : 0) + 1
    const agentRows = stageRows ? Math.max(1, e.props.maxRows - chrome - stageRows - 1) : undefined
    // A transcrição na tela acima da faixa: a conversa principal, ou a de um agente (a linha dele vai marcada).
    const viewedId = e.props.view?.agentId
    const lines = cardLines({
      figures: f, main: m, agents: list, now, frame: fr, isWorking: e.props.isWorking, max: width, settings: s,
      stage: draw.node ? [STAGE_SLOT] : draw.lines, hasStageHud, agentRows, viewedId, dayUsd: dayCost(f.costUsd, now),
    })
    const current = f.model ? prettyModel(f.model).toLowerCase() : ''
    // O que está em vigor: decide em que opção o anel de foco cai quando um seletor ou a aba abre.
    const standing: Standing = { models: MODELS.map(option => option.value), model: current, efforts: EFFORTS, effort: f.effort, language: s.language }
    // Abrir leva o anel para dentro. Fechar pelo mesmo botão deixa-o onde está; fechar por dentro (o ✕,
    // a demonstração que fecha a aba) devolve-o ao botão que abriu.
    const toggle = async (kind: Opened) => {
      const now = await update($, picker, p => (p === kind ? null : kind))
      if (now === kind) await follow($, e.requestId, landingKey(kind, standing))
    }
    const close = async (opener: Opened) => {
      await update($, picker, () => null)
      await follow($, e.requestId, opener)
    }
    // O seletor aberto por um clique no modelo ou no effort: uma linha de opções, a em vigor marcada.
    const pickerRow = open === 'model' || open === 'effort' ? PickerRow({
      el, label: open === 'model' ? t.pickModel : t.pickEffort, accent, marks: MARKS,
      choices: open === 'model'
        ? MODELS.map(m => ({ value: m.value, label: m.label, isCurrent: current.startsWith(m.value) }))
        : EFFORTS.map(level => ({ value: level, label: level, isCurrent: f.effort === level })),
      onPick: value => void switchTo($, open, value, e.requestId),
      onClose: () => void close(open),
    }) : null
    // A aba de ajustes, quando aberta, toma o lugar das linhas.
    const panel = open !== 'settings' ? null : SettingsPanel({
      el, settings: s, strings: t, accent, inUse: t.backends[draw.backend], isCramped: s.size === 'grande' && zoom === 1, mascot, isSilent,
      onChange: patch => {
        // escolher "automática" de novo é pedir para conferir outra vez se o terminal desenha imagens
        if (patch.resolution === 'auto') void recheckPixels($).catch(err => report($, 'pixels', err))
        void applySettings($, cur => ({ ...cur, ...patch }))
      },
      onReset: () => void applySettings($, cur => ({ ...DEFAULT_SETTINGS, language: cur.language })), // o idioma não é aparência: fica
      // a demonstração, quando começa, fecha a aba: o anel volta ao ⚙, como no ✕
      onDemo: () => void startDemo($).then(text => (text === strings.demo ? void follow($, e.requestId, 'settings') : $.ui.toast(text))),
      onClose: () => void close('settings'),
    })

    return withBelow(Bar({
      el, width, rightPad: BAR_RIGHT_PAD, accent, lines, stage: draw.node, probe: draw.probe, canView: isTerminal, viewedId, panel, marks: MARKS,
      rule: s.showRule ? ruleParts(width, fr, isActive && shown.isFull, energy) : null,
      isSettingsOpen: open === 'settings',
      // Com a transcrição de um agente na tela: de quem ela é, e a volta à conversa principal.
      viewed: viewedId === undefined ? null : { who: viewParts(list.find(a => a.id === viewedId), width - VIEW_GAP - cols(t.backToMain), t), gap: VIEW_GAP, back: t.backToMain },
      above: pickerRow ? [pickerRow] : [],
      onToggle: kind => void toggle(kind),
      onHide: () => void setHidden(true),
      onView: agentId => void viewAgent($, agentId, strings),
    }))
  })
}
