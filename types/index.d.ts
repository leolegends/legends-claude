/** O que a barra tem aberto sob o cabeçalho: o seletor de modelo, o de effort, a aba de ajustes, ou nada. */
export type StatusPicker = 'model' | 'effort' | 'settings' | null

/** O idioma dos textos da barra. */
export type StatusLanguage = 'pt' | 'en'
/** A cor de destaque escolhida nos ajustes. */
export type StatusAccent = 'claude' | 'azul' | 'verde' | 'roxo' | 'rosa' | 'ciano' | 'ambar' | 'mono'
/** Quanto a barra se mexe: tudo, só a faísca e o cometa, ou nada. */
export type StatusMotion = 'completa' | 'suave' | 'parada'
/** A duração de um quadro da animação. */
export type StatusSpeed = 'lenta' | 'normal' | 'rapida'
/**
 * Em que o palco é desenhado: `auto` é o melhor que a tela der (pixels de verdade num terminal que
 * desenha imagens, blocos de terminal nos outros, vetor no app desktop); `blocos` são blocos mesmo
 * onde há pixels; `classica` é o palco de texto de sempre.
 */
export type StatusResolution = 'auto' | 'blocos' | 'classica'
/** O tamanho do palco: o de sempre (quatro linhas) ou o dobro, onde os blocos de terminal mostram mais detalhe. */
export type StatusSize = 'normal' | 'grande'
/** Um desenho do mascote no palco: o Clawd de sempre (na cor de destaque) ou um avatar colorido. */
export type StatusAvatar = 'clawd' | 'pikachu' | 'mario' | 'kratos' | 'elsa'
/**
 * Quem é o mascote no palco, como os ajustes guardam: um avatar fixo, ou um que a barra escolhe:
 * `modelo` é o avatar da classe do modelo (muda quando o modelo muda); `sessao`, um avatar colorido
 * que sai do id da sessão (o mesmo a sessão inteira, e quase sempre outro na sessão ao lado).
 */
export type StatusMascot = StatusAvatar | 'modelo' | 'sessao'
/** O som da barra: nenhum, baixo ou alto. Só toca onde o Claude Code tem como tocar (no macOS). */
export type StatusSound = 'mudo' | 'baixo' | 'alto'

/** Os ajustes da aba ⚙: guardados no store do plugin, valem para todas as sessões. */
export type StatusSettings = {
  language: StatusLanguage
  accent: StatusAccent
  motion: StatusMotion
  speed: StatusSpeed
  showRule: boolean
  /** O palco: o mascote levando os tijolos das ferramentas até a parede, com um ajudante por agente. */
  showStage: boolean
  /** Em que o palco é desenhado. */
  resolution: StatusResolution
  /** O tamanho do palco; `grande` só vale fora do palco de texto, e onde a barra tem largura e altura para ele. */
  size: StatusSize
  /** Quem é o mascote no palco: um avatar fixo, o da classe do modelo ou o da sessão. */
  avatar: StatusMascot
  /** Os sons da barra: o fim do turno, um ajudante que nasce, um pedido que espera pela pessoa. */
  sound: StatusSound
  showLimits: boolean
  showTurnCost: boolean
  /** O custo de hoje, somado entre as sessões: só aparece quando difere do da sessão. */
  showDayCost: boolean
  /** A linha do contexto: quanto da janela do modelo a conversa ocupa, com o botão de compactar. */
  showContext: boolean
  maxAgents: 3 | 6 | 10
}

/**
 * A janela de contexto do modelo como a barra mostra: o tamanho dela e, depois da primeira resposta da
 * janela em curso, quanto a conversa ocupa (`tokens` e `pct`, de 0 a 100). Uma sessão nova, ou recém-
 * compactada, fica sem `tokens` e `pct` até a próxima resposta.
 */
export type StatusContext = { window: number; tokens?: number; pct?: number }

/** Uma leitura de uma janela de limite: quando foi vista e em quanto estava. */
export type StatusLimitSample = { at: number; pct: number }
/**
 * Uma janela de limite de uso (5 horas, 7 dias): quanto já foi e quando zera. `trail` são as leituras
 * recentes dela, da mais antiga à mais nova: de onde sai o ritmo, e a previsão de quando ela enche.
 */
export type StatusLimit = { pct: number; resetsAt?: string; trail?: StatusLimitSample[] }

/** O que o card mostra da sessão: modelo, effort, custo e limites. */
export type StatusFigures = {
  model: string | null
  effort: string | null
  costUsd?: number
  /** Quando o custo cresceu pela última vez; o valor pisca por um instante depois disso. */
  costMovedAt?: number
  fiveHour?: StatusLimit
  week?: StatusLimit
  /** A janela de contexto do modelo; ausente antes da primeira leitura. */
  context?: StatusContext
}

/** O turno do loop principal: quando começou, quantas ferramentas chamou e o custo na largada. */
export type StatusMain = {
  startedAt: number
  tools: number
  lastTool: string | null
  /** Custo da sessão quando o turno começou; `null` enquanto nenhum turno começou. */
  costAtStart: number | null
  /** Quantas ferramentas do turno terminaram em erro (ou foram recusadas). */
  fails?: number
}

/** Onde um agente está: rodando, esperando (entre turnos), terminado ou falho. */
export type StatusAgentState = 'running' | 'waiting' | 'done' | 'failed'

/** Um agente (subagente, teammate, agente de workflow) como o card o desenha. */
export type StatusAgent = {
  id: string
  type: string
  description: string
  model: string | null
  /** O effort do último pedido do agente; ausente enquanto ele não fez nenhum, ou num modelo sem effort. */
  effort?: string | null
  state: StatusAgentState
  startedAt: number
  /** Último sinal de vida (spawn, passo ou chamada de ferramenta). */
  seenAt: number
  endedAt?: number
  tools: number
  lastTool: string | null
  /** Tokens do último turno do agente, somados (entrada, saída e cache). */
  tokens?: number
  /** Quantas ferramentas dele terminaram em erro (ou foram recusadas). */
  fails?: number
  /** O que o agente gastou até agora, pela lista do engine; ausente onde ela não diz. */
  costUsd?: number
  /** O que ele faz agora: o resumo de progresso que o engine guarda dele; ausente enquanto não há um. */
  label?: string
  /** As últimas leituras de tokens dele, da mais antiga à mais nova: de onde sai o gráfico de atividade. */
  samples?: number[]
  /** O agente que o chamou; ausente quando foi a conversa principal. */
  parentId?: string
}

declare module 'claude-code' {
  interface PluginState {
    'legends-claude': {
      figures: StatusFigures
      main: StatusMain
      agents: StatusAgent[]
      /** O quadro da animação: anda só enquanto há trabalho em curso. */
      frame: number
      isHidden: boolean
      /** O seletor ou a aba aberta por um clique no modelo, no effort ou no ⚙. */
      picker: StatusPicker
      /** Os ajustes em vigor nesta sessão (espelho do store). */
      settings: StatusSettings
      /** O que o terminal respondeu sobre desenhar imagens: ainda não se sabe, sim, ou não. */
      pixels: 'unknown' | 'yes' | 'no'
    }
  }
}
