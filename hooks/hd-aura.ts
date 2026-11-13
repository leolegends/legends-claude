import {
  BURSTS, BURST_LIFE, BURST_PAINTS, BURST_RAYS, BURST_THIN_AT, EDGE_FADE,
  FIREWORKS_TIER, HEART_DEPTH, INK, JET_SHARE, MOTES_FROM, MOTE_LIFE, MOTE_STAGGER, REACH, RISE, STREAK_FROM, STREAK_ROWS, STREAK_TIER,
  arcsOf, columnTops, flareOf, isPainted, sparkOf, stormOf, strikes,
} from './aura'
import type { Band, Element } from './aura'
import { box } from './canvas'
import type { Shape } from './canvas'
import { rainbow, rgbOf } from './color'
import { noise } from './effects'
import type { Bitmap } from './pixels'
import type { Power } from './power'

// O poder de um bicho no palco em pixels: o clarão, as fagulhas, o raio, os riscos, os jatos e os
// fogos. São os mesmos do palco de texto (as mesmas medidas, as mesmas cores), mas o tempo aqui é
// contínuo: entre um quadro da simulação e o seguinte as chamas sobem aos poucos e as fagulhas
// deslizam, em vez de pular. Tudo puro, e tudo devolve retângulos de tinta.

/** As medidas do desenho em pixels: quantos vale um subpixel de largura e uma sublinha de altura. */
export type Unit = { u: number; v: number }

/** Um bicho como o poder o enxerga: o desenho, onde está (em pixels) e o que ele pode. */
export type Body = {
  rows: Bitmap
  /** A borda esquerda e o topo do desenho, em pixels do quadro. */
  left: number
  top: number
  /** O topo da linha dos pés, em pixels: até onde o clarão desce. */
  feet: number
  unit: Unit
  power: Power
  /** A força da aura, de 0 a `AURA_MAX`. */
  strength: number
  /** O elemento da aura de um avatar; sem ele, a aura é a da classe. */
  element?: Element
}

/** O instante e o jeito de desenhar: o tempo em quadros (com fração), o tema, e se o traço é fino. */
export type Light = {
  time: number
  isLight: boolean
  /** Traço fino, para quem desenha pixels de verdade; sem ele, tudo fica na grade de meia célula, para caber em blocos. */
  isFine: boolean
  /** O grão do traço em blocos, em pixels: meia célula de largura e meia de altura. Nada fica menor nem fora dessa grade. */
  grain: { x: number; y: number }
}

const RIM_ALPHA = 1 - EDGE_FADE // a ponta de um risco de quem corre
const FINE_COLUMN = 0.5 // no traço fino, uma coluna do clarão tem meio subpixel de largura
const HEART_INSET = 2 // o coração de uma aura fica a tantos subpixels para dentro das bordas do corpo: não faz caixa
const MOTE_FADE = 2 // quadros finais em que uma fagulha apaga
const MOTE_SIZE = 0.75 // no traço fino, o lado de uma fagulha, em subpixels
const STAR_ARM = 0.9 // no traço fino, o braço de uma estrelinha (a fagulha do avatar de estrela), em subpixels
const STAR_THIN = 0.3 // e a grossura dele
const BOLT_CORE = 0.5 // no traço fino, a largura do raio, em subpixels
const BOLT_GLOW = 0.35 // e a opacidade do clarão em volta dele
const STREAK_HEIGHT = 0.4 // no traço fino, a altura de um risco, em sublinhas
const STREAK_NEAR = 0.85 // a opacidade de um risco perto do corpo
const JET_FLICKER = 2 // no traço fino, quantas vezes por quadro um jato pisca
const BURST_FADE = 0.7 // quanto um fogo apaga até o fim

// Uma medida na grade de meia célula: o traço que cabe em blocos.
const snap = (px: number, step: number) => Math.round(px / step) * step
// As tintas da aura de um bicho neste instante: as do elemento dele, ou a cor da classe.
const flareAt = (body: Body, light: Light) => flareOf(body.power, light.time, body.element)
const widthOf = (rows: Bitmap) => rows.reduce((n, row) => Math.max(n, row.length), 0)
// A posição de um subpixel do desenho na cena, em subpixels: as ondas e o furta-cor andam por ela.
const worldOf = (body: Body, sub: number) => body.left / body.unit.u + sub

/**
 * A aura: um clarão atrás do bicho, na cor da classe dele ou nas tintas do elemento do avatar. Sobre o
 * corpo, línguas de fogo sobem e descem; para os lados, o clarão arredonda e fecha. O miolo é mais
 * vivo; as pontas e as beiradas, mais apagadas; e a aura de um elemento tem um coração, mais claro,
 * rente ao corpo. A tinta é translúcida: o fundo do terminal aparece por ela.
 */
export const haloShapes = (body: Body, light: Light): Shape[] => {
  const { rows, left, top, feet, unit: { u, v }, strength } = body
  const reach = REACH[strength] ?? 0
  if (reach <= 0) return []
  const rise = RISE[strength] ?? 0
  const drawn = columnTops(rows)
  const first = drawn.findIndex(t => t !== undefined)
  const last = drawn.findLastIndex(t => t !== undefined)
  if (first < 0) return []
  // O topo de cada coluna é o mais alto entre ela e as vizinhas: o vão entre a mão erguida e a cabeça
  // não abre um corte escuro nas chamas.
  const tops = drawn.map((_, col) => [drawn[col - 1], drawn[col], drawn[col + 1]].reduce<number | undefined>((best, t) => (t === undefined ? best : best === undefined ? t : Math.min(best, t)), undefined))
  const flare = flareAt(body, light)
  const rimFrom = flare.rimFrom(reach)
  const hasHeart = flare.heart !== flare.core
  const step = light.isFine ? Math.max(1, u * FINE_COLUMN) : light.grain.x
  const from = left + (first - reach) * u
  const count = Math.round(((last - first + 1 + reach * 2) * u) / step)
  return Array.from({ length: count }).flatMap((_, i): Shape[] => {
    const x = from + i * step
    const sub = (x + step / 2 - left) / u // onde a coluna cai no desenho, em subpixels
    const near = Math.min(last, Math.max(first, Math.floor(sub)))
    const away = sub < first ? first - sub : sub >= last + 1 ? sub - (last + 1) : 0
    if (away > reach) return []
    const bodyTop = top + (tops[near] ?? 0) * v
    const world = worldOf(body, sub)
    const lick = rise * v * flare.lick(light.isFine ? world : Math.floor(world))
    // Ao lado do corpo o clarão é uma meia elipse: mais baixo e mais curto quanto mais longe.
    const span = feet - bodyTop
    const middle = (feet + bodyTop) / 2
    const curve = Math.sqrt(Math.max(0, 1 - (away / (reach + 1)) ** 2))
    const flameTop = Math.max(0, away === 0 ? bodyTop - lick : middle - (span / 2 + lick) * curve)
    const flameEnd = away === 0 ? feet : middle + (span / 2) * curve
    if (flameEnd - flameTop < 1) return []
    // a cor é a da célula: dentro de uma célula só mudam as camadas
    const at = light.isFine ? Math.floor(world) : Math.floor(world) & ~1
    const layer = ({ paint, fade }: Band, y0: number, y1: number): Shape[] => (y1 > y0 ? [box(x, y0, step, y1 - y0, rgbOf(paint(at)), 1 - fade)] : [])
    const rimEnd = Math.min(flameEnd, flameTop + v)
    // longe do corpo, a coluna inteira é beirada; sobre ele, sob o miolo, vem o coração
    if (away >= rimFrom) return layer(flare.rim, flameTop, flameEnd)
    const isDeep = hasHeart && Math.min(sub - first, last + 1 - sub) >= HEART_INSET
    const heartTop = isDeep ? Math.min(flameEnd, flameTop + HEART_DEPTH * v) : flameEnd
    return [...layer(flare.rim, flameTop, rimEnd), ...layer(flare.core, rimEnd, heartTop), ...layer(flare.heart, heartTop, flameEnd)]
  })
}

// Uma estrelinha de quatro pontas com o meio em (`cx`, `cy`): dois traços que se cruzam.
const twinkleShapes = (cx: number, cy: number, { u, v }: Unit, rgb: number, a: number): Shape[] => {
  const arm = u * STAR_ARM
  const thin = Math.max(1, u * STAR_THIN)
  // um subpixel é duas vezes mais alto que largo: o braço de pé mede o mesmo que o deitado, em pixels
  return [box(cx - arm, cy - thin / 2, arm * 2, thin, rgb, a), box(cx - thin / 2, cy - Math.min(arm, v), thin, Math.min(arm, v) * 2, rgb, a)]
}

/**
 * As fagulhas que sobem pelos lados do bicho: a tinta da aura dele, puxada para longe do fundo. As do
 * avatar de estrela, no traço fino, são estrelinhas.
 */
export const moteShapes = (body: Body, light: Light): Shape[] => {
  const { rows, left, feet, unit, unit: { u, v }, strength } = body
  if (strength < MOTES_FROM) return []
  const width = widthOf(rows)
  const reach = REACH[strength] ?? 0
  const paint = flareAt(body, light).mote
  const side = light.isFine ? u * MOTE_SIZE : u
  return Array.from({ length: strength - 1 }).flatMap((_, k): Shape[] => {
    const clock = light.time + k * MOTE_STAGGER
    const age = ((clock % MOTE_LIFE) + MOTE_LIFE) % MOTE_LIFE
    const life = Math.floor(clock / MOTE_LIFE)
    const isRight = (k + life) % 2 === 1
    const spread = Math.floor(noise(k * 7 + 1, life) * (reach + 2))
    const sway = Math.sin((age + k) * 1.1)
    const sub = (isRight ? width + spread : -1 - spread) + (light.isFine ? sway : Math.round(sway))
    const x = left + sub * u
    const y = feet - (1 + (light.isFine ? age : Math.floor(age))) * v
    const rgb = rgbOf(sparkOf(paint(Math.floor(worldOf(body, sub))), light.isLight))
    const fade = light.isFine ? Math.min(1, (MOTE_LIFE - age) / MOTE_FADE) : 1
    if (!light.isFine) return [box(snap(x, light.grain.x), snap(y, light.grain.y), light.grain.x, light.grain.y, rgb)]
    if (body.element === 'star') return twinkleShapes(x + u / 2, y + v / 2, unit, rgb, fade)
    return [box(x + (u - side) / 2, y + (v - side) / 2, side, side, rgb, fade)]
  })
}

/**
 * O raio: de tempos em tempos desce do alto até o chão em ziguezague, de um lado do bicho e depois do
 * outro, e dura dois quadros. O da classe é dos poderes mais altos; o do avatar de raio cai mais cedo
 * e mais vezes, em amarelo.
 */
export const boltShapes = (body: Body, light: Light): Shape[] => {
  const { rows, left, feet, unit: { u, v }, power, strength } = body
  const tick = Math.floor(light.time)
  const storm = stormOf(body.element, light.isLight)
  if (!strikes(storm, power, strength, tick)) return []
  const strike = Math.floor(tick / storm.every)
  const reach = REACH[strength] ?? 0
  const start = strike % 2 === 1 ? widthOf(rows) + reach + 2 : -reach - 3
  const rgb = rgbOf(storm.paint, light.isLight)
  const steps = Math.round(feet / v) + 1
  const path = Array.from({ length: steps }).reduce<number[]>((subs, _, y) => {
    const turn = noise(strike * 13 + y, 3)
    return [...subs, (subs[subs.length - 1] ?? start) + (turn < 0.34 ? -1 : turn > 0.66 ? 1 : 0)]
  }, [])
  return path.flatMap((sub, y): Shape[] => {
    const x = light.isFine ? left + sub * u : snap(left + sub * u, light.grain.x)
    if (!light.isFine) return [box(x, y * v, Math.max(light.grain.x, u / 2), v, rgb)]
    const core = u * BOLT_CORE
    return [box(x, y * v, u, v, rgb, BOLT_GLOW), box(x + (u - core) / 2, y * v, core, v, rgb)]
  })
}

/** Os estalos do avatar de raio: raios curtos que acendem e apagam em volta dele, na tinta das faíscas. */
export const arcShapes = (body: Body, light: Light): Shape[] => {
  const { rows, left, top, feet, unit: { u, v }, strength, element } = body
  const arcs = arcsOf({ bitmap: rows, top: Math.round(top / v), floor: Math.round(feet / v), strength, element }, Math.floor(light.time))
  if (arcs.length === 0) return []
  const paint = flareAt(body, light).mote
  const core = u * BOLT_CORE
  return arcs.flat().flatMap(([sub, y]): Shape[] => {
    const rgb = rgbOf(sparkOf(paint(Math.floor(worldOf(body, sub))), light.isLight))
    if (!light.isFine) return [box(snap(left + sub * u, light.grain.x), y * v, Math.max(light.grain.x, u / 2), v, rgb)]
    return [box(left + sub * u, y * v, u, v, rgb, BOLT_GLOW), box(left + sub * u + (u - core) / 2, y * v, core, v, rgb)]
  })
}

/**
 * Os riscos de quem corre: traços curtos no ar atrás do bicho, na cor da classe. `side` diz de que
 * lado eles ficam: -1 à esquerda (ele vai para a direita), 1 à direita.
 */
export const streakShapes = (body: Body, light: Light, side: -1 | 1): Shape[] => {
  const { rows, left, top, unit: { u, v }, power, strength } = body
  if (power.tier < STREAK_TIER || strength < STREAK_FROM) return []
  const tick = Math.floor(light.time)
  const width = widthOf(rows)
  const reach = REACH[strength] ?? 0
  const paint = flareAt(body, light).core.paint
  const height = light.isFine ? Math.max(1, v * STREAK_HEIGHT) : light.grain.y
  return STREAK_ROWS.flatMap((row, k): Shape[] => {
    if (row >= rows.length) return []
    // cada risco tem o seu comprimento e pisca fora de fase do outro
    const length = 2 + Math.floor(noise(k * 3 + 1, tick >> 1) * (strength + 1))
    const gap = reach + 2 + ((((tick + k) % 2) + 2) % 2)
    const nearSub = side < 0 ? -gap : width - 1 + gap // o subpixel do risco mais perto do corpo
    const tipSub = nearSub + side * (length - 1)
    const middle = top + row * v + (v - height) / 2
    const y = light.isFine ? middle : snap(middle, light.grain.y)
    const rgb = rgbOf(paint(Math.floor(worldOf(body, nearSub))))
    const x = (sub: number) => (light.isFine ? left + sub * u : snap(left + sub * u, light.grain.x))
    const bodyFrom = Math.min(nearSub, tipSub - side)
    return [
      box(x(bodyFrom), y, (length - 1) * u, height, rgb, STREAK_NEAR),
      box(x(tipSub), y, u, height, rgb, RIM_ALPHA),
    ]
  })
}

/** Os jatos de quem voa: pontos de luz que piscam na linha do chão, sob o corpo. */
export const jetShapes = (body: Body, light: Light): Shape[] => {
  const { rows, left, feet, unit: { u, v } } = body
  const under = rows[rows.length - 1] ?? ''
  const paint = flareAt(body, light).mote
  const beat = Math.floor(light.time * (light.isFine ? JET_FLICKER : 1))
  return [...under].flatMap((mark, col): Shape[] => {
    if (!isPainted(mark) || noise(col * 5 + 2, beat) >= JET_SHARE) return []
    const rgb = rgbOf(sparkOf(paint(Math.floor(worldOf(body, col))), light.isLight))
    const length = light.isFine ? v * (0.35 + 0.65 * noise(col * 11 + 3, beat)) : v
    return [box(light.isFine ? left + col * u : snap(left + col * u, light.grain.x), feet, u, length, rgb)]
  })
}

/**
 * Os fogos da festa do fim de um turno: anéis de pontos que abrem no ar, um depois do outro. `age` são
 * os quadros já passados da festa (com fração) e `center` o meio do mascote, em pixels. Fable solta
 * todas as cores; Opus, ouro e branco. As outras classes não têm fogos.
 */
export const fireworkShapes = (power: Power, age: number, center: number, { u, v }: Unit, light: Light): Shape[] => {
  if (power.tier < FIREWORKS_TIER) return []
  const side = light.isFine ? u * MOTE_SIZE : u
  return BURSTS.flatMap((burst, k) => {
    const since = age - burst.at
    if (since < 0 || since >= BURST_LIFE) return []
    const radius = 1.5 + since * 1.2
    const fade = light.isFine ? 1 - (since / BURST_LIFE) * BURST_FADE : 1
    return Array.from({ length: BURST_RAYS }).flatMap((_, i): Shape[] => {
      if (since >= BURST_THIN_AT && i % 2 === 1) return []
      const angle = (i / BURST_RAYS) * Math.PI * 2 + k
      // um subpixel é duas vezes mais alto que largo: na conta o anel é achatado, na tela sai redondo
      const x = center + (burst.dx + Math.cos(angle) * radius) * u
      const y = (burst.y + (Math.sin(angle) * radius) / 2) * v
      const rgb = rgbOf(power.tier === 3 ? rainbow(k * 70 + i * 36) : (BURST_PAINTS[i % BURST_PAINTS.length] ?? INK), light.isLight)
      return [light.isFine ? box(x + (u - side) / 2, y + (v - side) / 2, side, side, rgb, fade) : box(snap(x, light.grain.x), snap(y, light.grain.y), light.grain.x, light.grain.y, rgb)]
    })
  })
}
