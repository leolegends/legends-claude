/** Qual seletor a barra tem aberto: o de modelo, o de effort, ou nenhum. */
export type StatusPicker = 'model' | 'effort' | null

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
      /** O seletor aberto por um clique no modelo ou no effort. */
      picker: StatusPicker
    }
  }
}
