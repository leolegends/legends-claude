import type { EngineInterface, RenderElement } from 'claude-code'

import { hdScene } from './hd'
import type { Zoom } from './hd'
import { askPixels, canRepaint, dropStage, watchStage } from './painter'
import type { Host } from './painter'
import type { Line, Part } from './parts'
import type { Power } from './power'
import { sceneRows } from './scene'
import { hasScene } from './sim'
import type { Geo, Sim } from './sim'
import { alphaOf } from './stage'
import type { Backend, Look, Pixels } from './stage'
import { probeNode, stageNode } from './stage-node'

// O palco de um desenho da barra: da cena de agora ao elemento que esta tela sabe mostrar (uma imagem,
// uma grade de blocos, um SVG) ou, sem elemento, às linhas de texto de sempre.

/** O que um desenho da barra sabe do palco: em que ele sai, as medidas, o placar, o poder de cada um, as cores e a hora. */
export type StageInput = {
  backend: Backend
  /** O que o terminal respondeu sobre desenhar imagens. */
  known: Pixels
  /** O palco está à vista: não com a barra recolhida, nem com a aba de ajustes no lugar das linhas. */
  isShown: boolean
  /** A resolução dos ajustes é a automática: enquanto não se sabe se o terminal desenha imagens, pergunta-se. */
  isAuto: boolean
  geo: Geo | null
  zoom: Zoom
  hud: Part[]
  powers: ReadonlyMap<string, Power>
  /** O tema, a cor de destaque e o avatar do mascote. */
  look: Look
  /** O que o palco diz a quem não vê a imagem dele. */
  alt: string
  now: number
}

/** A cena que a barra tem agora: o estado mostrado, o seguinte, quando foi o passo, quanto dura um quadro, e a guarda do palco. */
export type Live = { prev: Sim; cur: Sim; steppedAt: number; frameMs: number; host: Host }

/**
 * O palco de um desenho: em que ele sai nesta tela, o elemento dele (uma imagem, uma grade de blocos,
 * um SVG) ou, sem elemento, as linhas de texto de sempre; e a imagem de sondagem, quando é hora dela.
 */
export type StageDraw = { backend: Backend; node: RenderElement | null; lines: Line[]; probe: RenderElement | null }
export type BandInput = { surface: string; requestId: string }

/**
 * O palco deste desenho. No terminal a cena em pixels ou em blocos segue a caminho entre dois quadros,
 * e quem repinta completa o caminho; fora dele (ou sem como repintar) mostra o quadro inteiro. Se a
 * tela não tem como desenhar o elemento, ficam as linhas de texto. Só um palco à vista é repintado: o
 * que não está na tela recusaria cada pintura.
 */
export function drawStage($: EngineInterface, e: BandInput, table: object, input: StageInput, live: Live): StageDraw {
  const { backend, known, isShown, isAuto, geo, zoom, hud, powers, look, alt, now } = input
  const { prev, cur, host } = live
  const isTerminal = e.surface === 'terminal'
  if (!isShown) {
    if (isTerminal) dropStage()
    return { backend, node: null, lines: [], probe: null }
  }
  const alpha = isTerminal && canRepaint() ? alphaOf(now, live.steppedAt, live.frameMs) : 1
  const scene = geo && hasScene(cur) && backend !== 'text'
    ? host.guard(() => hdScene({ prev, cur, alpha, geo, hud, powers, ...look, trace: backend === 'raster' ? 'blocks' : 'pixels', zoom }), null)
    : null
  const node = scene ? host.guard(() => stageNode(table, backend, scene, look, alt), null) : null
  if (isTerminal) {
    if (node && scene && geo && (backend === 'image' || backend === 'raster'))
      watchStage($, { requestId: e.requestId, backend, columns: scene.columns, rows: scene.rows }, { geo, zoom, hud, powers, look }, host, now)
    else dropStage()
  }
  // Enquanto não se sabe se o terminal desenha imagens, uma imagem de sondagem vai no canto da barra.
  const probe = isTerminal && isAuto && known === 'unknown' && canRepaint() ? probeNode(table) : null
  if (probe) askPixels($, e.requestId, now, host.report)
  const lines = node || !geo || !hasScene(cur)
    ? []
    : host.guard(() => sceneRows({ sim: cur, geo, hud, powers, isLight: look.isLight, avatar: look.avatar }).map(parts => ({ parts })), [])
  return { backend, node, lines, probe }
}
