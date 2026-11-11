import type {
  StatusAccent as Accent,
  StatusLanguage as Language,
  StatusMotion as Motion,
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
export type ToggleKey = 'showRule' | 'showStage' | 'showLimits' | 'showTurnCost'

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
  // Os seletores de modelo e effort, o comando e os avisos.
  pickModel: string
  pickEffort: string
  switchFailed: (what: string, why: string) => string
  saveFailed: (why: string) => string
  hidden: string
  shown: string
  tooNarrow: (columns: number) => string
  opened: string
  commandDescription: string
  argumentHint: string
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
  // A aba de ajustes: o cabeçalho, os rótulos das linhas e os das opções.
  panel: {
    title: string
    demo: string
    reset: string
    language: string
    accent: string
    motion: string
    speed: string
    show: string
    agents: string
    stillSpeed: string
  }
  accents: Record<Accent, string>
  motions: Record<Motion, string>
  speeds: Record<Speed, string>
  toggles: Record<ToggleKey, string>
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
  pickModel: 'modelo ',
  pickEffort: 'effort ',
  switchFailed: (what, why) => `Não deu para trocar ${what}: ${why}`,
  saveFailed: why => `Não deu para salvar os ajustes: ${why}`,
  hidden: 'Barra de status escondida.',
  shown: 'Barra de status visível.',
  tooNarrow: columns => `Barra de status visível; ela desenha quando o terminal tiver pelo menos ${columns} colunas.`,
  opened: 'Ajustes abertos na barra.',
  commandDescription: 'Mostra ou esconde a barra de status; "ajustes" abre os ajustes, "demo" mostra o palco em ação (com outro modelo e effort: "demo opus max")',
  argumentHint: '[ajustes|demo [modelo] [effort]]',
  demo: 'Demonstração do palco em cena.',
  demoAs: (model, effort) => `Demonstração do palco em cena, como ${model} · ${effort}.`,
  demoUnknown: words => `Não entendi "${words}". Depois de "demo" vai um modelo (haiku, sonnet, opus, fable), um effort (low, medium, high, xhigh, max), ou os dois.`,
  demoHud: '▶ demonstração',
  demoBusy: 'A demonstração roda com a sessão parada: espere o turno terminar.',
  demoOff: 'O palco está desligado: ligue "palco" e a animação "completa" nos ajustes (⚙).',
  demoNarrow: columns => `A demonstração precisa de um terminal com pelo menos ${columns} colunas.`,
  panel: {
    title: 'ajustes',
    demo: ' ▶ demonstração ',
    reset: ' restaurar padrão ',
    language: 'idioma',
    accent: 'cor',
    motion: 'animação',
    speed: 'velocidade',
    show: 'mostrar',
    agents: 'agentes',
    stillSpeed: '(sem efeito com animação parada)',
  },
  accents: { claude: 'Claude', azul: 'Azul', verde: 'Verde', roxo: 'Roxo', rosa: 'Rosa', ciano: 'Ciano', ambar: 'Âmbar', mono: 'Mono' },
  motions: { completa: 'completa', suave: 'suave', parada: 'parada' },
  speeds: { lenta: 'lenta', normal: 'normal', rapida: 'rápida' },
  toggles: { showRule: 'régua', showStage: 'palco', showLimits: 'limites', showTurnCost: 'custo do turno' },
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
  pickModel: 'model ',
  pickEffort: 'effort ',
  switchFailed: (what, why) => `Could not switch ${what}: ${why}`,
  saveFailed: why => `Could not save the settings: ${why}`,
  hidden: 'Status bar hidden.',
  shown: 'Status bar visible.',
  tooNarrow: columns => `Status bar visible; it draws once the terminal is at least ${columns} columns wide.`,
  opened: 'Settings opened in the bar.',
  commandDescription: 'Shows or hides the status bar; "settings" opens the settings, "demo" plays the stage (as another model and effort: "demo opus max")',
  argumentHint: '[settings|demo [model] [effort]]',
  demo: 'Stage demo playing.',
  demoAs: (model, effort) => `Stage demo playing, as ${model} · ${effort}.`,
  demoUnknown: words => `Could not make sense of "${words}". After "demo" goes a model (haiku, sonnet, opus, fable), an effort (low, medium, high, xhigh, max), or both.`,
  demoHud: '▶ demo',
  demoBusy: 'The demo runs while the session is idle: wait for the turn to finish.',
  demoOff: 'The stage is off: turn on "stage" and the "full" animation in the settings (⚙).',
  demoNarrow: columns => `The demo needs a terminal at least ${columns} columns wide.`,
  panel: {
    title: 'settings',
    demo: ' ▶ demo ',
    reset: ' restore defaults ',
    language: 'language',
    accent: 'color',
    motion: 'animation',
    speed: 'speed',
    show: 'show',
    agents: 'agents',
    stillSpeed: '(no effect while the animation is still)',
  },
  accents: { claude: 'Claude', azul: 'Blue', verde: 'Green', roxo: 'Purple', rosa: 'Pink', ciano: 'Cyan', ambar: 'Amber', mono: 'Mono' },
  motions: { completa: 'full', suave: 'subtle', parada: 'still' },
  speeds: { lenta: 'slow', normal: 'normal', rapida: 'fast' },
  toggles: { showRule: 'rule', showStage: 'stage', showLimits: 'limits', showTurnCost: 'turn cost' },
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
