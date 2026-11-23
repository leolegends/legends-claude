import { describe, expect, test } from 'claude-code/testing'

import { SAMPLE_RATE, clipOf, gainOf, pcmOf, shouldPlay, wavOf } from './sound'
import type { Cue } from './sound'

const CUES: readonly Cue[] = ['done', 'party', 'ask', 'spawn', 'fail', 'floor']
const SILENCE = 128
const text = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length))

describe('os sons da barra', () => {
  test('uma nota tem a duração pedida, e o silêncio é o meio da onda', () => {
    const pcm = pcmOf([[440, 100], [0, 50]])
    expect(pcm.length).toBe(Math.round(0.1 * SAMPLE_RATE) + Math.round(0.05 * SAMPLE_RATE))
    expect([...pcm.subarray(Math.round(0.1 * SAMPLE_RATE))].every(sample => sample === SILENCE)).toBe(true)
  })

  test('a nota é uma onda quadrada que começa sem estalo e apaga até o fim', () => {
    const pcm = pcmOf([[440, 200]])
    expect(pcm[0]).toBe(SILENCE) // a subida começa do silêncio
    const loudness = (from: number, to: number) => Math.max(...[...pcm.subarray(from, to)].map(sample => Math.abs(sample - SILENCE)))
    const early = loudness(50, 300)
    const late = loudness(pcm.length - 300, pcm.length)
    expect(early).toBeGreaterThan(20)
    expect(late).toBeLessThan(early / 4)
    expect([...pcm].some(sample => sample > SILENCE) && [...pcm].some(sample => sample < SILENCE)).toBe(true) // sobe e desce
  })

  test('o WAV tem o cabeçalho de um PCM de oito bits, mono', () => {
    const pcm = pcmOf([[880, 50]])
    const wav = wavOf(pcm)
    const view = new DataView(wav.buffer)
    expect(text(wav, 0, 4)).toBe('RIFF')
    expect(text(wav, 8, 8)).toBe('WAVEfmt ')
    expect(text(wav, 36, 4)).toBe('data')
    expect(view.getUint32(4, true)).toBe(wav.length - 8)
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(1) // um canal
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE)
    expect(view.getUint16(34, true)).toBe(8)
    expect(view.getUint32(40, true)).toBe(pcm.length)
    expect([...wav.subarray(44)]).toEqual([...pcm])
  })

  test('cada momento tem o seu som: um WAV em base64, curto, e o mesmo a cada pedido', () => {
    const clips = CUES.map(clipOf)
    expect(new Set(clips).size).toBe(CUES.length)
    for (const clip of clips) {
      expect(clip.startsWith('UklGR')).toBe(true) // "RIFF"
      expect(/^[A-Za-z0-9+/]+=*$/.test(clip)).toBe(true)
      expect(clip.length).toBeLessThan(12_000) // poucos KB: menos de um segundo de som
    }
    expect(clipOf('done')).toBe(clips[0])
  })

  test('mudo não toca; baixo é mais baixo que alto', () => {
    expect(gainOf('mudo')).toBe(0)
    expect(gainOf('baixo')).toBeGreaterThan(0)
    expect(gainOf('alto')).toBeGreaterThan(gainOf('baixo'))
    expect(shouldPlay('mudo', undefined, 1_000)).toBe(false)
    expect(shouldPlay('baixo', undefined, 1_000)).toBe(true)
  })

  test('o mesmo som duas vezes num instante é um só', () => {
    expect(shouldPlay('alto', 1_000, 1_100)).toBe(false)
    expect(shouldPlay('alto', 1_000, 1_400)).toBe(true)
    expect(shouldPlay('alto', 5_000, 1_000)).toBe(true) // o relógio voltou: não fica mudo à espera dele
  })
})
