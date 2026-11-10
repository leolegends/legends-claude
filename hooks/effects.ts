import { merge } from './parts'
import type { Part } from './parts'

// As animações de texto da barra: a faísca, o cometa, o pulso da régua, o nome que surge, o estouro, o brilho.
// Todas são função do quadro: o mesmo quadro desenha sempre a mesma coisa.

const TRAIL_WIDTH = 8 // o rastro de faíscas da linha de trabalho
const WAVE_SPEED = 4 // colunas que o pulso da régua anda por quadro
const WAVE_WIDTH = 4 // colunas acesas de cada lado da frente do pulso
const WAVE_REST = 8 // colunas "fora da régua" que o pulso percorre antes de recomeçar: a pausa
const REVEAL_LEAD = 1 // quadros de faíscas antes de a primeira letra assentar
const REVEAL_JITTER = 0.35 // fração das letras que assenta um quadro depois da vizinha
const SHIMMER_GAP = 6 // quadros de pausa entre uma passada do brilho e a seguinte

// A faísca do Claude pulsando: cresce de · até ✽ e volta, como o giro do próprio Claude Code.
export const SPINNER = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']
export const IDLE_GLYPH = '✻'

export const spin = (f: number, offset = 0) => SPINNER[(f + offset) % SPINNER.length] ?? IDLE_GLYPH

// A cauda de um cometa de faíscas, da cabeça para trás.
const COMET: Part[] = [
  { text: '✻', color: 'claude', bold: true },
  { text: '✶', color: 'claude' },
  { text: '✳', color: 'claude', dim: true },
  { text: '✢', color: 'subtle' },
]
const TRAIL_DOT: Part = { text: '·', color: 'subtle' }

// Um cometa de faíscas que atravessa a trilha da esquerda para a direita e sai antes de voltar:
// ✻······· → ✶✻······ → ✳✶✻····· → … → ·······✢ → ✻·······
export const trail = (f: number, width = TRAIL_WIDTH): Part[] => {
  const head = f % (width + COMET.length)
  return Array.from({ length: width }, (_, i) => COMET[head - i] ?? TRAIL_DOT)
}

// Um número em [0, 1) que depende só das entradas: o "acaso" das animações, igual a cada redesenho.
export const noise = (a: number, b = 0) => {
  const mixed = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0
  const folded = Math.imul(mixed ^ (mixed >>> 15), 0x2c1b3c6d) >>> 0
  return ((folded ^ (folded >>> 12)) >>> 0) / 4294967296
}

export const seedOf = (id: string) => [...id].reduce((n, ch) => (n * 31 + (ch.codePointAt(0) ?? 0)) | 0, 7)

// A régua de cima. Parada, é uma linha fina; com trabalho em curso, um pulso nasce no centro e corre
// para as duas pontas: grosso na frente, aceso logo atrás, e a régua volta a apagar depois que ele passa.
export const ruleParts = (width: number, fr: number, isActive: boolean): Part[] => {
  if (!isActive || width <= 0) return [{ text: '─'.repeat(Math.max(0, width)), color: 'subtle' }]
  const mid = (width - 1) / 2
  const front = (fr * WAVE_SPEED) % (mid + WAVE_WIDTH + WAVE_REST)
  return merge(
    Array.from({ length: width }, (_, i): Part => {
      const delta = Math.abs(Math.abs(i - mid) - front)
      if (delta < 1) return { text: '━', color: 'claude', bold: true }
      return delta <= WAVE_WIDTH ? { text: '─', color: 'claude' } : { text: '─', color: 'subtle' }
    }),
  )
}

// Um nome que surge de faíscas: cada letra ferve por alguns quadros e assenta, da esquerda para a
// direita com um atraso irregular. `null` quando todas já assentaram.
export const reveal = (text: string, age: number, seed = 0): Part[] | null => {
  const chars = [...text]
  const settlesAt = (i: number) => REVEAL_LEAD + Math.floor(i / 2) + (noise(i, seed) < REVEAL_JITTER ? 1 : 0)
  if (age < 0 || chars.every((_, i) => age >= settlesAt(i))) return null
  return merge(
    chars.map((ch, i): Part =>
      age >= settlesAt(i)
        ? { text: ch, bold: true }
        : { text: SPINNER[Math.floor(noise(i * 31 + age, seed) * 6)] ?? '·', color: 'claude', dim: true },
    ),
  )
}

// Um estouro de faíscas ao lado do ✓ de quem acabou de terminar: denso no começo, ralo no fim.
const BURST = ['✽  ', '✻✶ ', '✶✳✢', '✳✢·', '✢· ', '·  ']
/** Quantos quadros dura o estouro. */
export const BURST_FRAMES = BURST.length
export const burst = (age: number): Part[] => {
  const sparks = age >= 0 ? BURST[age] : undefined
  return sparks ? [{ text: ' ' }, { text: sparks, color: 'success' }] : []
}

// Um brilho que percorre o texto, uma letra por quadro, e descansa antes de voltar.
export const shimmer = (text: string, f: number): Part[] => {
  const chars = [...text]
  const at = f % (chars.length + SHIMMER_GAP)
  if (at >= chars.length) return [{ text, bold: true }]
  return [
    { text: chars.slice(0, at).join(''), bold: true },
    { text: chars[at] ?? '', color: 'claude', bold: true },
    { text: chars.slice(at + 1).join(''), bold: true },
  ].filter(p => p.text)
}
