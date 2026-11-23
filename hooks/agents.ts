import type { AgentInfo } from 'claude-code'

import { clean } from './format'
import type { StatusAgent as Agent, StatusAgentState as AgentState } from '../types'

// As linhas de agente que a barra guarda, e como elas acompanham a lista do engine.

export const LINGER_MS = 8_000 // um agente terminado fica esse tempo na barra
const STALE_MS = 600_000 // um agente fora da lista do engine e mudo por esse tempo é dado como perdido
const SAMPLES_MAX = 16 // as leituras de tokens que a linha guarda: as que o engine dá
const LABEL_MAX = 120

const isLive = (a: Agent) => a.state === 'running' || a.state === 'waiting'
export const isExpired = (a: Agent, now: number) => a.endedAt !== undefined && now - a.endedAt > LINGER_MS

const STATE_OF: Record<AgentInfo['status'], AgentState> = {
  pending: 'running', running: 'running', waiting: 'waiting', idle: 'waiting', completed: 'done', failed: 'failed', killed: 'failed',
}

const newAgent = (id: string, now: number): Agent => ({
  id, type: '', description: '', model: null, state: 'running', startedAt: now, seenAt: now, tools: 0, lastTool: null, // tipo ainda desconhecido
})

// O que a lista do engine sabe de um agente além do estado dele: quanto ele gastou, o resumo do que
// faz agora (quando não é só a descrição da tarefa), as leituras de tokens e quem o chamou. Cada campo
// só entra quando a lista o traz: uma versão do Claude Code que não o dá deixa a linha como era.
const extrasOf = (info: AgentInfo, description: string): Partial<Agent> => {
  const usd = info.cost?.usd
  const label = clean(info.label, LABEL_MAX)
  const samples = Array.isArray(info.tokenSamples) ? info.tokenSamples.filter(n => Number.isFinite(n)).slice(-SAMPLES_MAX) : []
  return {
    ...(typeof usd === 'number' && Number.isFinite(usd) && { costUsd: usd }),
    ...(label && label !== description && { label }),
    ...(samples.length > 0 && { samples }),
    ...(typeof info.parentId === 'string' && info.parentId && { parentId: info.parentId }),
  }
}

// Puro: aplica `fn` ao agente `id`, criando a linha quando ainda não existe.
export const upsert = (rows: readonly Agent[], id: string, now: number, fn: (a: Agent) => Agent): Agent[] =>
  rows.some(a => a.id === id) ? rows.map(a => (a.id === id ? fn(a) : a)) : [...rows, fn(newAgent(id, now))]

// Puro: as linhas conferidas com a lista do engine. Quem acabou há tempo sai, quem a lista dá como
// terminado termina, quem roda sem linha ganha uma, e quem sumiu da lista e está mudo há muito é largado.
export const reconcileRows = (rows: readonly Agent[], listed: readonly AgentInfo[], now: number): Agent[] => {
  const byId = new Map(listed.map(i => [i.id, i]))
  const kept = rows
    .filter(a => !isExpired(a, now))
    .filter(a => !isLive(a) || byId.has(a.id) || now - a.seenAt <= STALE_MS)
    .map(a => {
      const info = byId.get(a.id)
      if (!info) return a
      const description = a.description || clean(info.description, 120)
      // Quem já terminou segue na barra por uns segundos: o custo e os tokens finais dele ainda chegam.
      const known = { ...a, ...extrasOf(info, description) }
      if (!isLive(a)) return known
      const state = STATE_OF[info.status]
      return {
        ...known,
        state,
        type: a.type || clean(info.type, 40),
        description,
        ...(!isLive({ ...a, state }) && { endedAt: now }),
      }
    })
  const adopted = listed
    .filter(i => (i.status === 'running' || i.status === 'pending') && !rows.some(a => a.id === i.id))
    .map(i => {
      const description = clean(i.description, 120)
      return { ...newAgent(i.id, now), type: clean(i.type, 40), description, ...extrasOf(i, description) }
    })
  return [...kept, ...adopted]
}
