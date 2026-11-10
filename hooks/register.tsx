import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import { LINGER_MS, isExpired, reconcileRows, upsert } from './agents'
import { BURST_FRAMES, ruleParts } from './effects'
import { clean, prettyModel, shortTool } from './format'
import { BUTTONS_WIDTH, EFFORTS, cardLines, fromUsage } from './lines'
import { TAIL_GAP, lineWidth } from './parts'
import type { Line, Part, Switch } from './parts'
import { SettingsPanel } from './settings-panel'
import { celebrationMs } from './stage'
import { DEFAULT_SETTINGS, FULL_EFFECTS, accentColor, effectsOf, sanitize } from './settings'
import type { Effects } from './settings'
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
const SETTINGS_KEY = 'settings' // a chave no $.store: os ajustes valem para todas as sessões

const COMMAND = 'legends-claude'
const MIN_COLUMNS = 60 // mais estreito que isso o card cobriria a conversa: não desenha
const BAR_RIGHT_PAD = 1 // a barra vai de ponta a ponta da faixa, menos essa folga à direita
const HIDDEN_RIGHT_PAD = 5 // livre do [-] que o Claude Code desenha no canto da faixa
const RECONCILE_MS = 1_000 // a lista de agentes do engine é conferida no máximo uma vez por segundo
const FRAME_WRAP = 1_000_000
const FLASH_MS = 1_500 // quanto tempo o custo fica aceso depois de crescer
// Os apelidos que o /model aceita: cada um aponta sempre para a versão mais nova da família.
const MODELS = [
  { value: 'fable', label: 'Fable' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
] as const
const STRINGS = {
  hide: ' ▾ ', show: '◂ status', settings: ' ⚙ ', saveFailed: (why: string) => `Não deu para salvar os ajustes: ${why}`,
  opened: 'Ajustes abertos na barra.', pickModel: 'modelo ', pickEffort: 'effort ', current: '● ', close: ' ✕ ',
  switchFailed: (what: string, why: string) => `Não deu para trocar ${what}: ${why}`,
  hidden: 'Card de status escondido.', shown: 'Card de status visível.',
  tooNarrow: `Card de status visível; ele desenha quando o terminal tiver pelo menos ${MIN_COLUMNS} colunas.`,
  commandDescription: 'Mostra ou esconde a barra de status; "ajustes" abre a aba de ajustes',
} as const

type Timer = ReturnType<EngineInterface['clock']['every']>

// Variáveis do módulo: um reload zera todas, e os timers do módulo anterior caem junto.
let ticker: Timer | null = null
let isTickBusy = false
let isBandWorking = false
let lastBandColumns = Infinity
let tickerMs = 0 // a cadência do ticker em curso: muda com a velocidade dos ajustes
let lastReconcileAt = -Infinity
let fx: Effects = FULL_EFFECTS // os efeitos em vigor, lidos dos ajustes
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

// Quanto dura a despedida de quem terminou: o estouro ao lado do ✓ e, com o palco, o ajudante sumindo.
const lingerMs = () => Math.max(BURST_FRAMES * fx.frameMs, fx.hasStage ? celebrationMs(fx.frameMs) : 0)

// Há o que animar: o turno, um agente rodando, ou o estouro de faíscas de quem acabou de terminar.
const hasWork = (list: readonly Agent[], now: number) =>
  isBandWorking ||
  list.some(a => a.state === 'running' || (fx.isFull && a.endedAt !== undefined && now - a.endedAt < lingerMs()))

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
    await update($, frame, f => (f + 1) % FRAME_WRAP)
    const now = await $.clock.now()
    const isDue = now - lastReconcileAt >= RECONCILE_MS
    if (isDue) lastReconcileAt = now
    const list = isDue ? await reconcile($, now) : await read($, agents)
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
    $.ui.toast(STRINGS.switchFailed(command, clean(err instanceof Error ? err.message : String(err), 120)))
  }
}

// Uma mudança na aba de ajustes: vale na hora nesta sessão e fica salva para as próximas.
async function applySettings($: EngineInterface, change: (s: Settings) => Settings) {
  try {
    const next = await update($, settings, s => sanitize(change(s)))
    fx = effectsOf(next)
    if (ticker) ensureTicker($) // a velocidade pode ter mudado
    await $.store.set(SETTINGS_KEY, next)
  } catch (err) {
    $.ui.toast(STRINGS.saveFailed(clean(err instanceof Error ? err.message : String(err), 120)))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      isBandWorking = false
      await $.command.register({ name: COMMAND, description: STRINGS.commandDescription, argumentHint: '[ajustes]' })
      // Os ajustes salvos valem antes do primeiro desenho; um valor estragado volta ao padrão campo a campo.
      const saved = await update($, settings, () => sanitize(undefined))
      fx = effectsOf(saved)
      try {
        const stored = sanitize(await $.store.get(SETTINGS_KEY))
        fx = effectsOf(await update($, settings, () => stored))
      } catch (err) {
        report($, 'settings', err)
      }
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
      return { text: STRINGS.opened }
    }
    const hidden = await update($, isHidden, h => !h)
    if (hidden) return { text: STRINGS.hidden }
    return { text: lastBandColumns < MIN_COLUMNS ? STRINGS.tooNarrow : STRINGS.shown }
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
      if (e.agentId) {
        const row = (await read($, agents)).find(a => a.id === e.agentId)
        if (row?.model !== e.model) await touchAgent($, e.agentId, (a, now) => ({ ...a, model: e.model, seenAt: now }))
      } else {
        const effort = e.effort === undefined ? null : String(e.effort)
        const f = await read($, figures)
        if (f.model !== e.model || f.effort !== effort) await update($, figures, g => ({ ...g, model: e.model, effort }))
      }
    } catch (err) {
      report($, 'turn.step', err)
    }
    return yield* next(e)
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

  on('tool.call', ($, e, next) => {
    void noteTool($, e.agentId, String(e.tool)) // sem esperar: a chamada não fica atrás do card
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      if (e.agentId) {
        const state: AgentState = e.isAborted || e.reason === 'error' ? 'failed' : 'done'
        const u = e.usage
        const tokens = u ? u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens : undefined
        await touchAgent($, e.agentId, (a, now) => ({ ...a, state, endedAt: now, seenAt: now, tokens }))
      } else {
        isBandWorking = false
        ensureTicker($) // o próximo quadro vê que o trabalho acabou, redesenha e para
      }
    } catch (err) {
      report($, 'turn.complete', err)
    }
    return result
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

  // A faixa acima do prompt vira uma barra na largura toda.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    lastBandColumns = e.props.bodyColumns
    isBandWorking = e.props.isWorking
    if (e.props.hasSurvey || e.props.bodyColumns < MIN_COLUMNS) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    // O que os plugins abaixo desenharam aqui fica, acima do card.
    const below = await next(e).catch(() => null)
    const withBelow = (ours: RenderElement): RenderElement => (below ? <Box flexDirection="column">{below}{ours}</Box> : ours)
    const setHidden = (hidden: boolean) => update($, isHidden, () => hidden)

    if (await read($, isHidden))
      return withBelow(
        <Box justifyContent="flex-end" paddingRight={HIDDEN_RIGHT_PAD}>
          <Button key="show" label={STRINGS.show} dimColor onPress={() => setHidden(false)} />
        </Box>,
      )

    const list = await read($, agents)
    const now = await $.clock.now()
    const isActive = hasWork(list, now)
    if (isActive) ensureTicker($)
    // A barra ocupa a faixa toda, de ponta a ponta.
    const width = e.props.bodyColumns - BAR_RIGHT_PAD
    const f = await read($, figures)
    const s = await read($, settings)
    const fr = await read($, frame)
    const lines = cardLines({ figures: f, main: await read($, main), agents: list, now, frame: fr, isWorking: e.props.isWorking, max: width, settings: s })
    const open = await read($, picker)
    const toggle = (kind: Exclude<Picker, null>) => update($, picker, p => (p === kind ? null : kind))
    // A cor de destaque dos ajustes entra aqui, no desenho: as linhas falam 'claude', a barra pinta com a escolhida.
    const accent = accentColor(s)
    const paint = (color: string | undefined) => (color === 'claude' ? accent : color)
    const run = (q: Part) => <Text color={paint(q.color)} dimColor={q.dim} bold={q.bold}>{q.text}</Text>
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
        <Text dimColor>{open === 'model' ? STRINGS.pickModel : STRINGS.pickEffort}</Text>
        {choices.flatMap(c => [
          <Text> </Text>,
          <Button key={`pick-${c.value}`} plain onPress={() => void switchTo($, open, c.value)}>
            <Text color={c.isCurrent ? accent : undefined} bold={c.isCurrent}>{c.isCurrent ? `${STRINGS.current}${c.label}` : c.label}</Text>
          </Button>,
        ])}
        <Button key="pick-close" label={STRINGS.close} plain dimColor onPress={() => void toggle(open)} />
      </Box>
    ) : null

    return withBelow(
      <Box paddingRight={BAR_RIGHT_PAD}>
        <Box width={width} flexDirection="column">
          {s.showRule ? <Text key="rule" wrap="truncate-end">{ruleParts(width, fr, isActive && fx.isFull).map(run)}</Text> : null}
          <Box key="head">
            {headParts}
            <Text wrap="truncate-end">
              {gap(first, width - BUTTONS_WIDTH)}
              {(first.tail ?? []).map(run)}
            </Text>
            <Button key="settings" label={STRINGS.settings} plain dimColor={open !== 'settings'} hover={{ color: accent }} onPress={() => void toggle('settings')} />
            <Button key="hide" label={STRINGS.hide} plain dimColor hover={{ color: accent }} onPress={() => setHidden(true)} />
          </Box>
          {open === 'settings'
            ? SettingsPanel({
                el: { Box, Button, Text } as never, settings: s, accent,
                onChange: patch => void applySettings($, cur => ({ ...cur, ...patch })),
                onReset: () => void applySettings($, () => DEFAULT_SETTINGS),
                onClose: () => void update($, picker, () => null),
              })
            : [...(pickerRow ? [pickerRow] : []), ...rest.map(l => row(l, width))]}
        </Box>
      </Box>,
    )
  })
}
