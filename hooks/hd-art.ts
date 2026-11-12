import { bitmapShapes, box } from './canvas'
import type { Shape } from './canvas'
import { blend, rgbOf } from './color'
import type { Unit } from './hd-aura'
import type { Kind } from './palette'
import type { Tier } from './power'

// Os desenhos miúdos do palco em pixels: o tijolo com relevo, os sinais sobre a cabeça dos bichos
// (a faísca de quem pensa, o ícone da ferramenta em curso, o grito, o ✓, o ✗, o z de quem dorme),
// as estrelas e o chão. No palco de texto esses sinais são caracteres; aqui, pixels.

const WHITE = 0xffffff
const BLACK = 0x000000
/** Quantos subpixels de largura tem um tijolo (duas células). */
export const BRICK_SUBS = 4
const BEVEL_LIGHT = 0.3 // quanto a quina de cima e da esquerda de um tijolo clareia
const BEVEL_DARK = 0.32 // e quanto a de baixo e da direita escurece

// O lado de um "ponto" dos desenhos miúdos, em pixels: um quarto de subpixel, nunca menos de um pixel.
const dotOf = ({ u }: Unit) => Math.max(1, Math.round(u / 4))

/**
 * Um tijolo em (`x`, `y`), em pixels: quatro subpixels de largura, uma sublinha de altura. No traço
 * fino ganha relevo: a quina de cima e da esquerda clara, a de baixo e da direita escura.
 */
export const brickShapes = (x: number, y: number, unit: Unit, rgb: number, isFine: boolean): Shape[] => {
  const w = BRICK_SUBS * unit.u
  const h = unit.v
  if (!isFine) return [box(x, y, w, h, rgb)]
  const edge = dotOf(unit)
  const light = blend(rgb, WHITE, BEVEL_LIGHT)
  const dark = blend(rgb, BLACK, BEVEL_DARK)
  return [
    box(x, y, w, h, rgb),
    box(x, y, w, edge, light),
    box(x, y, edge, h, light),
    box(x, y + h - edge, w, edge, dark),
    box(x + w - edge, y, edge, h, dark),
  ]
}

/** Um desenho miúdo: uma string por linha, `#` é tinta. */
type Icon = readonly string[]

// O ícone de cada família de ferramenta, 9×9: aparece sobre a cabeça de quem espera por ela.
const TOOL_ICONS: Record<Kind, Icon> = {
  // ler: uma página com linhas
  r: ['.######..', '.#....##.', '.#.....#.', '.#.###.#.', '.#.....#.', '.#.###.#.', '.#.....#.', '.#######.', '.........'],
  // buscar: uma lupa
  s: ['..####...', '.#....#..', '#......#.', '#......#.', '#......#.', '.#....#..', '..####.#.', '.......##', '........#'],
  // editar e escrever: um lápis
  e: ['......##.', '.....####', '....####.', '...####..', '..####...', '.####....', '.###.....', '###......', '#........'],
  // shell: o prompt >_
  b: ['.........', '##.......', '.##......', '..##.....', '.##......', '##..####.', '.........', '.........', '.........'],
  // web: um globo
  w: ['..#####..', '.#..#..#.', '#...#...#', '#...#...#', '#########', '#...#...#', '#...#...#', '.#..#..#.', '..#####..'],
  // agentes: um rosto de robô
  a: ['....#....', '...###...', '.#######.', '.#.....#.', '.#.#.#.#.', '.#.....#.', '.#.###.#.', '.#######.', '.........'],
  // ferramentas MCP: um plugue
  m: ['..#...#..', '..#...#..', '.#######.', '.#######.', '.#######.', '..#####..', '...###...', '....#....', '....#....'],
  // o resto: uma engrenagem
  o: ['....#....', '.#..#..#.', '..#####..', '..#...#..', '###...###', '..#...#..', '..#####..', '.#..#..#.', '....#....'],
}

const SHOUT: Icon = ['###', '###', '###', '###', '.#.', '.#.', '...', '###', '###']
const CHECK: Icon = ['........#', '.......##', '......##.', '#....##..', '##..##...', '.####....', '..##.....']
const CROSS: Icon = ['##...##', '###.###', '.#####.', '..###..', '.#####.', '###.###', '##...##']
const SNORE: Icon = ['#####', '...#.', '..#..', '.#...', '#####']
const LOUD_SNORE: Icon = ['#######', '.....#.', '....#..', '...#...', '..#....', '.#.....', '#######']

const iconWidth = (icon: Icon) => icon.reduce((n, row) => Math.max(n, row.length), 0)

// Um desenho miúdo centrado em `cx`, com o topo em `top`, numa tinta só.
const stamp = (icon: Icon, cx: number, top: number, unit: Unit, rgb: number, a = 1): Shape[] => {
  const dot = dotOf(unit)
  return bitmapShapes(icon, { left: Math.round(cx - (iconWidth(icon) * dot) / 2), top: Math.round(top), cellW: dot, cellH: dot }, mark => (mark === '#' ? { rgb, a } : null))
}

const OUTLINE = 0.6 // a opacidade do contorno de um sinal

/** Uns retângulos com um contorno por trás, na cor do fundo: para um sinal ler bem sobre a aura. */
export const outlined = (shapes: readonly Shape[], edge: number, rgb: number): Shape[] => [
  ...shapes.map(s => box(s.x - edge, s.y - edge, s.w + edge * 2, s.h + edge * 2, rgb, OUTLINE)),
  ...shapes,
]

const ICON_BOB = 1.2 // quanto o ícone da ferramenta sobe e desce, em pontos
const ICON_PACE = 0.9 // e em que ritmo, por quadro
const DIM = 0.6 // a opacidade do z de quem dorme

/** O ícone da família da ferramenta em curso, balançando de leve sobre a cabeça, na cor do tijolo dela. */
export const toolIcon = (kind: Kind, cx: number, top: number, unit: Unit, rgb: number, time: number): Shape[] =>
  stamp(TOOL_ICONS[kind] ?? TOOL_ICONS.o, cx, top + Math.sin(time * ICON_PACE) * ICON_BOB * dotOf(unit), unit, rgb)

/** O grito de quem chama um ajudante. */
export const shoutIcon = (cx: number, top: number, unit: Unit, rgb: number): Shape[] => stamp(SHOUT, cx, top, unit, rgb)

/** O ✓ de quem terminou bem e o ✗ de quem falhou, ao lado do bicho. */
export const verdictIcon = (isOk: boolean, cx: number, top: number, unit: Unit, isLight: boolean): Shape[] =>
  stamp(isOk ? CHECK : CROSS, cx, top, unit, rgbOf(isOk ? 'success' : 'error', isLight))

/** O z de quem dorme: sobe devagar e recomeça; de tempos em tempos, outro maior mais acima. */
export const snoreIcon = (isLoud: boolean, cx: number, top: number, unit: Unit, rgb: number, time: number): Shape[] => {
  const dot = dotOf(unit)
  const drift = (((time * 0.35) % 1) + 1) % 1 // de 0 a 1, e de novo
  return [
    ...stamp(SNORE, cx, top + unit.v - drift * 3 * dot, unit, rgb, DIM * (1 - drift * 0.5)),
    ...(isLoud ? stamp(LOUD_SNORE, cx + 6 * dot, top - unit.v * 0.9 - drift * 2 * dot, unit, rgb, DIM) : []),
  ]
}

const SPARK_PACE = 0.85 // o ritmo do pulso da faísca de quem pensa
const SPARK_MIN = 2.5 // o comprimento de um braço dela no ponto mais curto do pulso, em pontos
const SPARK_SWING = 3 // e quanto ele cresce
const SPARK_TURN = 0.25 // quanto o anel de Fable gira por quadro, em radianos
const RING_DOTS = 8

/**
 * A faísca de quem pensa, pulsando sobre a cabeça: quanto mais forte a classe do modelo, maior ela é.
 * Haiku, uma cruz; Sonnet, a cruz e as diagonais; Opus, braços mais longos e um miolo aceso; Fable,
 * tudo isso dentro de um anel de pontos que gira.
 */
export const thinkSpark = (tier: Tier, cx: number, cy: number, unit: Unit, rgb: number, time: number): Shape[] => {
  const dot = dotOf(unit)
  const pulse = 0.5 + 0.5 * Math.sin(time * SPARK_PACE)
  const arm = Math.round((SPARK_MIN + SPARK_SWING * pulse + (tier >= 2 ? 1 : 0)) * dot)
  const half = dot // o miolo tem dois pontos de lado
  const diagonal = Math.max(dot, Math.round(arm * 0.7))
  const cross = [box(cx - arm - half, cy - half, (arm + half) * 2, half * 2, rgb), box(cx - half, cy - arm - half, half * 2, (arm + half) * 2, rgb)]
  const corners = tier < 1 ? [] : [-1, 1].flatMap(sx => [-1, 1].map(sy => box(cx + sx * diagonal - half / 2 - (sx < 0 ? half / 2 : 0), cy + sy * diagonal - half / 2 - (sy < 0 ? half / 2 : 0), half, half, rgb)))
  const heart = tier < 2 ? [] : [box(cx - half, cy - half, half * 2, half * 2, blend(rgb, WHITE, 0.6))]
  const radius = arm + half * 3
  const ring = tier < 3 ? [] : Array.from({ length: RING_DOTS }, (_, i) => {
    const angle = (i / RING_DOTS) * Math.PI * 2 + time * SPARK_TURN
    return box(cx + Math.cos(angle) * radius - half / 2, cy + Math.sin(angle) * radius - half / 2, half, half, rgb, 0.85)
  })
  return [...ring, ...cross, ...corners, ...heart]
}

const STAR_ALPHA = 0.8

/** Uma estrela no ar, no meio da célula dela: um ponto; quando brilha, uma cruz. */
export const starShapes = (isBright: boolean, cx: number, cy: number, unit: Unit, rgb: number): Shape[] => {
  const dot = dotOf(unit)
  if (!isBright) return [box(cx - dot, cy - dot, dot * 2, dot * 2, rgb, STAR_ALPHA)]
  return [box(cx - dot * 3, cy - dot, dot * 6, dot * 2, rgb), box(cx - dot, cy - dot * 3, dot * 2, dot * 6, rgb), box(cx - dot, cy - dot, dot * 2, dot * 2, blend(rgb, WHITE, 0.5))]
}

const RAIL = 2 // a grossura do trilho de cima da esteira, e a da linha do chão, em pontos
const UNDER_RAIL = 5 // a que distância do trilho de cima fica o de baixo, em pontos
const ROLLER_WIDTH = 4 // a largura de um rolete, em pontos

/** A linha do chão, de `from` a `to` (em pixels), com o topo em `y`. */
export const floorShapes = (from: number, to: number, y: number, unit: Unit, rgb: number): Shape[] =>
  to > from ? [box(from, y, to - from, RAIL * dotOf(unit), rgb)] : []

/**
 * A esteira, de `from` a `to` (em pixels): dois trilhos e, entre eles, os roletes, que andam com o
 * tempo. `rollers` são os centros deles, em pixels.
 */
export const beltShapes = (from: number, to: number, y: number, unit: Unit, rgb: number, rollers: readonly number[]): Shape[] => {
  if (to <= from) return []
  const dot = dotOf(unit)
  return [
    box(from, y, to - from, RAIL * dot, rgb),
    box(from, y + UNDER_RAIL * dot, to - from, dot, rgb, 0.7),
    ...rollers.filter(cx => cx - (ROLLER_WIDTH * dot) / 2 >= from && cx + (ROLLER_WIDTH * dot) / 2 <= to).map(cx => box(cx - (ROLLER_WIDTH * dot) / 2, y + RAIL * dot, ROLLER_WIDTH * dot, (UNDER_RAIL - RAIL) * dot, rgb)),
  ]
}
