import type { Shape } from './canvas'

// A cena em SVG, para as superfícies que desenham vetor (o app desktop): os mesmos retângulos do quadro
// de pixels, com as mesmas contas de arredondar e cortar, para o desenho sair igual nos dois.
// Só retângulos e cores: nada de script, imagem embutida ou referência externa.

/** Quantos caracteres o elemento `Svg` aceita no documento. */
export const SVG_LIMIT = 131_072

const OPACITY_STEPS = 100 // a opacidade vai com duas casas

const hexOf = (rgb: number) => `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`
const sizeOf = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)

/** Um retângulo já arredondado e cortado na borda, com a tinta dele; `null` quando não sobra nada. */
type Patch = { x: number; y: number; w: number; h: number; ink: string }

const patchOf = ({ x, y, w, h, rgb, a }: Shape, width: number, height: number): Patch | null => {
  if (!(Number.isFinite(x + y + w + h) && a > 0)) return null
  const x0 = Math.max(0, Math.round(x))
  const x1 = Math.min(width, Math.round(x + w))
  const y0 = Math.max(0, Math.round(y))
  const y1 = Math.min(height, Math.round(y + h))
  if (x1 <= x0 || y1 <= y0) return null
  const opacity = Math.round(Math.min(1, a) * OPACITY_STEPS) / OPACITY_STEPS
  if (opacity <= 0) return null
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, ink: `fill="${hexOf(rgb)}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''}` }
}

const outline = ({ x, y, w, h }: Patch) => `M${x} ${y}h${w}v${h}h-${w}z`

/**
 * Puro: os retângulos como um documento SVG do tamanho do quadro, na ordem dada (o último na frente).
 * Vizinhos na lista com a mesma tinta saem num traçado só: o documento fica menor e a ordem, a mesma.
 */
export const toSvg = (shapes: readonly Shape[], width: number, height: number): string => {
  const w = sizeOf(width)
  const h = sizeOf(height)
  // cada traçado: uma tinta e os contornos dos retângulos seguidos que a usam. As listas nascem e são
  // preenchidas aqui: copiá-las a cada retângulo custaria o quadrado do número deles.
  const paths: string[] = []
  let ink = ''
  let outlines: string[] = []
  const close = () => {
    if (outlines.length) paths.push(`<path ${ink} d="${outlines.join('')}"/>`)
  }
  for (const shape of shapes) {
    const patch = patchOf(shape, w, h)
    if (!patch) continue
    if (patch.ink !== ink) {
      close()
      ink = patch.ink
      outlines = []
    }
    outlines.push(outline(patch))
  }
  close()
  const body = paths.join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges">${body}</svg>`
}
