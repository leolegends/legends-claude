import { hexOf, mix, rainbow } from './color'
import { noise } from './effects'
import { EYE, dotKey, isInk } from './pixels'
import type { Bitmap, Glow, Paint, Shade } from './pixels'
import type { Power } from './power'

// A aparência de um bicho com poder, pura: do poder dele e do quadro saem a tinta do corpo, os olhos,
// o clarão atrás dele (a aura), as fagulhas, os raios e os riscos de quem corre. Nada disso muda a
// simulação: é só desenho. Tudo é função do quadro: o mesmo quadro desenha sempre a mesma coisa.

/** Um ponto solto: a chave do subpixel e a tinta dele. */
export type Dot = readonly [number | undefined, Paint]

/** Um bicho num quadro, como a aura o enxerga. */
export type Figure = {
  bitmap: Bitmap
  /** A borda esquerda e o topo do desenho, em subpixels. */
  left: number
  top: number
  /** A sublinha onde os pés se apoiam. */
  floor: number
  /** A cor dele: do tema ou hex. */
  tint: Paint
  /** A paleta de um avatar colorido: a tinta de cada marca do desenho que não é a cor dele. */
  paints?: Readonly<Record<string, Paint>>
  /** A força da aura dele, de 0 (nenhuma) a `AURA_MAX`: sai do poder, e é menor num ajudante. */
  strength: number
}

/** O quadro e o tema: de onde a animação e os tons saem. */
export type Mood = { tick: number; isLight: boolean }

// A cor de cada classe, como a raridade de um item num jogo: verde, azul, roxo; Fable é furta-cor.
const CLASS_PAINT = ['#4EC98B', '#5FA8FF', '#A78BFA'] as const
const PRISM_FROM = 180 // o furta-cor de Fable vai do ciano…
const PRISM_TO = 330 // …ao rosa, passando por azul e roxo: tons que brilham sem sujar
const PRISM_PER_COLUMN = 0.22 // quanto o matiz anda por subpixel de largura
const PRISM_PER_TICK = 0.21 // e por quadro
const WHITE = '#FFFFFF'
const BLACK = '#000000'
export const INK = 'text' // a cor do texto do tema: branca no escuro, preta no claro. É a do raio
const NIGHT = '#0B0B10' // o fundo de um terminal escuro, aproximado: para onde o clarão esmaece
export const CORE_FADE = 0.42 // quanto o miolo do clarão esmaece em direção ao fundo
export const EDGE_FADE = 0.7 // e quanto as pontas e as beiradas esmaecem
const SPARK_LIFT = 0.5 // quanto uma fagulha clareia a cor da classe, num tema escuro
const SPARK_SINK = 0.2 // e quanto escurece, num tema claro: clara, sumiria no fundo
/** Por força da aura: subpixels de clarão além do corpo, de cada lado. */
export const REACH = [0, 1, 2, 3, 4, 5]
/** Por força da aura: sublinhas de labareda acima do corpo. */
export const RISE = [0, 0, 1, 2, 3, 4]
const SHEEN_EVERY = [0, 44, 24, 8] // por classe: quadros de uma passada do brilho pelo corpo até a seguinte (a de Fable mal termina e já recomeça)
const SHEEN_WIDTH = [0, 1, 2, 2] // e a largura da faixa, em células
const SHEEN_SPEED = 2 // células por quadro
const SHEEN_LIFT = 0.62 // quanto a faixa clareia a cor do corpo
const GOLD_SHEEN = '#FFE9A8' // o brilho de Opus
const PALETTE_SHEEN = 0.5 // num avatar colorido a faixa mistura com a cor de cada marca: ele segue aparecendo sob o brilho
export const MOTES_FROM = 3 // a força da aura a partir da qual sobem fagulhas
export const MOTE_LIFE = 8 // quadros que uma fagulha leva subindo
export const MOTE_STAGGER = 5 // quadros entre uma fagulha e a seguinte
export const BOLT_TIER = 2 // só de Opus para cima caem raios
export const BOLT_FROM = 4 // e só com a aura nessa força
export const BOLT_EVERY = 21 // quadros entre um raio e o seguinte
export const BOLT_FRAMES = 2 // quadros que um raio dura
const LIT_EYES_TIER = 2 // de Opus para cima os olhos acendem
const FLY_TIER = 3 // Fable voa
export const STREAK_TIER = 1 // de Sonnet para cima, quem corre risca o ar
export const STREAK_FROM = 2 // com a aura a partir dessa força
export const STREAK_ROWS = [1, 3] // as linhas do desenho de onde saem os riscos (olhos e corpo)
export const JET_SHARE = 0.45 // a fração das colunas sob o corpo que solta jato num quadro

export const isPainted = isInk
export const backdropOf = (isLight: boolean) => (isLight ? WHITE : NIGHT)
// Uma fagulha: a cor da classe puxada para longe do fundo, para saltar dele.
export const sparkOf = (paint: string, isLight: boolean) => (isLight ? mix(paint, BLACK, SPARK_SINK) : mix(paint, WHITE, SPARK_LIFT))
export const widthOf = (bitmap: Bitmap) => bitmap.reduce((n, row) => Math.max(n, row.length), 0)

// O furta-cor: o matiz vai e volta entre o ciano e o rosa, ao longo da largura e do tempo.
const prism = (x: number, tick: number) =>
  rainbow((PRISM_FROM + PRISM_TO) / 2 + ((PRISM_TO - PRISM_FROM) / 2) * Math.sin(x * PRISM_PER_COLUMN + tick * PRISM_PER_TICK))

// A cor da classe numa coluna: fixa, ou o furta-cor de Fable correndo.
export const classPaint = ({ tier }: Power, tick: number) =>
  tier === 3 ? (x: number) => prism(x, tick) : () => CLASS_PAINT[tier] ?? CLASS_PAINT[0]

/** A tinta dos olhos acesos de uma classe, ou `null` para os olhos vazados de sempre. */
export const eyesOf = ({ tier }: Power): Paint | null => (tier < LIT_EYES_TIER ? null : tier === 2 ? '#FFF1B8' : WHITE)

/** Voa em vez de andar: sem patas, com jatos por baixo. */
export const canFly = ({ tier }: Power) => tier >= FLY_TIER

/**
 * A faixa de brilho que atravessa o corpo num quadro: onde ela começa e quanto mede, em células ao
 * longo da diagonal, e a tinta dela numa coluna (em subpixels).
 */
export type Sheen = { front: number; width: number; paintAt: (x: number) => Paint }

/** A faixa de brilho de um bicho num quadro; `null` na classe que não tem brilho. */
export const sheenOf = ({ tier }: Power, tint: Paint, mood: Mood): Sheen | null => {
  const every = SHEEN_EVERY[tier] ?? 0
  if (every <= 0) return null
  const width = SHEEN_WIDTH[tier] ?? 1
  const own = hexOf(tint, mood.isLight)
  return {
    front: (mood.tick % every) * SHEEN_SPEED - width, // a faixa entra pela esquerda e some à direita
    width,
    paintAt: x => (tier === 3 ? mix(prism(x, mood.tick), WHITE, 0.45) : tier === 2 ? GOLD_SHEEN : mix(own, WHITE, SHEEN_LIFT)),
  }
}

/**
 * A tinta do corpo: a cor do bicho, com o brilho da classe. De Sonnet para cima uma faixa de luz
 * inclinada atravessa o corpo de tempos em tempos: fina e rara em Sonnet, larga e dourada em Opus,
 * furta-cor e quase sem pausa em Fable. A cor é uma por célula, para a célula nunca ter mais de duas.
 */
export const bodyShade = (p: Power, figure: Figure, mood: Mood): Shade => {
  const eyes = eyesOf(p)
  const { tint, left, paints } = figure
  const sheen = sheenOf(p, tint, mood)
  if (!sheen && !paints) return tint
  const own = (mark: string) => paints?.[mark] ?? tint // a cor do bicho, ou a da paleta dele naquela marca
  return (x, y, mark) => {
    if (mark === EYE && eyes) return eyes
    if (!sheen) return own(mark)
    const cell = x >> 1
    const across = cell - (left >> 1) + (y >> 1) // a faixa é inclinada
    if (across < sheen.front || across >= sheen.front + sheen.width) return own(mark)
    const gloss = sheen.paintAt(cell * 2) // a cor é a da célula, não a do subpixel
    const inked = paints?.[mark]
    return inked ? mix(inked, gloss, PALETTE_SHEEN) : gloss
  }
}

const TONGUE_MIN = 0.3 // a língua de fogo mais baixa, como fração da mais alta
// As duas ondas que fazem as línguas: quanto cada uma anda por subpixel de largura e por quadro.
const WAVE = { fine: 1.9, fineSpeed: 1.3, broad: 0.7, broadSpeed: 0.8 } as const

// A língua de fogo de uma coluna num quadro, de `TONGUE_MIN` a 1: duas ondas que se cruzam.
export const tongue = (x: number, tick: number) => {
  const ripple = Math.sin(x * WAVE.fine + tick * WAVE.fineSpeed) * Math.cos(x * WAVE.broad - tick * WAVE.broadSpeed)
  return TONGUE_MIN + (1 - TONGUE_MIN) * (0.5 + 0.5 * ripple)
}

// A primeira linha pintada de cada coluna do desenho, de cima para baixo.
export const columnTops = (bitmap: Bitmap): (number | undefined)[] =>
  Array.from({ length: widthOf(bitmap) }, (_, col) => {
    const at = bitmap.findIndex(row => isPainted(row[col]))
    return at < 0 ? undefined : at
  })

/**
 * A aura: um clarão atrás do bicho, na cor da classe dele. Sobre o corpo, línguas de fogo sobem e
 * descem a cada quadro; para os lados, o clarão arredonda e fecha. O miolo é mais vivo; as pontas e
 * as beiradas, mais apagadas. `null` quando o poder não dá aura.
 */
export const glowOf = (p: Power, figure: Figure, mood: Mood): Glow | null => {
  const { bitmap, left, top, floor, strength } = figure
  const reach = REACH[strength] ?? 0
  if (reach <= 0) return null
  const rise = RISE[strength] ?? 0
  const tops = columnTops(bitmap)
  const from = left - reach
  // O clarão para uma sublinha acima do chão: a linha dos pés fica limpa, com as patas à mostra.
  const base = floor - 1
  // Em cada coluna: de que sublinha a que sublinha o clarão vai, e se a coluna é beirada.
  const flames = Array.from({ length: tops.length + reach * 2 }, (_, i) => {
    const col = i - reach
    const away = Array.from({ length: reach + 1 }, (_, d) => d).find(d => tops[col - d] !== undefined || tops[col + d] !== undefined)
    if (away === undefined) return null
    const bodyTop = top + (tops[col - away] ?? tops[col + away] ?? 0)
    const lick = rise * tongue(from + i, mood.tick)
    if (away === 0) return { from: Math.max(0, Math.round(bodyTop - lick)), to: base, isRim: false }
    // Ao lado do corpo o clarão é uma meia elipse: mais baixo e mais curto quanto mais longe.
    const span = base - bodyTop + 1
    const middle = base - (span - 1) / 2
    const curve = Math.sqrt(1 - (away / (reach + 1)) ** 2)
    const flameTop = Math.max(0, Math.round(middle - (span / 2 + lick) * curve))
    const flameEnd = Math.min(base, Math.round(middle + (span / 2) * curve))
    return flameTop > flameEnd ? null : { from: flameTop, to: flameEnd, isRim: away >= 2 }
  })
  const paint = classPaint(p, mood.tick)
  const backdrop = backdropOf(mood.isLight)
  return (x, y) => {
    const flame = flames[x - from]
    if (!flame || y < flame.from || y > flame.to) return undefined
    // a cor é a da célula (as duas colunas dela juntas): dentro de uma célula só mudam o miolo e a beirada
    return mix(paint(x & ~1), backdrop, flame.isRim || y === flame.from ? EDGE_FADE : CORE_FADE)
  }
}

/**
 * O que a aura solta na frente da cena: fagulhas que sobem pelos lados do bicho e, nos poderes mais
 * altos, um raio que cai ao lado dele de tempos em tempos.
 */
export const sparksOf = (p: Power, figure: Figure, mood: Mood): Dot[] => {
  const { bitmap, left, floor, strength } = figure
  if (strength < MOTES_FROM) return []
  const { tick, isLight } = mood
  const width = widthOf(bitmap)
  const reach = REACH[strength] ?? 0
  const paint = classPaint(p, tick)
  const motes = Array.from({ length: strength - 1 }, (_, k): Dot => {
    const clock = tick + k * MOTE_STAGGER
    const age = clock % MOTE_LIFE
    const life = Math.floor(clock / MOTE_LIFE)
    const isRight = (k + life) % 2 === 1
    const spread = Math.floor(noise(k * 7 + 1, life) * (reach + 2))
    const sway = Math.round(Math.sin((age + k) * 1.1))
    const x = (isRight ? left + width + spread : left - 1 - spread) + sway
    return [dotKey(x, floor - 1 - age), sparkOf(paint(x), isLight)]
  })
  if (p.tier < BOLT_TIER || strength < BOLT_FROM || tick % BOLT_EVERY >= BOLT_FRAMES) return motes
  // O raio: desce do alto até o chão em ziguezague, de um lado e depois do outro.
  const strike = Math.floor(tick / BOLT_EVERY)
  const start = strike % 2 === 1 ? left + width + reach + 2 : left - reach - 3
  const bolt = Array.from({ length: floor + 1 }).reduce<{ x: number; dots: Dot[] }>(
    (acc, _, y) => {
      const turn = noise(strike * 13 + y, 3)
      const x = acc.x + (turn < 0.34 ? -1 : turn > 0.66 ? 1 : 0)
      return { x, dots: [...acc.dots, [dotKey(x, y), INK]] }
    },
    { x: start, dots: [] },
  ).dots
  return [...motes, ...bolt]
}

/**
 * Os riscos de quem corre: traços curtos no ar atrás do bicho, na cor da classe. `side` diz de que
 * lado eles ficam: -1 à esquerda (ele vai para a direita), 1 à direita.
 */
export const streaksOf = (p: Power, figure: Figure, mood: Mood, side: -1 | 1): Dot[] => {
  const { bitmap, left, top, strength } = figure
  if (p.tier < STREAK_TIER || strength < STREAK_FROM) return []
  const width = widthOf(bitmap)
  const paint = classPaint(p, mood.tick)
  const reach = REACH[strength] ?? 0
  return STREAK_ROWS.flatMap((row, k): Dot[] => {
    if (row >= bitmap.length) return []
    // cada risco tem o seu comprimento e pisca fora de fase do outro
    const length = 2 + Math.floor(noise(k * 3 + 1, mood.tick >> 1) * (strength + 1))
    const gap = reach + 2 + ((mood.tick + k) % 2)
    return Array.from({ length }, (_, i): Dot => {
      const x = side < 0 ? left - gap - i : left + width - 1 + gap + i
      return [dotKey(x, top + row), mix(paint(x), backdropOf(mood.isLight), i >= length - 1 ? EDGE_FADE : 0.15)]
    })
  })
}

/** Os jatos de quem voa: pontos de luz que piscam na sublinha do chão, sob o corpo. */
export const jetsOf = (p: Power, figure: Figure, mood: Mood): Dot[] => {
  const { bitmap, left, floor } = figure
  const under = bitmap[bitmap.length - 1] ?? ''
  const paint = classPaint(p, mood.tick)
  return [...under].flatMap((mark, col): Dot[] =>
    isPainted(mark) && noise(col * 5 + 2, mood.tick) < JET_SHARE ? [[dotKey(left + col, floor), sparkOf(paint(left + col), mood.isLight)]] : [],
  )
}

export const FIREWORKS_TIER = 2 // de Opus para cima, a festa do fim tem fogos
export const BURST_LIFE = 6 // quadros que um fogo leva abrindo
export const BURST_RAYS = 10
export const BURST_THIN_AT = 4 // a partir dessa idade, metade dos pontos já apagou
export const BURST_PAINTS = [INK, '#F5B841', '#E0A526'] // os fogos de Opus: a cor do texto e dois ouros
// Os fogos da festa: quando cada um estoura, e onde (em subpixels, a partir do meio do mascote).
export const BURSTS = [
  { at: 1, dx: -22, y: 2 },
  { at: 4, dx: 24, y: 1 },
  { at: 7, dx: -8, y: 1 },
  { at: 10, dx: 36, y: 2 },
  { at: 12, dx: 8, y: 1 },
] as const

/**
 * Os fogos da festa do fim de um turno: anéis de pontos que abrem no ar, um depois do outro. `age` são
 * os quadros já passados da festa e `center` o meio do mascote, em subpixels. Fable solta todas as
 * cores; Opus, ouro e branco. As outras classes não têm fogos.
 */
export const fireworksOf = (p: Power, age: number, center: number): Dot[] => {
  if (p.tier < FIREWORKS_TIER) return []
  return BURSTS.flatMap((burst, k) => {
    const since = age - burst.at
    if (since < 0 || since >= BURST_LIFE) return []
    const radius = 1.5 + since * 1.2
    return Array.from({ length: BURST_RAYS }).flatMap((_, i): Dot[] => {
      if (since >= BURST_THIN_AT && i % 2 === 1) return []
      const angle = (i / BURST_RAYS) * Math.PI * 2 + k
      // um subpixel é duas vezes mais alto que largo: na conta o anel é achatado, na tela sai redondo
      const x = Math.round(center + burst.dx + Math.cos(angle) * radius)
      const y = Math.round(burst.y + (Math.sin(angle) * radius) / 2)
      return [[dotKey(x, y), p.tier === 3 ? rainbow(k * 70 + i * 36) : (BURST_PAINTS[i % BURST_PAINTS.length] ?? INK)]]
    })
  })
}
