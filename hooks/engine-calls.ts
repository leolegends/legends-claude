import type { EngineInterface } from 'claude-code'

import { clean } from './format'
import { localeLanguage } from './i18n'
import type { Strings } from './i18n'
import { closeLedger, openLedger } from './ledger'
import { sanitize } from './settings'
import type { StatusSettings as Settings } from '../types'

// O que a barra pede ao engine sem mexer no estado dela: o aviso de um erro de fundo, o tema, os
// ajustes salvos, o que se sabe da sessão, o anel de foco e a troca da vista. Cada função daqui recebe
// `$` e é uma declaração `function`: fora do register.tsx, o engine só aceita `$` assim.

/** A chave dos ajustes no `$.store`: valem para todas as sessões. */
export const SETTINGS_KEY = 'settings'

const reported = new Set<string>()

/** Um erro de fundo aparece uma vez por origem, numa linha discreta: nunca é engolido, nunca vira enxurrada. */
export function report($: EngineInterface, where: string, err: unknown) {
  if (reported.has(where)) return
  reported.add(where)
  $.ui.log(`legends-claude: ${where}: ${clean(err instanceof Error ? err.message : String(err), 200)}`)
}

/** O tema é claro quando o nome dele diz ("light", "light-daltonized"); um tema de nome desconhecido vale como escuro. */
export const isLightName = (value: unknown) => /light/i.test(String(value ?? ''))

/** O tema em vigor é claro, pela linha dele no /config; `null` quando não deu para ler (e o aviso já foi dado). */
export async function readTheme($: EngineInterface): Promise<boolean | null> {
  try {
    return isLightName((await $.config.list()).find(row => row.key === 'theme')?.value)
  } catch (err) {
    report($, 'theme', err)
    return null
  }
}

/**
 * Os ajustes desta sessão: os salvos, conferidos campo a campo. Quando nenhum idioma foi salvo: quem já
 * tinha ajustes de antes de haver idiomas continua em português, a única língua da barra até então;
 * numa instalação nova, vale o idioma do sistema.
 */
export async function loadSettings($: EngineInterface): Promise<Settings> {
  const stored = await $.store.get(SETTINGS_KEY)
  if (stored && typeof stored === 'object') return sanitize(stored)
  const locales = await Promise.all([$.env.get('LC_ALL'), $.env.get('LC_MESSAGES'), $.env.get('LANG')]).catch(() => [])
  return sanitize(undefined, localeLanguage(...locales))
}

/** O que se sabe da sessão além do que a barra mostra: o id dela, e se o Claude Code tem como tocar som aqui. */
export type SessionFacts = { seed: string; isSilent: boolean }

/**
 * Abre o livro de contas da sessão (ledger.ts) e lê o que mais se sabe dela: o id, de onde sai o
 * avatar "por sessão", e o sistema, que diz se há como tocar som (só no macOS). Sem o livro a barra
 * segue sem as contas; sem o sistema, sem o aviso de que o som não toca.
 */
export async function openBooks($: EngineInterface, now: number, cost: number | undefined): Promise<SessionFacts> {
  let seed = ''
  try {
    seed = await openLedger($, now, cost)
  } catch (err) {
    closeLedger()
    report($, 'stats', err)
  }
  try {
    const platform = (await $.session.info()).platform
    return { seed, isSilent: platform !== undefined && platform !== 'unknown' && platform !== 'macos' }
  } catch (err) {
    report($, 'platform', err)
    return { seed, isSilent: false }
  }
}

/**
 * O anel de foco da faixa acompanha o que abre e fecha nela: quem navega pelo teclado (ctrl+x tab, Tab
 * ou as setas, Enter) cai na opção em vigor de um seletor recém-aberto e volta ao botão que o abriu
 * quando ele fecha. Sem o teclado na faixa o engine recusa o pedido, e nada muda: a recusa não é um
 * erro. Na versão 2.1.327 um clique num botão o aperta sem dar o teclado à faixa, então é a resposta
 * de sempre para quem usa o mouse; se um clique der o teclado, o anel aparece onde um Enter agiria.
 */
export async function follow($: EngineInterface, requestId: string, key: string) {
  try {
    await $.ui.focus({ requestId, key })
  } catch (err) {
    report($, 'focus', err)
  }
}

/**
 * Um clique na linha de um agente: a transcrição dele vai para a vista principal, como a troca pela
 * lista de tarefas do Claude Code. Sem agente, volta a conversa principal. O engine só troca a vista
 * em resposta a um gesto da pessoa, e diz por que não trocou: o aviso repete o motivo, no idioma de `t`.
 */
export async function viewAgent($: EngineInterface, agentId: string | undefined, t: Strings) {
  try {
    const moved = await $.ui.view(agentId === undefined ? {} : { agentId })
    if (moved?.deny !== undefined) $.ui.toast(t.viewFailed(clean(moved.deny, 120)))
  } catch (err) {
    $.ui.toast(t.viewFailed(clean(err instanceof Error ? err.message : String(err), 120)))
  }
}
