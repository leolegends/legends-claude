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

/**
 * O elemento da aura de um avatar: fogo, raio ou estrela. Com ele, as tintas da aura são as do
 * elemento, em qualquer classe de modelo; sem ele, a aura tem a cor da classe.
 */
export type Element = 'fire' | 'volt' | 'star'

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
  /** O elemento da aura de um avatar; sem ele, a aura é a da classe. */
  element?: Element
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

/** Uma camada de uma aura: a tinta dela numa coluna (em subpixels) e quanto ela esmaece em direção ao fundo. */
export type Band = { paint: (x: number) => Paint; fade: number }

/**
 * A aura de um bicho num quadro. As camadas vão de dentro para fora: o coração (rente ao corpo, só no
 * palco em pixels: no de texto a célula não comporta três tintas), o miolo, e as pontas e beiradas.
 */
export type Flare = {
  heart: Band
  core: Band
  rim: Band
  /** A tinta do que a aura solta: as fagulhas e os jatos. */
  mote: (x: number) => Paint
  /** A altura da língua de uma coluna, de `TONGUE_MIN` a 1. */
  lick: (x: number) => number
  /** A quantos subpixels do corpo a coluna inteira já é beirada, numa aura que chega a `reach`. */
  rimFrom: (reach: number) => number
}

const RIM_FROM = 2 // a tantos subpixels do corpo, a coluna inteira do clarão de uma classe é beirada
/** A tantas sublinhas abaixo da ponta de uma língua começa o coração dela. */
export const HEART_DEPTH = 2

// As tintas de cada elemento, de dentro para fora. O fogo vai do amarelo ao vermelho. O raio é um campo
// elétrico azul, quase branco por dentro, e o que ele solta (as faíscas, o raio que cai) é amarelo: num
// clarão amarelo o rato amarelo sumiria. A estrela dá a volta no arco-íris, mais clara por dentro, e
// solta estrelinhas de ouro.
const FIRE = { heart: '#FFD75E', core: '#FF8A1F', rim: '#E2371C' } as const
const VOLT = { heart: '#DDF4FF', core: '#58BFFF', rim: '#2F6FE0', spark: '#FFE45C' } as const
// Quanto cada camada esmaece, de dentro para fora. As de um elemento esmaecem bem menos que o clarão de
// uma classe, que é só um brilho atrás do bicho: a aura de um avatar é para ser vista. O campo do raio
// é o mais apagado dos três: quem brilha nele são os estalos.
type Fades = readonly [heart: number, core: number, rim: number]
const VIVID: Fades = [0.06, 0.14, 0.4]
const FIELD: Fades = [0.1, 0.3, 0.5]
const SHELL = 2 // quantos subpixels de fora da aura de um elemento são só beirada
const STAR_PER_COLUMN = 10 // quanto o matiz da estrela anda por subpixel de largura, em graus
const STAR_PER_TICK = 30 // e por quadro: uma volta inteira a cada doze
const STAR_GLOW = 0.35 // quanto o coração da estrela clareia
const STAR_MOTE = '#FFE14D'
const EMBER_SHARE = 0.5 // a fração das fagulhas do fogo que sobe amarela; as outras, laranja

// As pontas do clarão de raio: sem onda nenhuma. Cada subpixel de largura salta para uma altura nova a
// cada quadro, quase sempre baixa e de vez em quando alta: um contorno espetado, que estala. A ponta é
// do subpixel inteiro: no traço fino, as duas meias colunas dele saltam juntas.
const zap = (x: number, tick: number) => TONGUE_MIN + (1 - TONGUE_MIN) * noise(x, Math.floor(tick)) ** 2

const solid = (paint: Paint) => () => paint

/**
 * A aura de um bicho num quadro: a do elemento dele ou, sem elemento, a da classe (uma tinta só, que
 * esmaece mais nas pontas e beiradas).
 */
export const flareOf = (p: Power, tick: number, element?: Element): Flare => {
  const wave = (x: number) => tongue(x, tick)
  if (!element) {
    const paint = classPaint(p, tick)
    const core = { paint, fade: CORE_FADE }
    return { heart: core, core, rim: { paint, fade: EDGE_FADE }, mote: paint, lick: wave, rimFrom: () => RIM_FROM }
  }
  const rimFrom = (reach: number) => Math.max(RIM_FROM, reach - SHELL + 1)
  if (element === 'star') {
    const hue = (x: number) => rainbow(x * STAR_PER_COLUMN + tick * STAR_PER_TICK)
    return {
      heart: { paint: x => mix(hue(x), WHITE, STAR_GLOW), fade: VIVID[0] },
      core: { paint: hue, fade: VIVID[1] },
      rim: { paint: hue, fade: VIVID[2] },
      mote: solid(STAR_MOTE), lick: wave, rimFrom,
    }
  }
  const tones = element === 'fire' ? FIRE : VOLT
  const fades = element === 'fire' ? VIVID : FIELD
  return {
    heart: { paint: solid(tones.heart), fade: fades[0] },
    core: { paint: solid(tones.core), fade: fades[1] },
    rim: { paint: solid(tones.rim), fade: fades[2] },
    mote: element === 'fire' ? x => (noise(x, Math.floor(tick)) < EMBER_SHARE ? FIRE.heart : FIRE.core) : solid(VOLT.spark),
    lick: element === 'volt' ? x => zap(x, tick) : wave,
    rimFrom,
  }
}

/** O raio de uma aura: a classe a partir da qual cai, a força que pede, de quantos em quantos quadros, e a tinta dele. */
export type Storm = { tier: number; from: number; every: number; paint: Paint }

const VOLT_BOLT_FROM = MOTES_FROM // o avatar de raio solta raios desde que as fagulhas sobem…
const VOLT_BOLT_EVERY = 13 // …e mais vezes que os da classe

/**
 * O raio de uma aura. O da classe só cai de Opus para cima, com a aura bem forte, na cor do texto; o
 * do avatar de raio cai em qualquer classe, mais cedo e mais vezes, em amarelo (mais escuro num tema
 * claro, para não sumir no fundo).
 */
export const stormOf = (element: Element | undefined, isLight: boolean): Storm =>
  element === 'volt'
    ? { tier: 0, from: VOLT_BOLT_FROM, every: VOLT_BOLT_EVERY, paint: sparkOf(VOLT.spark, isLight) }
    : { tier: BOLT_TIER, from: BOLT_FROM, every: BOLT_EVERY, paint: INK }

/** Cai um raio neste quadro: o poder e a força da aura dão para ele, e é a vez dele. */
export const strikes = (storm: Storm, p: Power, strength: number, tick: number): boolean =>
  p.tier >= storm.tier && strength >= storm.from && ((tick % storm.every) + storm.every) % storm.every < BOLT_FRAMES

const ARC_HOLD = 2 // quadros que um estalo fica aceso
const ARC_SHARE = 0.75 // a fração dos estalos que acende de cada vez: os outros descansam
const ARC_MIN = 2 // o comprimento de um estalo, em sublinhas: no mínimo…
const ARC_SWING = 3 // …e quantas a mais ele pode ter
const ARC_STRAIGHT = 0.2 // a fração dos passos de um estalo que desce reto, sem ir para o lado

/** Um estalo: um raio curto, ponto a ponto. O x é em subpixels a partir da borda esquerda do desenho; o y, a sublinha na cena. */
export type Arc = readonly (readonly [x: number, y: number])[]

/**
 * Os estalos do avatar de raio: raios curtos que acendem e apagam em volta dele, de um lado e do
 * outro, tantos mais quanto mais forte a aura. Cada um desce em ziguezague de um ponto perto do corpo
 * e fica acima da linha dos pés. Quem não é de raio, ou não tem aura, não estala.
 */
export const arcsOf = ({ bitmap, top, floor, strength, element }: Pick<Figure, 'bitmap' | 'top' | 'floor' | 'strength' | 'element'>, tick: number): Arc[] => {
  if (element !== 'volt' || strength <= 0) return []
  const beat = Math.floor(tick / ARC_HOLD)
  const width = widthOf(bitmap)
  const reach = REACH[strength] ?? 0
  return Array.from({ length: 1 + Math.ceil(strength / 2) }).flatMap((_, k): Arc[] => {
    if (noise(k * 11 + 5, beat) >= ARC_SHARE) return []
    const spread = Math.floor(noise(k * 7 + 3, beat) * (reach + 1))
    const start = noise(k * 17 + 2, beat) < 0.5 ? width + spread : -1 - spread
    const length = ARC_MIN + Math.floor(noise(k * 5 + 9, beat) * ARC_SWING)
    const room = Math.max(1, floor - length - Math.max(0, top - 1))
    const from = Math.max(0, top - 1) + Math.floor(noise(k * 3 + 7, beat) * room)
    // em ziguezague: um passo para um lado, o seguinte para o outro; de vez em quando, um passo reto
    const lean = noise(k * 19 + 1, beat) < 0.5 ? 0 : 1
    const xs = Array.from({ length }).reduce<number[]>((path, _step, i) => {
      const sway = i === 0 || noise(k * 13 + i, beat + 31) < ARC_STRAIGHT ? 0 : (i + lean) % 2 === 0 ? 1 : -1
      return [...path, (path[path.length - 1] ?? start) + sway]
    }, [])
    return [xs.flatMap((x, i): [number, number][] => (from + i < floor ? [[x, from + i]] : []))]
  })
}

// A primeira linha pintada de cada coluna do desenho, de cima para baixo.
export const columnTops = (bitmap: Bitmap): (number | undefined)[] =>
  Array.from({ length: widthOf(bitmap) }, (_, col) => {
    const at = bitmap.findIndex(row => isPainted(row[col]))
    return at < 0 ? undefined : at
  })

/**
 * A aura: um clarão atrás do bicho, na cor da classe dele ou nas tintas do elemento do avatar. Sobre o
 * corpo, línguas de fogo sobem e descem a cada quadro; para os lados, o clarão arredonda e fecha. O
 * miolo é mais vivo; as pontas e as beiradas, mais apagadas. `null` quando o poder não dá aura.
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
  const flare = flareOf(p, mood.tick, figure.element)
  const rimFrom = flare.rimFrom(reach)
  // Em cada coluna: de que sublinha a que sublinha o clarão vai, e se a coluna é beirada.
  const flames = Array.from({ length: tops.length + reach * 2 }, (_, i) => {
    const col = i - reach
    const away = Array.from({ length: reach + 1 }, (_, d) => d).find(d => tops[col - d] !== undefined || tops[col + d] !== undefined)
    if (away === undefined) return null
    const bodyTop = top + (tops[col - away] ?? tops[col + away] ?? 0)
    const lick = rise * flare.lick(from + i)
    if (away === 0) return { from: Math.max(0, Math.round(bodyTop - lick)), to: base, isRim: false }
    // Ao lado do corpo o clarão é uma meia elipse: mais baixo e mais curto quanto mais longe.
    const span = base - bodyTop + 1
    const middle = base - (span - 1) / 2
    const curve = Math.sqrt(1 - (away / (reach + 1)) ** 2)
    const flameTop = Math.max(0, Math.round(middle - (span / 2 + lick) * curve))
    const flameEnd = Math.min(base, Math.round(middle + (span / 2) * curve))
    return flameTop > flameEnd ? null : { from: flameTop, to: flameEnd, isRim: away >= rimFrom }
  })
  const backdrop = backdropOf(mood.isLight)
  return (x, y) => {
    const flame = flames[x - from]
    if (!flame || y < flame.from || y > flame.to) return undefined
    // a cor é a da célula (as duas colunas dela juntas): dentro de uma célula só mudam o miolo e a beirada
    const band = flame.isRim || y === flame.from ? flare.rim : flare.core
    return mix(band.paint(x & ~1), backdrop, band.fade)
  }
}

/**
 * O que a aura solta na frente da cena: fagulhas que sobem pelos lados do bicho e, nos poderes mais
 * altos, um raio que cai ao lado dele de tempos em tempos. O avatar de raio ainda estala em volta.
 */
export const sparksOf = (p: Power, figure: Figure, mood: Mood): Dot[] => {
  const { bitmap, left, floor, strength, element } = figure
  const { tick, isLight } = mood
  const paint = flareOf(p, tick, element).mote
  // Os estalos do avatar de raio vêm com qualquer aura; o resto, só com ela forte.
  const arcs = arcsOf(figure, tick).flat().map(([x, y]): Dot => [dotKey(left + x, y), sparkOf(paint(left + x), isLight)])
  if (strength < MOTES_FROM) return arcs
  const width = widthOf(bitmap)
  const reach = REACH[strength] ?? 0
  const storm = stormOf(element, isLight)
  const motes = [...arcs, ...Array.from({ length: strength - 1 }, (_, k): Dot => {
    const clock = tick + k * MOTE_STAGGER
    const age = clock % MOTE_LIFE
    const life = Math.floor(clock / MOTE_LIFE)
    const isRight = (k + life) % 2 === 1
    const spread = Math.floor(noise(k * 7 + 1, life) * (reach + 2))
    const sway = Math.round(Math.sin((age + k) * 1.1))
    const x = (isRight ? left + width + spread : left - 1 - spread) + sway
    return [dotKey(x, floor - 1 - age), sparkOf(paint(x), isLight)]
  })]
  if (!strikes(storm, p, strength, tick)) return motes
  // O raio: desce do alto até o chão em ziguezague, de um lado e depois do outro.
  const strike = Math.floor(tick / storm.every)
  const start = strike % 2 === 1 ? left + width + reach + 2 : left - reach - 3
  const bolt = Array.from({ length: floor + 1 }).reduce<{ x: number; dots: Dot[] }>(
    (acc, _, y) => {
      const turn = noise(strike * 13 + y, 3)
      const x = acc.x + (turn < 0.34 ? -1 : turn > 0.66 ? 1 : 0)
      return { x, dots: [...acc.dots, [dotKey(x, y), storm.paint]] }
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
  const paint = flareOf(p, mood.tick, figure.element).core.paint
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
  const paint = flareOf(p, mood.tick, figure.element).mote
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
