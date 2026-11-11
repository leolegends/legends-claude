// Gera os quadros do GIF da tabela de poderes do README: o mascote em cada classe de modelo (uma linha
// para cada) e em cada nível de effort (uma coluna para cada), pensando, com as mesmas funções que
// desenham o palco de verdade. Sai JSON no stdout.
//
//   bun run scripts/power-frames.ts [claro] | python3 scripts/demo-gif.py docs/power.gif
//
// Com `claro`, as auras saem como num tema claro (o GIF continua de fundo escuro: serve só para conferir).
// Os nomes das classes e dos níveis são os mesmos em qualquer idioma: um GIF só serve aos dois READMEs.
//
// Não faz parte do mod: roda fora do Claude Code, só para documentação.
import { cols } from '../hooks/format'
import type { Part } from '../hooks/parts'
import { EFFORTS, TIER_NAMES, power } from '../hooks/power'
import { sceneRows } from '../hooks/scene'
import { EMPTY_SIM, MAIN, geometry } from '../hooks/sim'
import type { Sim } from '../hooks/sim'

const IS_LIGHT = process.argv[2] === 'claro'
const FRAME_MS = 125
const FRAMES = 48 // seis segundos: a faixa de brilho de cada classe passa ao menos uma vez, e caem dois raios
const LABEL = 8 // células da coluna com o nome da classe
const CELL = 20 // células de cada combinação: o mascote, a aura mais larga e o raio ao lado dela
const MASCOT_X = 11 // onde o mascote fica dentro da célula, em subpixels
const NAME_ROW = 2 // a linha da cena ao lado da qual vai o nome da classe
const WIDTH = LABEL + CELL * EFFORTS.length

const geo = geometry(100)
if (!geo) throw new Error('o palco não cabe')
const stage = { ...geo, width: CELL }

const padded = (parts: Part[], width: number): Part[] => [...parts, { text: ' '.repeat(Math.max(0, width - parts.reduce((n, p) => n + cols(p.text), 0))) }]
const centered = (text: string, width: number) => `${' '.repeat(Math.floor((width - cols(text)) / 2))}${text}`.padEnd(width)

// O cabeçalho: o nome de cada nível de effort sobre a sua coluna.
const header: Part[] = [{ text: ' '.repeat(LABEL) }, ...EFFORTS.map((effort): Part => ({ text: centered(effort, CELL), dim: true }))]

// O mascote parado em casa, pensando: a cena de uma combinação num quadro.
const cellAt = (tier: number, level: number, tick: number): Part[][] => {
  const sim: Sim = {
    ...EMPTY_SIM, isOn: true, tick,
    workers: [{ id: MAIN, x: MASCOT_X, act: 'idle', t: 0, load: '', queue: '', busy: 0, tool: null, thinking: 1, isAsleep: false, shout: 0 }],
  }
  return sceneRows({ sim, geo: stage, hud: [], powers: new Map([[MAIN, power(tier, level)]]), isLight: IS_LIGHT }).map(row => padded(row, CELL))
}

const frameAt = (tick: number): Part[][] => [
  header,
  ...TIER_NAMES.flatMap((name, tier) => {
    const cells = EFFORTS.map((_, level) => cellAt(tier, level, tick))
    const rows = cells[0]?.length ?? 0
    return Array.from({ length: rows }, (_, row): Part[] => [
      { text: (row === NAME_ROW ? name : '').padEnd(LABEL), bold: true, color: 'claude' },
      ...cells.flatMap(cell => cell[row] ?? []),
    ])
  }),
]

console.log(JSON.stringify({ width: WIDTH, frameMs: FRAME_MS, frames: Array.from({ length: FRAMES }, (_, tick) => frameAt(tick)) }))
