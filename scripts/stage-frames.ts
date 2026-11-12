// Gera os quadros do GIF do palco em alta resolução: a demonstração do palco, desenhada em pixels ou em
// blocos de terminal, com as mesmas funções que o mod usa. Sai um arquivo com os quadros crus.
//
//   bun run scripts/stage-frames.ts <saída.bin> [colunas] [pixels|blocos] [normal|grande] [modelo] [effort] [claro]
//   python3 scripts/stage-gif.py docs/stage.gif "pixels=<a.bin>" "blocos=<b.bin>" …
//
// `pixels` é o que um terminal que desenha imagens mostra (kitty, Ghostty, iTerm2) e, em vetor, o app
// desktop; `blocos`, o que os outros terminais mostram. O modelo (`fable`, `opus`, `sonnet`, `haiku`; o
// padrão é `fable`) e o effort (`low` a `max`; o padrão é `high`) dão a aparência do mascote.
//
// O arquivo: uma linha JSON com as medidas; depois, para cada quadro, uma linha JSON com os textos dele
// (as células de texto do palco em blocos: quem monta o GIF as escreve com uma fonte) e os pixels RGBA.
//
// Não faz parte do mod: roda fora do Claude Code, só para documentação.
import { appendFileSync, writeFileSync } from 'node:fs'

import { DEFAULT_COLOR, cellShapes } from '../hooks/blocks'
import type { Cell } from '../hooks/blocks'
import { rasterize } from '../hooks/canvas'
import type { Frame } from '../hooks/canvas'
import { DEMO_CAST, DEMO_FRAMES, applyDemo } from '../hooks/demo'
import { CELL_H, CELL_W, hdScene } from '../hooks/hd'
import type { HdScene } from '../hooks/hd'
import { powerOf } from '../hooks/power'
import { EMPTY_SIM, MAIN, geometry, step, syncHelpers } from '../hooks/sim'
import type { Sim } from '../hooks/sim'
import { rasterCells } from '../hooks/stage'

const [out, columnsArg = '100', mode = 'pixels', size = 'normal', model = 'fable', effort = 'high', theme = 'escuro'] = process.argv.slice(2)
if (!out) throw new Error('falta o arquivo de saída')
const COLUMNS = Number(columnsArg)
const ZOOM = size === 'grande' ? 2 : 1
const IS_LIGHT = theme === 'claro'
const IS_BLOCKS = mode === 'blocos'
const FRAME_MS = 125
const PAINTS = 2 // pinturas por quadro da simulação: o GIF sai a 16 quadros por segundo
const LOOK = { isLight: IS_LIGHT, accent: 'claude' }
const BLOCK_FIRST = 0x2580
const BLOCK_LAST = 0x259f

const geo = geometry(Math.floor(COLUMNS / ZOOM))
if (!geo) throw new Error(`o palco não cabe em ${COLUMNS} colunas no tamanho ${size}`)

const powers = new Map([...DEMO_CAST, [MAIN, powerOf(`claude-${model}-5`, effort)] as const])

// A cena num instante: entre o estado de antes de um passo da demonstração e o de depois dele.
const sceneAt = (before: Sim, after: Sim, alpha: number): HdScene =>
  hdScene({ prev: before, cur: after, alpha, geo, hud: [{ text: '▶ demo', dim: true }], powers, isLight: IS_LIGHT, trace: IS_BLOCKS ? 'blocks' : 'pixels', zoom: ZOOM })

const hex = (rgb: number) => `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`

/** Um texto de uma célula do palco em blocos: a coluna, a linha, o caractere e a cor dele (`null` é a do terminal). */
type Text = [column: number, row: number, char: string, color: string | null]

// O quadro e os textos de uma cena. Em blocos, as células de bloco viram retângulos, como um terminal as
// pinta, e as de texto (o chão, as estrelas, os sinais, o placar) vão à parte, para quem tem fonte.
const drawn = (scene: HdScene): { frame: Frame; texts: Text[] } => {
  if (!IS_BLOCKS) return { frame: rasterize(scene.shapes, scene.width, scene.height), texts: [] }
  const cells = rasterCells(scene, LOOK)
  const isBlock = (cell: Cell) => cell.code >= BLOCK_FIRST && cell.code <= BLOCK_LAST
  const texts = cells.flatMap((cell, i): Text[] =>
    isBlock(cell) || cell.code === 0x20 ? [] : [[i % scene.columns, Math.floor(i / scene.columns), String.fromCodePoint(cell.code), cell.fg === DEFAULT_COLOR ? null : hex(cell.fg)]])
  return { frame: rasterize(cellShapes(cells, scene.columns, CELL_W, CELL_H), scene.width, scene.height), texts }
}

const first = sceneAt(EMPTY_SIM, EMPTY_SIM, 1)
writeFileSync(out, `${JSON.stringify({ width: first.width, height: first.height, cellW: CELL_W, cellH: CELL_H, frameMs: Math.round(FRAME_MS / PAINTS), isLight: IS_LIGHT })}\n`)

let sim: Sim = EMPTY_SIM
let count = 0
for (let tick = 0; tick <= DEMO_FRAMES; tick++) {
  const before = applyDemo(sim, tick)
  const after = step(syncHelpers(before, []), geo)
  for (let paint = 0; paint < PAINTS; paint++) {
    const { frame, texts } = drawn(sceneAt(before, after, paint / PAINTS))
    appendFileSync(out, `${JSON.stringify({ texts })}\n`)
    appendFileSync(out, frame.data)
    count += 1
  }
  sim = after
}
console.log(`${out}: ${count} quadros de ${first.width}x${first.height}, ${mode}, ${size}`)
