import type { EngineInterface } from 'claude-code'

import { toBase64 } from './png'
import type { StatusSound as Sound } from '../types'

// Os sons da barra, de oito bits, feitos aqui mesmo: o mod não leva arquivo de áudio nem acessa a
// rede. Cada som é uma melodia curta de onda quadrada, com cada nota apagando depressa, escrita como
// um WAV e entregue ao Claude Code em base64. Ele só toca no macOS; nos outros sistemas o pedido é
// aceito e nada soa.

/** Os momentos que têm som: o fim de um turno (curto ou de festa), um pedido que espera pela pessoa, um ajudante que nasce, uma falha, um andar que fecha. */
export type Cue = 'done' | 'party' | 'ask' | 'spawn' | 'fail' | 'floor'

/** Uma nota: a frequência em hertz (0 é silêncio) e a duração em milissegundos. */
type Note = readonly [hz: number, ms: number]

// As notas, em hertz.
const B3 = 247, E4 = 330, C5 = 523, E5 = 659, G5 = 784, A5 = 880, B5 = 988, C6 = 1047, D6 = 1175, E6 = 1319, G6 = 1568

const TUNES: Record<Cue, readonly Note[]> = {
  done: [[G5, 70], [C6, 140]], // um "plim" de duas notas
  party: [[C5, 80], [E5, 80], [G5, 80], [C6, 220]], // a fanfarra de um turno que trabalhou
  ask: [[A5, 90], [0, 50], [A5, 90], [0, 50], [D6, 170]], // duas batidas e uma mais alta: é com você
  spawn: [[E5, 50], [B5, 90]],
  fail: [[E4, 110], [B3, 200]], // desce
  floor: [[C5, 70], [G5, 70], [C6, 70], [E6, 70], [G6, 230]], // sobe um andar
}

/** Amostras por segundo: pouco, para um som curto pesar poucos KB; sobra para uma onda quadrada. */
export const SAMPLE_RATE = 11_025
const SILENCE = 128 // o meio de um som de oito bits sem sinal
const LEVEL = 46 // a amplitude de uma nota no começo dela, de 127
const DECAY = 5 // quanto uma nota apaga do começo ao fim dela (o expoente da queda)
const ATTACK_MS = 4 // a subida de cada nota: sem ela, o começo estala
const WAV_HEADER = 44
const MIN_GAP_MS = 350 // o mesmo som duas vezes em menos tempo que isso é um só
const GAINS: Record<Sound, number> = { mudo: 0, baixo: 0.35, alto: 1 }

/** Puro: as amostras de uma melodia, em oito bits sem sinal, mono. */
export const pcmOf = (notes: readonly Note[]): Uint8Array => {
  const lengths = notes.map(([, ms]) => Math.max(0, Math.round((ms / 1000) * SAMPLE_RATE)))
  const pcm = new Uint8Array(lengths.reduce((sum, n) => sum + n, 0)).fill(SILENCE)
  const attack = Math.max(1, Math.round((ATTACK_MS / 1000) * SAMPLE_RATE))
  let at = 0
  notes.forEach(([hz], n) => {
    const length = lengths[n] ?? 0
    if (hz > 0) {
      const period = SAMPLE_RATE / hz
      for (let i = 0; i < length; i++) {
        const envelope = Math.min(1, i / attack) * Math.exp((-DECAY * i) / length)
        pcm[at + i] = SILENCE + Math.round((i % period < period / 2 ? LEVEL : -LEVEL) * envelope)
      }
    }
    at += length
  })
  return pcm
}

/** Puro: as amostras dentro de um arquivo WAV (PCM de oito bits, mono). */
export const wavOf = (pcm: Uint8Array): Uint8Array => {
  const wav = new Uint8Array(WAV_HEADER + pcm.length)
  const view = new DataView(wav.buffer)
  const text = (at: number, word: string) => [...word].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, WAV_HEADER - 8 + pcm.length, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true) // o tamanho do bloco de formato
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // um canal
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE, true) // bytes por segundo: um por amostra
  view.setUint16(32, 1, true) // bytes por amostra
  view.setUint16(34, 8, true) // bits por amostra
  text(36, 'data')
  view.setUint32(40, pcm.length, true)
  wav.set(pcm, WAV_HEADER)
  return wav
}

const clips = new Map<Cue, string>()
const playedAt = new Map<Cue, number>()

/** O som de um momento como WAV em base64; feito uma vez e guardado. */
export const clipOf = (cue: Cue): string => {
  const known = clips.get(cue)
  if (known !== undefined) return known
  const clip = toBase64(wavOf(pcmOf(TUNES[cue])))
  clips.set(cue, clip)
  return clip
}

/** O volume de cada nível dos ajustes; 0 é mudo. */
export const gainOf = (sound: Sound): number => GAINS[sound] ?? 0

/** Puro: o som toca agora? Não com o som mudo, nem se o mesmo som tocou há um instante (`lastAt`). */
export const shouldPlay = (sound: Sound, lastAt: number | undefined, now: number): boolean =>
  gainOf(sound) > 0 && (lastAt === undefined || now - lastAt >= MIN_GAP_MS || now < lastAt)

/**
 * Toca o som de um momento, no volume dos ajustes. Não espera o som acabar para devolver quem chama:
 * a promessa é a do pedido ao Claude Code, e rejeita quando ele não consegue tocar.
 */
export function playCue($: EngineInterface, cue: Cue, sound: Sound, now: number): Promise<void> {
  if (!shouldPlay(sound, playedAt.get(cue), now)) return Promise.resolve()
  playedAt.set(cue, now)
  return $.audio.play({ base64: clipOf(cue), mime: 'audio/wav' }, { gain: gainOf(sound) })
}
