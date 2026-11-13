import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { packCells } from './blocks'
import { hdScene } from './hd'
import type { Zoom } from './hd'
import type { Part } from './parts'
import type { Power } from './power'
import type { Geo, Sim } from './sim'
import { PROBE_PNG, alphaOf, isPixelRefusal, paintEvery, rasterCells, stageImage } from './stage'
import type { Look, Pixels } from './stage'

// Quem repinta o palco entre um quadro e outro. A barra é redesenhada a cada quadro da simulação
// (oito por segundo, na velocidade normal); entre dois desenhos, o palco de imagem ou de blocos é
// repintado no lugar (`$.ui.blit`, sem redesenhar a barra), perto de 25 vezes por segundo: os bichos
// deslizam de onde estavam para onde vão. É também quem pergunta ao terminal se ele desenha imagens.

// O que o terminal respondeu sobre desenhar imagens. Fica no estado da sessão: um reload do mod não
// pergunta de novo, e a resposta redesenha a barra sozinha (ela lê o mesmo valor, pela referência dela:
// o engine quer cada referência de estado escrita no arquivo que a usa).
const pixels = atom({ plugin: 'legends-claude', key: 'pixels' } as const, 'unknown' as Pixels)

/** O endereço do palco e o da imagem de sondagem dentro da barra: o que `$.ui.blit` nomeia. */
export const STAGE_KEY = 'stage'
export const PROBE_KEY = 'probe'

const PROBE_WAIT_MS = 150 // do desenho da imagem de sondagem até a pergunta: o tempo de ela chegar à tela
const PROBE_TRIES = 4 // quantas vezes se pergunta enquanto a resposta for "ainda não está na tela"
const PROBE_REST_MS = 5_000 // sem resposta depois disso tudo, quanto se espera para perguntar de novo
const MISSES_MAX = 8 // tantas pinturas recusadas em seguida: o palco descansa antes de ser repintado de novo
const REST_MS = 1_000 // quanto ele descansa
const FAILURES_MAX = 3 // tantas pinturas que estouram em seguida: esta versão não tem `blit` que funcione

/** O palco que o último desenho da barra pôs no terminal: onde, de que tipo e de que tamanho. */
export type Mount = { requestId: string; backend: 'image' | 'raster'; columns: number; rows: number }

/** O que o último desenho sabia e a pintura reusa: as medidas, o tamanho, o placar, o poder de cada um e as cores. */
export type StageView = { geo: Geo; zoom: Zoom; hud: readonly Part[]; powers: ReadonlyMap<string, Power>; look: Look }

/** A cena entre dois quadros: o estado mostrado, o seguinte, quando foi o passo e quanto dura um quadro. */
export type Tween = { prev: Sim; cur: Sim; steppedAt: number; frameMs: number; isRunning: boolean }

/** O aviso de um erro de fundo: de onde veio, e o erro. */
export type Report = (where: string, err: unknown) => void

/** O que a barra empresta ao pintor: a cena de agora, o aviso de erro e a guarda do palco. */
export type Host = {
  tween: () => Tween
  report: Report
  /** Roda algo do palco: um erro ali vira `fallback`, nunca derruba a barra. */
  guard: <T>(run: () => T, fallback: T) => T
}

type Timer = ReturnType<EngineInterface['clock']['every']>
type Payload = ReturnType<typeof stagePayload>

// Variáveis do módulo: um reload zera todas, e os timers do módulo anterior caem junto.
let painter: Timer | null = null
let painterMs = 0
let isPainting = false
let canBlit = true // `$.ui.blit` responde: numa versão sem ele, as primeiras chamadas estouram e isto apaga
let failures = 0 // pinturas que estouraram em seguida
let misses = 0 // pinturas recusadas em seguida
let restUntil = -Infinity // antes disso o palco não é repintado: muitas recusas em seguida
let mounted: Mount | null = null
let view: StageView | null = null
let host: Host | null = null
let isProbing = false
let probeAfter = -Infinity // antes disso não se pergunta de novo ao terminal
let era = 0 // a sessão em curso: o que ficou no ar da anterior (uma pintura, uma pergunta) não mexe nesta

/** Dá para repintar o palco no lugar: `$.ui.blit` não falhou nesta sessão. */
export const canRepaint = (): boolean => canBlit

/** Puro: o que o palco mostra num instante do caminho, como o elemento dele o quer. */
export const stagePayload = (backend: Mount['backend'], { geo, zoom, hud, powers, look }: StageView, { prev, cur }: Tween, alpha: number) => {
  const scene = hdScene({ prev, cur, alpha, geo, hud, powers, isLight: look.isLight, accent: look.accent, avatar: look.avatar, trace: backend === 'image' ? 'pixels' : 'blocks', zoom })
  return backend === 'image' ? { source: { png: stageImage(scene) } } : { cells: packCells(rasterCells(scene, look)) }
}

const stopPainter = () => {
  painter?.cancel()
  painter = null
  painterMs = 0
}

// O terminal não está desenhando a imagem do palco: o palco volta aos blocos. A resposta vai para o
// estado (a barra se redesenha sozinha) e a próxima pergunta espera um pouco. `no` quando ele disse
// que não desenha imagens; `unknown` quando só parou de aceitar as pinturas: aí se pergunta de novo.
async function demote($: EngineInterface, answer: Pixels, now: number, report: Report) {
  mounted = null
  stopPainter()
  probeAfter = now + PROBE_REST_MS
  try {
    await update($, pixels, () => answer)
  } catch (err) {
    report('pixels', err)
  }
}

// Uma pintura recusada. Se o terminal diz que não desenha a imagem ali, blocos. Qualquer outra recusa
// (o tamanho mudou, o palco saiu da tela) passa sozinha; muitas em seguida, o palco descansa um
// instante e é repintado de novo depois; se era uma imagem, pergunta-se outra vez ao terminal.
async function refused($: EngineInterface, target: Mount, result: { deny?: string; fix?: string }, now: number, report: Report) {
  if (isPixelRefusal(result)) return demote($, 'no', now, report)
  misses += 1
  if (misses < MISSES_MAX) return
  misses = 0
  if (target.backend === 'image') return demote($, 'unknown', now, report)
  restUntil = now + REST_MS
  stopPainter()
}

// Manda uma pintura. Um estouro não é uma recusa: é o `blit` que não existe ou falhou. Uma vez pode ser
// passageiro; algumas em seguida, esta versão não repinta, e o palco segue no ritmo dos quadros.
async function send($: EngineInterface, target: Mount, payload: Payload, now: number, report: Report, born: number) {
  let result: { deny?: string; fix?: string } | undefined
  try {
    result = await $.ui.blit({ requestId: target.requestId, key: STAGE_KEY, columns: target.columns, rows: target.rows, ...payload })
  } catch (err) {
    if (born !== era) return
    failures += 1
    if (failures < FAILURES_MAX) return
    canBlit = false
    stopPainter()
    report('blit', err)
    return
  }
  if (born !== era) return
  failures = 0
  if (result?.deny === undefined) {
    misses = 0
    return
  }
  await refused($, target, result, now, report)
}

async function paint($: EngineInterface) {
  if (isPainting) return
  const target = mounted
  const seen = view
  const source = host
  const born = era
  if (!target || !seen || !source || !canBlit) return stopPainter()
  isPainting = true
  try {
    const now = await $.clock.now()
    const tween = source.tween()
    const alpha = alphaOf(now, tween.steppedAt, tween.frameMs)
    const payload = source.guard(() => stagePayload(target.backend, seen, tween, alpha), null)
    if (payload && born === era) await send($, target, payload, now, source.report, born)
    if (born === era && !tween.isRunning && alpha >= 1) stopPainter() // a cena parou, e o fim do caminho já foi pintado
  } catch (err) {
    source.report('paint', err) // esta pintura se perdeu; a próxima tenta de novo
  } finally {
    if (born === era) isPainting = false
  }
}

/**
 * O desenho da barra pôs um palco de imagem ou de blocos no terminal: ele passa a ser repintado entre
 * os quadros, enquanto a cena andar. Chamado a cada desenho que mostra o palco, com o que o desenho sabia.
 */
export function watchStage($: EngineInterface, mount: Mount, seen: StageView, lender: Host, now: number) {
  const isSame = mounted !== null && mounted.requestId === mount.requestId && mounted.backend === mount.backend && mounted.columns === mount.columns && mounted.rows === mount.rows
  if (!isSame) {
    misses = 0
    restUntil = -Infinity
  }
  mounted = mount
  view = seen
  host = lender
  if (!canBlit || now < restUntil) return
  const ms = paintEvery(lender.tween().frameMs)
  if (painter && painterMs === ms) return
  stopPainter()
  painterMs = ms
  painter = $.clock.every(ms, () => void paint($))
}

/** O terminal está sem palco para repintar (a barra escondida ou recolhida, os ajustes abertos, o palco em texto, a cena fora de vista). */
export const dropStage = () => {
  mounted = null
  view = null
  stopPainter()
}

// Uma pergunta ao terminal: troca a imagem de sondagem por ela mesma. Aceita, ele desenha imagens;
// recusada porque a imagem "desenha o texto no lugar", não desenha; outra recusa, ou um estouro, ainda
// não se sabe (o estouro vai junto, para quem pergunta decidir).
async function ask($: EngineInterface, requestId: string): Promise<{ answer: Pixels; error?: unknown }> {
  try {
    const result = await $.ui.blit({ requestId, key: PROBE_KEY, source: { png: PROBE_PNG }, columns: 1, rows: 1 })
    return { answer: result?.deny === undefined ? 'yes' : isPixelRefusal(result) ? 'no' : 'unknown' }
  } catch (error) {
    return { answer: 'unknown', error }
  }
}

async function probe($: EngineInterface, requestId: string, report: Report, born: number, tries: number) {
  if (born !== era) return // a pergunta era de uma sessão que já acabou
  // se a pintura já mostrou que não há `blit`, a pergunta nem é feita: a resposta é não, e o aviso já saiu
  const { answer, error } = canBlit ? await ask($, requestId) : { answer: 'no' as Pixels, error: undefined }
  if (born !== era) return
  if (answer === 'unknown' && tries + 1 < PROBE_TRIES) {
    $.clock.after(PROBE_WAIT_MS, () => void probe($, requestId, report, born, tries + 1))
    return
  }
  isProbing = false
  try {
    if (answer !== 'unknown') {
      await update($, pixels, () => answer)
    } else if (error !== undefined) {
      // todas as perguntas estouraram: não há `blit` que responda. Blocos, e o motivo aparece uma vez.
      canBlit = false
      report('probe', error)
      await update($, pixels, () => 'no')
    } else {
      // a imagem de sondagem não chegou à tela (a barra recolhida, por exemplo): pergunta de novo mais tarde
      probeAfter = (await $.clock.now()) + PROBE_REST_MS
    }
  } catch (err) {
    report('probe', err)
  }
}

/**
 * A barra acabou de desenhar a imagem de sondagem: pergunta ao terminal, uma vez, se ele desenha
 * imagens. A resposta vai para o estado `pixels`, que redesenha a barra.
 */
export function askPixels($: EngineInterface, requestId: string, now: number, report: Report) {
  if (isProbing || now < probeAfter || !canBlit) return
  isProbing = true
  const born = era
  $.clock.after(PROBE_WAIT_MS, () => void probe($, requestId, report, born, 0))
}

/** A pessoa pediu para conferir de novo se o terminal desenha imagens: a próxima pergunta não espera. */
export const askAgain = () => {
  probeAfter = -Infinity
}

/** Uma sessão nova: nada do que o pintor guardava vale mais, e o que ficou no ar da anterior não mexe nesta. */
export const resetPainter = () => {
  era += 1
  dropStage()
  host = null
  canBlit = true
  failures = 0
  misses = 0
  restUntil = -Infinity
  isPainting = false
  isProbing = false
  probeAfter = -Infinity
}
