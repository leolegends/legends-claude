import { fmtCount } from './format'
import type { Backend } from './stage'
import type {
  StatusAccent as Accent,
  StatusAvatar as Avatar,
  StatusLanguage as Language,
  StatusMascot as Mascot,
  StatusMotion as Motion,
  StatusResolution as Resolution,
  StatusSize as Size,
  StatusSound as Sound,
  StatusSpeed as Speed,
} from '../types'

// Os textos da barra, em cada idioma. Tudo o que uma pessoa lê passa por aqui: um texto novo entra no
// tipo `Strings` e o compilador cobra a tradução nos dois dicionários.

/** Os idiomas da barra, cada um com o nome no próprio idioma. */
export const LANGUAGES: readonly { id: Language; label: string }[] = [
  { id: 'pt', label: 'Português' },
  { id: 'en', label: 'English' },
]

/** Os interruptores da aba de ajustes: as chaves dos ajustes que ligam e desligam algo. */
export type ToggleKey = 'showRule' | 'showStage' | 'showContext' | 'showLimits' | 'showTurnCost' | 'showDayCost'

/** Todo texto que a barra mostra, num idioma. */
export type Strings = {
  // As linhas da barra.
  session: string
  turn: string
  noCost: string
  noEffort: string
  waiting: string
  failed: string
  /** Como chamar um agente cujo tipo ainda não se sabe. */
  agent: string
  more: (count: number) => string
  tools: (count: number) => string
  /** Quantas ferramentas terminaram em erro. */
  fails: (count: number) => string
  /** O que vem antes do custo de hoje, somado entre as sessões. */
  today: string
  /** A previsão de quando uma janela de limite enche, no ritmo de agora ("~40m"). */
  fullIn: (eta: string) => string
  // A linha do contexto e a compactação.
  /** O rótulo da linha do contexto. */
  context: string
  /** O botão que compacta a conversa. */
  compact: string
  /** O mesmo botão depois do primeiro clique: o segundo compacta. */
  compactConfirm: string
  compacting: string
  /** Antes do botão, com o contexto alto. */
  compactSuggest: string
  /** Antes do botão, com o contexto muito alto. */
  compactUrgent: string
  /** O aviso de quando o contexto cruza a linha da sugestão. */
  compactHint: (pct: number) => string
  compactFailed: (why: string) => string
  /** O comando de compactar, com a sessão sem nada para compactar. */
  compactEmpty: string
  compactQueued: string
  // Os seletores de modelo e effort, o comando e os avisos.
  pickModel: string
  pickEffort: string
  switchFailed: (what: string, why: string) => string
  saveFailed: (why: string) => string
  // A transcrição de um agente na tela, no lugar da conversa principal.
  /** O que vem antes do nome do agente cuja transcrição está na tela. */
  viewing: string
  /** O botão que volta à conversa principal. */
  backToMain: string
  viewFailed: (why: string) => string
  hidden: string
  shown: string
  tooNarrow: (columns: number) => string
  opened: string
  commandDescription: string
  argumentHint: string
  // O relatório do comando de estatísticas: um rótulo por linha e as contas de cada uma.
  /** Sem o registro da sessão não há o que relatar. */
  statsOff: string
  stats: {
    title: string
    session: string
    today: string
    /** O rótulo do total de sempre: desde que dia se conta. */
    since: (day: string) => string
    records: string
    bricks: (count: number) => string
    floors: (count: number) => string
    fails: (count: number) => string
    turns: (count: number) => string
    sessions: (count: number) => string
    longest: (span: string) => string
    mostTools: (count: number) => string
    mostHelpers: (count: number) => string
  }
  // A demonstração do palco.
  demo: string
  /** A demonstração pedida com outro modelo ou effort: diz com qual aparência ela roda. */
  demoAs: (model: string, effort: string) => string
  /** O que veio depois de "demo" não é um modelo nem um effort: diz o que não entendeu e o que cabe ali. */
  demoUnknown: (words: string) => string
  demoHud: string
  demoBusy: string
  demoOff: string
  demoNarrow: (columns: number) => string
  /** O que o palco mostra, para quem não vê a imagem dele (um leitor de tela, um terminal sem imagens). */
  stageAlt: string
  // A aba de ajustes: o cabeçalho, os rótulos das linhas e os das opções.
  panel: {
    title: string
    demo: string
    reset: string
    language: string
    accent: string
    motion: string
    speed: string
    resolution: string
    /** Ao lado das opções de resolução: em que o palco está sendo desenhado nesta tela. */
    inUse: (backend: string) => string
    size: string
    /** Ao lado das opções de tamanho, quando o grande foi pedido e a barra não tem largura ou altura para ele. */
    noRoom: string
    /** O rótulo da linha que escolhe quem é o mascote no palco. */
    avatar: string
    /** Ao lado das opções de mascote, quando quem escolhe é a barra: quem está em cena agora. */
    playing: (name: string) => string
    sound: string
    /** Ao lado das opções de som, num sistema em que o Claude Code não tem como tocar. */
    macOnly: string
    show: string
    agents: string
    stillSpeed: string
  }
  accents: Record<Accent, string>
  motions: Record<Motion, string>
  speeds: Record<Speed, string>
  resolutions: Record<Resolution, string>
  sizes: Record<Size, string>
  sounds: Record<Sound, string>
  /** As opções de mascote em que quem escolhe é a barra: o da classe do modelo, o da sessão. */
  mascots: Record<Exclude<Mascot, Avatar>, string>
  /** Em que o palco sai: o nome de cada saída, para o "em uso" dos ajustes. */
  backends: Record<Backend, string>
  toggles: Record<ToggleKey, string>
  /** A dedicatória de um mascote, para os que têm uma: aparece ao lado da linha deles nos ajustes quando ele é o escolhido. */
  tributes: Partial<Record<Avatar, string>>
}

const PT: Strings = {
  session: ' sessão',
  turn: 'turno +',
  noCost: 'custo ',
  noEffort: 'effort',
  waiting: 'aguardando',
  failed: 'falhou',
  agent: 'agente',
  more: count => `+${count} ${count === 1 ? 'agente' : 'agentes'}`,
  tools: count => `${count} ${count === 1 ? 'tool' : 'tools'}`,
  fails: count => `${count} ${count === 1 ? 'falha' : 'falhas'}`,
  today: 'hoje ',
  fullIn: eta => `enche em ${eta}`,
  context: 'contexto ',
  compact: '⟳ compactar',
  compactConfirm: '⟳ confirmar compactação?',
  compacting: 'compactando…',
  compactSuggest: 'hora de compactar?',
  compactUrgent: 'compacte antes que o Claude Code compacte sozinho',
  compactHint: pct => `O contexto está em ${pct}%: compactar agora (⟳ na barra, ou /legends-claude compactar) mantém o que importa no resumo.`,
  compactFailed: why => `Não deu para compactar: ${why}`,
  compactEmpty: 'Ainda não há conversa para compactar.',
  compactQueued: 'Compactação pedida: roda assim que a sessão ficar parada.',
  pickModel: 'modelo ',
  pickEffort: 'effort ',
  switchFailed: (what, why) => `Não deu para trocar ${what}: ${why}`,
  saveFailed: why => `Não deu para salvar os ajustes: ${why}`,
  viewing: 'vendo ',
  backToMain: '← principal',
  viewFailed: why => `Não deu para abrir a transcrição: ${why}`,
  hidden: 'Barra de status escondida.',
  shown: 'Barra de status visível.',
  tooNarrow: columns => `Barra de status visível; ela desenha quando o terminal tiver pelo menos ${columns} colunas.`,
  opened: 'Ajustes abertos na barra.',
  commandDescription: 'Mostra ou esconde a barra de status; "ajustes" abre os ajustes, "stats" mostra as contas da sessão, do dia e de sempre, "compactar" compacta a conversa (com instruções: "compactar mantenha o plano"), "demo" mostra o palco em ação (com outro modelo e effort: "demo opus max")',
  argumentHint: '[ajustes|stats|compactar [instruções]|demo [modelo] [effort]]',
  statsOff: 'Sem estatísticas nesta sessão: a barra não conseguiu abrir o registro dela.',
  stats: {
    title: 'estatísticas', // o Claude Code já põe o nome do plugin na frente do que o comando diz
    session: 'esta sessão',
    today: 'hoje',
    since: day => `desde ${day}`,
    records: 'recordes',
    bricks: count => `${fmtCount(count, '.')} ${count === 1 ? 'tijolo' : 'tijolos'}`,
    floors: count => `${fmtCount(count, '.')} ${count === 1 ? 'andar' : 'andares'}`,
    fails: count => `${fmtCount(count, '.')} ${count === 1 ? 'falha' : 'falhas'}`,
    turns: count => `${fmtCount(count, '.')} ${count === 1 ? 'turno' : 'turnos'}`,
    sessions: count => `${fmtCount(count, '.')} ${count === 1 ? 'sessão' : 'sessões'}`,
    longest: span => `turno mais longo ${span}`,
    mostTools: count => `${fmtCount(count, '.')} ${count === 1 ? 'tool' : 'tools'} num turno`,
    mostHelpers: count => `${count} ${count === 1 ? 'agente' : 'agentes'} de uma vez`,
  },
  demo: 'Demonstração do palco em cena.',
  demoAs: (model, effort) => `Demonstração do palco em cena, como ${model} · ${effort}.`,
  demoUnknown: words => `Não entendi "${words}". Depois de "demo" vai um modelo (haiku, sonnet, opus, fable), um effort (low, medium, high, xhigh, max), ou os dois.`,
  demoHud: '▶ demonstração',
  demoBusy: 'A demonstração roda com a sessão parada: espere o turno terminar.',
  demoOff: 'O palco está desligado: ligue "palco" e a animação "completa" nos ajustes (⚙).',
  demoNarrow: columns => `A demonstração precisa de um terminal com pelo menos ${columns} colunas.`,
  stageAlt: 'O palco: o mascote leva os tijolos das ferramentas até a parede.',
  panel: {
    title: 'ajustes',
    demo: ' ▶ demonstração ',
    reset: ' restaurar padrão ',
    language: 'idioma',
    accent: 'cor',
    motion: 'animação',
    speed: 'velocidade',
    resolution: 'resolução',
    inUse: backend => `em uso: ${backend}`,
    size: 'tamanho',
    noRoom: '(sem efeito agora: a barra não tem espaço, ou a resolução é a clássica)',
    avatar: 'mascote',
    playing: name => `em cena: ${name}`,
    sound: 'som',
    macOnly: '(só toca no macOS)',
    show: 'mostrar',
    agents: 'agentes',
    stillSpeed: '(sem efeito com animação parada)',
  },
  accents: { claude: 'Claude', azul: 'Azul', verde: 'Verde', roxo: 'Roxo', rosa: 'Rosa', ciano: 'Ciano', ambar: 'Âmbar', mono: 'Mono' },
  motions: { completa: 'completa', suave: 'suave', parada: 'parada' },
  speeds: { lenta: 'lenta', normal: 'normal', rapida: 'rápida' },
  resolutions: { auto: 'automática', blocos: 'blocos', classica: 'clássica' },
  sizes: { normal: 'normal', grande: 'grande' },
  sounds: { mudo: 'mudo', baixo: 'baixo', alto: 'alto' },
  mascots: { modelo: 'por modelo', sessao: 'por sessão' },
  backends: { image: 'pixels', raster: 'blocos', svg: 'vetor', text: 'texto' },
  toggles: { showRule: 'régua', showStage: 'palco', showContext: 'contexto', showLimits: 'limites', showTurnCost: 'custo do turno', showDayCost: 'custo do dia' },
  tributes: { elsa: 'em homenagem à minha filha' },
}

const EN: Strings = {
  session: ' session',
  turn: 'turn +',
  noCost: 'cost ',
  noEffort: 'effort',
  waiting: 'waiting',
  failed: 'failed',
  agent: 'agent',
  more: count => `+${count} ${count === 1 ? 'agent' : 'agents'}`,
  tools: count => `${count} ${count === 1 ? 'tool' : 'tools'}`,
  fails: count => `${count} failed`,
  today: 'today ',
  fullIn: eta => `full in ${eta}`,
  context: 'context ',
  compact: '⟳ compact',
  compactConfirm: '⟳ confirm compaction?',
  compacting: 'compacting…',
  compactSuggest: 'time to compact?',
  compactUrgent: 'compact before Claude Code does it on its own',
  compactHint: pct => `Context is at ${pct}%: compacting now (⟳ in the bar, or /legends-claude compact) keeps what matters in the summary.`,
  compactFailed: why => `Could not compact: ${why}`,
  compactEmpty: 'There is no conversation to compact yet.',
  compactQueued: 'Compaction requested: it runs as soon as the session is idle.',
  pickModel: 'model ',
  pickEffort: 'effort ',
  switchFailed: (what, why) => `Could not switch ${what}: ${why}`,
  saveFailed: why => `Could not save the settings: ${why}`,
  viewing: 'viewing ',
  backToMain: '← main',
  viewFailed: why => `Could not open the transcript: ${why}`,
  hidden: 'Status bar hidden.',
  shown: 'Status bar visible.',
  tooNarrow: columns => `Status bar visible; it draws once the terminal is at least ${columns} columns wide.`,
  opened: 'Settings opened in the bar.',
  commandDescription: 'Shows or hides the status bar; "settings" opens the settings, "stats" shows the tallies of the session, the day and all time, "compact" compacts the conversation (with instructions: "compact keep the plan"), "demo" plays the stage (as another model and effort: "demo opus max")',
  argumentHint: '[settings|stats|compact [instructions]|demo [model] [effort]]',
  statsOff: 'No stats in this session: the bar could not open its record.',
  stats: {
    title: 'stats',
    session: 'this session',
    today: 'today',
    since: day => `since ${day}`,
    records: 'records',
    bricks: count => `${fmtCount(count, ',')} ${count === 1 ? 'brick' : 'bricks'}`,
    floors: count => `${fmtCount(count, ',')} ${count === 1 ? 'floor' : 'floors'}`,
    fails: count => `${fmtCount(count, ',')} failed`,
    turns: count => `${fmtCount(count, ',')} ${count === 1 ? 'turn' : 'turns'}`,
    sessions: count => `${fmtCount(count, ',')} ${count === 1 ? 'session' : 'sessions'}`,
    longest: span => `longest turn ${span}`,
    mostTools: count => `${fmtCount(count, ',')} ${count === 1 ? 'tool' : 'tools'} in one turn`,
    mostHelpers: count => `${count} ${count === 1 ? 'agent' : 'agents'} at once`,
  },
  demo: 'Stage demo playing.',
  demoAs: (model, effort) => `Stage demo playing, as ${model} · ${effort}.`,
  demoUnknown: words => `Could not make sense of "${words}". After "demo" goes a model (haiku, sonnet, opus, fable), an effort (low, medium, high, xhigh, max), or both.`,
  demoHud: '▶ demo',
  demoBusy: 'The demo runs while the session is idle: wait for the turn to finish.',
  demoOff: 'The stage is off: turn on "stage" and the "full" animation in the settings (⚙).',
  demoNarrow: columns => `The demo needs a terminal at least ${columns} columns wide.`,
  stageAlt: 'The stage: the mascot carries the tool bricks to the wall.',
  panel: {
    title: 'settings',
    demo: ' ▶ demo ',
    reset: ' restore defaults ',
    language: 'language',
    accent: 'color',
    motion: 'animation',
    speed: 'speed',
    resolution: 'resolution',
    inUse: backend => `in use: ${backend}`,
    size: 'size',
    noRoom: '(no effect right now: the bar has no room, or the resolution is classic)',
    avatar: 'mascot',
    playing: name => `on stage: ${name}`,
    sound: 'sound',
    macOnly: '(only plays on macOS)',
    show: 'show',
    agents: 'agents',
    stillSpeed: '(no effect while the animation is still)',
  },
  accents: { claude: 'Claude', azul: 'Blue', verde: 'Green', roxo: 'Purple', rosa: 'Pink', ciano: 'Cyan', ambar: 'Amber', mono: 'Mono' },
  motions: { completa: 'full', suave: 'subtle', parada: 'still' },
  speeds: { lenta: 'slow', normal: 'normal', rapida: 'fast' },
  resolutions: { auto: 'auto', blocos: 'blocks', classica: 'classic' },
  sizes: { normal: 'normal', grande: 'large' },
  sounds: { mudo: 'off', baixo: 'low', alto: 'loud' },
  mascots: { modelo: 'by model', sessao: 'by session' },
  backends: { image: 'pixels', raster: 'blocks', svg: 'vector', text: 'text' },
  toggles: { showRule: 'rule', showStage: 'stage', showContext: 'context', showLimits: 'limits', showTurnCost: 'turn cost', showDayCost: 'day cost' },
  tributes: { elsa: 'in honor of my daughter' },
}

const BY_LANGUAGE: Record<Language, Strings> = { pt: PT, en: EN }

/** Os textos de um idioma. O mesmo objeto a cada chamada: dá para saber se o idioma mudou comparando os dois. */
export const stringsOf = (language: Language): Strings => BY_LANGUAGE[language]

/**
 * O idioma que o sistema pede, pelos locales do ambiente na ordem em que valem (`LC_ALL`, `LC_MESSAGES`,
 * `LANG`): vale o primeiro que estiver definido. "pt_BR.UTF-8" é português; qualquer outro, ou nenhum, inglês.
 */
export const localeLanguage = (...locales: readonly (string | undefined)[]): Language =>
  /^pt([_.@-]|$)/i.test(locales.find(locale => locale) ?? '') ? 'pt' : 'en'
