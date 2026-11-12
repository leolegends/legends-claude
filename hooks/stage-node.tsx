import type { RenderElement } from 'claude-code'

import { packCells } from './blocks'
import type { HdScene } from './hd'
import { PROBE_KEY, STAGE_KEY } from './painter'
import { PROBE_PNG, rasterCells, stageImage, stageSvg } from './stage'
import type { Abilities, Backend, Look } from './stage'

// O palco como elemento da tela. Cada superfície tem a sua tabela de elementos: o terminal tem `Image`
// (pixels) e `Raster` (uma grade de células); o app desktop tem `Svg`. Uma versão do Claude Code sem
// algum deles simplesmente não o oferece: quem chama cai no palco de texto.

type Leaf = (props: Record<string, unknown>) => RenderElement

// Um elemento da tabela pelo nome, ou `null` quando esta tela (ou esta versão) não o tem.
const leafOf = (table: object, name: string): Leaf | null => {
  const element = (table as Record<string, unknown>)[name]
  return typeof element === 'function' ? (element as Leaf) : null
}

/** O que a tabela de elementos desta tela oferece para o palco. */
export const offeredBy = (table: object): Omit<Abilities, 'pixels'> => ({
  hasImage: leafOf(table, 'Image') !== null,
  hasRaster: leafOf(table, 'Raster') !== null,
  hasSvg: leafOf(table, 'Svg') !== null,
})

/**
 * O elemento do palco para esta tela, ou `null` quando ela não tem como desenhá-lo (o elemento falta,
 * ou o SVG passaria do limite). `alt` é o que o palco diz a quem não vê a imagem.
 */
export const stageNode = (table: object, backend: Backend, scene: HdScene, look: Look, alt: string): RenderElement | null => {
  const Raster = leafOf(table, 'Raster')
  const Image = leafOf(table, 'Image')
  const Svg = leafOf(table, 'Svg')
  if (backend === 'raster' && Raster) return <Raster key={STAGE_KEY} columns={scene.columns} rows={scene.rows} cells={packCells(rasterCells(scene, look))} />
  if (backend === 'image' && Image) return <Image key={STAGE_KEY} source={{ png: stageImage(scene) }} columns={scene.columns} rows={scene.rows} alt={alt} />
  if (backend !== 'svg' || !Svg) return null
  const source = stageSvg(scene)
  return source ? <Svg source={source} alt={alt} /> : null // o Svg não leva `key`: é redesenhado com a barra
}

/**
 * A imagem de sondagem: um pixel transparente numa célula, que não mostra nada. Depois de desenhada,
 * pergunta-se ao terminal (trocando-a por ela mesma) se ele desenha imagens.
 */
export const probeNode = (table: object): RenderElement | null => {
  const Image = leafOf(table, 'Image')
  return Image ? <Image key={PROBE_KEY} source={{ png: PROBE_PNG }} columns={1} rows={1} alt=" " /> : null
}
