import { canFly } from './aura'
import { tintOf } from './palette'
import { PLAIN, auraOf } from './power'
import type { Power } from './power'
import { MAIN, SPAWN } from './sim'
import type { Sim, Worker } from './sim'
import { CLAWD, MINI } from './sprites'
import type { Art, Eyes } from './sprites'

// A pose de um bicho num quadro, pura: do estado dele na simulação sai o que ele está fazendo com o
// corpo (anda, carrega, levanta os braços, pula, dorme), para onde olha e o que mostra sobre a cabeça.
// Quem desenha (o palco de texto e o de alta resolução) parte daqui: os dois decidem igual.

const JUMP = [0, -1, -2, -2, -1, 0] // os pulos de quem comemora, em sublinhas
const FALL = [-2, -1] // um ajudante recém-brotado cai até o chão
const BLINK_EVERY = 31 // a cada tantos quadros, um quadro de olhos fechados
const LOOK: readonly Eyes[] = ['open', 'open', 'left', 'open', 'open', 'right'] // quem pensa olha para os lados
const LOOK_HOLD = 6 // quadros em cada olhar
const SNORE = 5 // quadros entre um z e o seguinte de quem dorme
const WAVE_PERIOD = 4 // quem espera uma ferramenta sobe e desce os braços neste ritmo
const HELPER_AURA = 0.6 // a aura de um ajudante é a fração da do mascote com o mesmo poder: ele é menor
const DOTS_HOLD = 2 // quadros com cada número de pontinhos depois do nome da ferramenta
const DOTS_MAX = 3

/** O que um bicho mostra sobre a cabeça, ou ao lado: um sinal, não um desenho. */
export type Mark =
  | { kind: 'shout' }
  | { kind: 'cheer' }
  | { kind: 'fail' }
  /** Dormindo: um z, e de tempos em tempos outro mais alto. */
  | { kind: 'sleep'; isLoud: boolean }
  /** Esperando uma ferramenta: o nome dela e de um a três pontinhos. */
  | { kind: 'tool'; tool: string; dots: number }
  | { kind: 'think' }

export type Pose = {
  isMain: boolean
  art: Art
  /** A cor dele: do tema ou hex. */
  tint: string
  /** Ainda não apareceu (ou já sumiu): não se desenha. */
  isUnseen: boolean
  isWalking: boolean
  isCarrying: boolean
  isArmsUp: boolean
  eyes: Eyes
  /** Qual dos dois passos das patas. */
  step: 0 | 1
  /** Sem a linha das patas: sentado dormindo, ou voando. */
  isSitting: boolean
  isFlying: boolean
  isFailed: boolean
  /** Quanto o corpo sobe do chão, em sublinhas (negativo é para cima). */
  lift: number
  /** O poder que vale para o desenho: nenhum para quem falhou ou dorme. */
  power: Power
  /** A força da aura, já na medida do tamanho dele. */
  strength: number
  /** De que lado ficam os riscos de quem corre: -1 à esquerda (vai para a direita), 1 à direita, 0 sem riscos. */
  wake: -1 | 0 | 1
  mark: Mark | null
}

/** Um número fixo por bicho, para cada um piscar e olhar fora de fase do vizinho. */
export const seedOf = (id: string) => [...id].reduce((n, ch) => (n * 31 + (ch.codePointAt(0) ?? 0)) >>> 0, 7) % 997

const markOf = (w: Worker, sim: Sim, isResting: boolean, isCarrying: boolean): Mark | null => {
  if (w.shout > 0) return { kind: 'shout' }
  if (w.act === 'cheer') return { kind: 'cheer' }
  if (w.act === 'fail') return { kind: 'fail' }
  if (w.act === 'sleep') return { kind: 'sleep', isLoud: Math.floor(sim.tick / SNORE) % 2 === 1 }
  if (!isResting || isCarrying) return null
  if (w.busy > 0 && w.tool) return { kind: 'tool', tool: w.tool, dots: 1 + (Math.floor(sim.tick / DOTS_HOLD) % DOTS_MAX) }
  return w.thinking > 0 ? { kind: 'think' } : null
}

/**
 * Puro: a pose de um bicho. Sem poder (`undefined`: quem desenha não disse nenhum), é o bicho de
 * sempre; quem falhou apaga e quem dorme descansa: nos dois casos, sem poder nenhum. `mascot` é o
 * desenho do mascote (o avatar escolhido nos ajustes); os ajudantes são sempre os mesmos.
 */
export const poseOf = (w: Worker, sim: Sim, given: Power | undefined, mascot: Art = CLAWD): Pose => {
  const isMain = w.id === MAIN
  const isWalking = w.shout === 0 && (w.act === 'fetch' || w.act === 'haul' || w.act === 'home' || (isMain && w.act === 'enter'))
  const isCarrying = w.load.length > 0
  const isResting = w.act === 'idle' && w.shout === 0
  const isWaving = isResting && w.busy > 0 && sim.tick % WAVE_PERIOD < WAVE_PERIOD / 2
  const phase = sim.tick + seedOf(w.id)
  const eyes: Eyes =
    w.act === 'sleep' || w.act === 'fail' || phase % BLINK_EVERY === 0 ? 'closed'
    : isResting && w.thinking > 0 ? (LOOK[Math.floor(phase / LOOK_HOLD) % LOOK.length] ?? 'open')
    : 'open'
  const power = !given || w.act === 'fail' || w.act === 'sleep' ? PLAIN : given
  const isFlying = isWalking && canFly(power) // em vez de andar, voa: sem patas, um jato por baixo
  const lift =
    w.act === 'cheer' ? (JUMP[w.t % JUMP.length] ?? 0)
    : w.act === 'enter' && !isMain ? (FALL[w.t - SPAWN] ?? 0)
    : isFlying ? -1 // o corpo fica uma sublinha acima do chão
    : isWalking && !isCarrying ? -(sim.tick % 2) // de mãos vazias vai aos pulinhos
    : 0
  return {
    isMain,
    art: isMain ? mascot : MINI,
    tint: isMain ? 'claude' : tintOf(w.id),
    isUnseen: w.act === 'poof' || (!isMain && w.act === 'enter' && w.t < SPAWN),
    isWalking,
    isCarrying,
    isArmsUp: isCarrying || w.act === 'lift' || w.act === 'drop' || w.act === 'cheer' || w.shout > 0 || isWaving,
    eyes,
    step: isWalking && sim.tick % 2 === 1 ? 1 : 0,
    isSitting: w.act === 'sleep' || isFlying,
    isFlying,
    isFailed: w.act === 'fail',
    lift,
    power,
    strength: isMain ? auraOf(power) : Math.ceil(auraOf(power) * HELPER_AURA),
    // Quem corre com poder risca o ar atrás de si: indo buscar, à direita; levando, à esquerda.
    wake: w.shout > 0 ? 0 : w.act === 'haul' ? -1 : w.act === 'fetch' ? 1 : 0,
    mark: markOf(w, sim, isResting, isCarrying),
  }
}
