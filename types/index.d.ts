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
  showLimits: boolean
  showTurnCost: boolean
  maxAgents: 3 | 6 | 10
}

/** Uma janela de limite de uso (5 horas, 7 dias): quanto já foi e quando zera. */
export type StatusLimit = { pct: number; resetsAt?: string }

/** O que o card mostra da sessão: modelo, effort, custo e limites. */
export type StatusFigures = {
  model: string | null
  effort: string | null
  costUsd?: number
  /** Quando o custo cresceu pela última vez; o valor pisca por um instante depois disso. */
  costMovedAt?: number
  fiveHour?: StatusLimit
  week?: StatusLimit
}

/** O turno do loop principal: quando começou, quantas ferramentas chamou e o custo na largada. */
export type StatusMain = {
  startedAt: number
  tools: number
  lastTool: string | null
  /** Custo da sessão quando o turno começou; `null` enquanto nenhum turno começou. */
  costAtStart: number | null
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
