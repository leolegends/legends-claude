import { BLANK, DEFAULT_COLOR, fitCells, groundColor } from './blocks'
import type { Cell } from './blocks'
import { rasterize } from './canvas'
import { blend, rgbOf } from './color'
import { cols } from './format'
import { backdropRgb } from './hd'
import type { HdScene, Zoom } from './hd'
import type { Part } from './parts'
import { encodePng, toBase64 } from './png'
import { SCENE_ROWS, textCells, textKey } from './scene'
import { geometry } from './sim'
import { SVG_LIMIT, toSvg } from './vector'
import type { StatusResolution as Resolution } from '../types'

// Do palco em pixels ao que cada tela sabe mostrar. Num terminal que desenha imagens (kitty, Ghostty,
// iTerm2), a cena vai como imagem: pixels de verdade. Nos outros terminais vai como uma grade de
// blocos, com os textos da cena por cima. No app desktop, como SVG. E, onde nada disso existe, fica o
// palco de texto de sempre. Tudo aqui é puro: quem chama decide quando pintar.

/** Em que o palco sai: imagem, grade de blocos, SVG, ou as linhas de texto de sempre. */
export type Backend = 'image' | 'raster' | 'svg' | 'text'

/** Se o terminal desenha pixels: ainda não se sabe, sim, ou não. */
export type Pixels = 'unknown' | 'yes' | 'no'

/** O que a tela oferece: os elementos que a tabela dela tem, e o que já se sabe do terminal. */
export type Abilities = { hasImage: boolean; hasRaster: boolean; hasSvg: boolean; pixels: Pixels }

/**
 * Quantas vezes cada pixel do quadro é repetido na imagem do palco de tamanho normal: ela chega ao
 * terminal perto do tamanho em que será mostrada. No tamanho dobrado o desenho já vem ampliado, e a
 * imagem sai como está: o dobro de pixels pesaria o dobro a cada pintura, sem mostrar nada a mais.
 */
export const IMAGE_SCALE = 2
const PAINT_MS = 40 // o intervalo que se busca entre duas pinturas do palco: perto de 25 por segundo
const DIM = 0.5 // quanto um texto apagado esmaece para o fundo
const QUESTION = 0x3f
const SPACE = 0x20
const BMP_MAX = 0xffff

/**
 * Em que o palco é desenhado, pelo ajuste e pelo que a tela oferece. Enquanto não se sabe se o
 * terminal desenha pixels, blocos: uma imagem que o terminal não mostra seria um palco em branco.
 */
export const backendOf = (resolution: Resolution, surface: string, { hasImage, hasRaster, hasSvg, pixels }: Abilities): Backend => {
  if (resolution === 'classica') return 'text'
  if (surface !== 'terminal') return hasSvg ? 'svg' : 'text'
  if (resolution === 'auto' && hasImage && pixels === 'yes') return 'image'
  return hasRaster ? 'raster' : 'text'
}

const BAND_CHROME = 3 // a régua, o cabeçalho e uma linha de folga: o que a barra tem além do palco

/**
 * O tamanho do palco numa barra de `columns` colunas e `rows` linhas. O dobro só quando foi pedido e
 * cabe: o mundo passa a ter a metade da largura, e o palco o dobro da altura.
 */
export const zoomOf = (isLarge: boolean, columns: number, rows: number): Zoom =>
  isLarge && geometry(Math.floor(columns / 2)) !== null && rows >= SCENE_ROWS * 2 + BAND_CHROME ? 2 : 1

/** Quanto do caminho entre o último passo da simulação e o seguinte já foi, de 0 a 1. */
export const alphaOf = (now: number, steppedAt: number, frameMs: number): number => {
  const t = (now - steppedAt) / frameMs
  return Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 1
}

/** De quanto em quanto tempo o palco é repintado, em milissegundos: um número inteiro de vezes por quadro da simulação. */
export const paintEvery = (frameMs: number): number => Math.round(frameMs / Math.max(1, Math.round(frameMs / PAINT_MS)))

/** A recusa de uma pintura diz que o terminal não desenha imagens ali (e não, por exemplo, que o tamanho mudou). */
export const isPixelRefusal = ({ deny, fix }: { deny?: string; fix?: string }): boolean =>
  fix === 'tmux-passthrough' || /draws its alt/.test(deny ?? '')

/** O tema e a cor de destaque: de onde saem as cores dos textos da cena. */
export type Look = { isLight: boolean; accent: string }

// Os caracteres que uma célula do `Raster` aceita com certeza: imprimíveis, de uma coluna, do plano
// básico. O engine recusa a barra inteira por uma célula com um caractere de controle, combinante (um
// acento solto, de largura zero) ou largo; como o nome de uma ferramenta vem de fora, só passa o que
// está nesta lista: o ASCII, as letras latinas com acento, as reticências, os traços de caixa, os
// blocos e as formas, e os sinais do próprio palco (✓ ✗ e as faíscas, todos entre U+2713 e U+274B).
const SAFE_RANGES: readonly (readonly [from: number, to: number])[] = [
  [0x20, 0x7e], [0xa1, 0xac], [0xae, 0x24f], [0x2026, 0x2026], [0x2500, 0x25ff], [0x2713, 0x2727], [0x2729, 0x274b],
]

/** O caractere de uma célula de texto: o próprio, se o `Raster` o aceita com certeza; senão, "?". */
export const codeOf = (text: string): number => {
  const code = text.codePointAt(0) ?? SPACE
  const isSafe = code <= BMP_MAX && cols(text) === 1 && SAFE_RANGES.some(([from, to]) => code >= from && code <= to)
  return isSafe ? code : QUESTION
}

// A cor de um texto da cena. Sem cor, é a do terminal; apagado, esmaece para o fundo; `claude` é a cor de destaque.
const inkOf = (part: Part, { isLight, accent }: Look): number => {
  const backdrop = backdropRgb(isLight)
  if (!part.color) return part.dim ? blend(rgbOf('text', isLight), backdrop, DIM) : DEFAULT_COLOR
  const rgb = rgbOf(part.color === 'claude' ? accent : part.color, isLight)
  return part.dim ? blend(rgb, backdrop, DIM) : rgb
}

/**
 * Puro: o palco como células de terminal, linha a linha. Os desenhos saem em blocos; os textos da
 * cena (os sinais dos bichos, o placar) ficam por cima, com o que estava ali de fundo; e uma célula
 * sem nada mostra o chão ou uma estrela, como no palco de texto.
 */
export const rasterCells = (scene: HdScene, look: Look): Cell[] => {
  const fitted = fitCells(rasterize(scene.shapes, scene.width, scene.height), scene.columns, scene.rows, backdropRgb(look.isLight))
  const texts = textCells(scene.labels)
  return fitted.map((cell, i): Cell => {
    const column = i % scene.columns
    const row = Math.floor(i / scene.columns)
    const label = texts.get(textKey(row, column))
    if (label) return { code: codeOf(label.text), fg: inkOf(label, look), bg: groundColor(cell) }
    const under = cell === BLANK || (cell.code === SPACE && cell.bg === DEFAULT_COLOR) ? scene.under(column, row) : undefined
    return under ? { code: codeOf(under.text), fg: inkOf(under, look), bg: DEFAULT_COLOR } : cell
  })
}

/** Puro: o palco como imagem: um PNG em base64. */
export const stageImage = (scene: HdScene): string =>
  toBase64(encodePng(rasterize(scene.shapes, scene.width, scene.height), scene.zoom > 1 ? 1 : IMAGE_SCALE))

/** A imagem de um pixel transparente com que se pergunta ao terminal se ele desenha imagens. */
export const PROBE_PNG = toBase64(encodePng({ width: 1, height: 1, data: new Uint8ClampedArray(4) }))

/** Puro: o palco como documento SVG, ou `null` quando ele passaria do que o elemento aceita. */
export const stageSvg = (scene: HdScene): string | null => {
  const svg = toSvg(scene.shapes, scene.width, scene.height)
  return svg.length <= SVG_LIMIT ? svg : null
}
