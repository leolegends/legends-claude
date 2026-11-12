import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_COLOR, packCells, unpackCells } from './blocks'
import type { Cell } from './blocks'
import { CELL_H, CELL_W, hdScene } from './hd'
import type { Part } from './parts'
import { EMPTY_SIM, MAIN, geometry } from './sim'
import type { Geo, Sim, Worker } from './sim'
import { SPINNER } from './effects'
import { sparkAt } from './power'
import type { Tier } from './power'
import { IMAGE_SCALE, PROBE_PNG, alphaOf, backendOf, codeOf, isPixelRefusal, paintEvery, rasterCells, stageImage, stageSvg, zoomOf } from './stage'
import type { Abilities } from './stage'

const geo = geometry(80) as Geo
const worker = (id: string, x: number, change: Partial<Worker> = {}): Worker => ({ id, x, act: 'idle', t: 0, load: '', queue: '', busy: 0, tool: null, thinking: 0, isAsleep: false, shout: 0, ...change })
const still = (workers: Worker[], change: Partial<Sim> = {}): Sim => ({ ...EMPTY_SIM, isOn: true, tick: 8, workers, ...change })
const thinking = still([worker(MAIN, 40, { thinking: 1 })])
const CLAUDE = 0xd97757

const ALL: Abilities = { hasImage: true, hasRaster: true, hasSvg: false, pixels: 'yes' }
const DESKTOP: Abilities = { hasImage: false, hasRaster: false, hasSvg: true, pixels: 'unknown' }

describe('em que o palco é desenhado', () => {
  test('clássica é sempre texto, em qualquer tela', () => {
    expect(backendOf('classica', 'terminal', ALL)).toBe('text')
    expect(backendOf('classica', 'desktop', DESKTOP)).toBe('text')
  })

  test('automática no terminal: pixels onde o terminal os desenha, blocos onde não', () => {
    expect(backendOf('auto', 'terminal', ALL)).toBe('image')
    expect(backendOf('auto', 'terminal', { ...ALL, pixels: 'no' })).toBe('raster')
  })

  test('enquanto não se sabe se o terminal desenha pixels, blocos', () => {
    expect(backendOf('auto', 'terminal', { ...ALL, pixels: 'unknown' })).toBe('raster')
  })

  test('blocos é blocos mesmo onde há pixels', () => {
    expect(backendOf('blocos', 'terminal', ALL)).toBe('raster')
  })

  test('numa versão do Claude Code sem os elementos novos, texto', () => {
    const old: Abilities = { hasImage: false, hasRaster: false, hasSvg: false, pixels: 'unknown' }
    expect(backendOf('auto', 'terminal', old)).toBe('text')
    expect(backendOf('blocos', 'terminal', old)).toBe('text')
    expect(backendOf('auto', 'terminal', { ...ALL, hasRaster: false, pixels: 'no' })).toBe('text')
  })

  test('fora do terminal, vetor onde a tela desenha SVG; senão, texto', () => {
    expect(backendOf('auto', 'desktop', DESKTOP)).toBe('svg')
    expect(backendOf('blocos', 'desktop', DESKTOP)).toBe('svg')
    expect(backendOf('auto', 'mobile', { ...DESKTOP, hasSvg: false })).toBe('text')
  })
})

describe('o tamanho do palco', () => {
  test('o dobro só quando foi pedido', () => {
    expect(zoomOf(false, 200, 30)).toBe(1)
    expect(zoomOf(true, 200, 30)).toBe(2)
  })

  test('e só quando o mundo ainda cabe na metade das colunas', () => {
    expect(zoomOf(true, 112, 30)).toBe(2) // 56 colunas de mundo: o mínimo
    expect(zoomOf(true, 111, 30)).toBe(1)
    expect(zoomOf(true, 100, 30)).toBe(1)
  })

  test('e quando a barra tem altura para oito linhas de palco, a régua, o cabeçalho e uma folga', () => {
    expect(zoomOf(true, 200, 11)).toBe(2)
    expect(zoomOf(true, 200, 10)).toBe(1)
  })
})

describe('o caminho entre dois quadros', () => {
  test('vai de 0, no instante do passo, a 1, um quadro depois', () => {
    expect(alphaOf(1_000, 1_000, 125)).toBe(0)
    expect(alphaOf(1_050, 1_000, 125)).toBe(0.4)
    expect(alphaOf(1_125, 1_000, 125)).toBe(1)
  })

  test('não passa de 1 nem volta de 0, e um número estragado vale o fim do caminho', () => {
    expect(alphaOf(9_000, 1_000, 125)).toBe(1)
    expect(alphaOf(900, 1_000, 125)).toBe(0)
    expect(alphaOf(Number.NaN, 1_000, 125)).toBe(1)
    expect(alphaOf(1_050, 1_000, 0)).toBe(1)
  })

  test('o palco é repintado perto de 25 vezes por segundo, um número inteiro de vezes por quadro', () => {
    expect(paintEvery(125)).toBe(42)
    expect(paintEvery(200)).toBe(40)
    expect(paintEvery(80)).toBe(40)
    expect(paintEvery(1_000)).toBe(40)
    expect(paintEvery(30)).toBe(30)
  })
})

describe('a recusa de um pedido de pintura', () => {
  test('só a que diz que a imagem não é desenhada ali fala do terminal', () => {
    expect(isPixelRefusal({ deny: 'the Image draws its alt here: the terminal draws neither kitty placeholder images (probe: no) nor iTerm2 inline images (probe: no)' })).toBe(true)
    expect(isPixelRefusal({ deny: 'tmux holds it back', fix: 'tmux-passthrough' })).toBe(true)
    expect(isPixelRefusal({ deny: 'the mounted Image is 80x4, not 100x4; a resize is a redraw (ui.invalidate)' })).toBe(false)
    expect(isPixelRefusal({})).toBe(false)
  })
})

describe('o caractere de uma célula de texto', () => {
  const kept = (text: string) => String.fromCodePoint(codeOf(text))

  test('letras, números, acentos e pontuação comum passam como são', () => {
    for (const ch of ['a', 'Z', '7', ' ', '·', 'é', 'ç', 'Ã', '+', '!', '…']) expect(kept(ch)).toBe(ch)
  })

  test('os traços do chão, os blocos e os sinais do palco passam', () => {
    for (const ch of ['─', '═', '╪', '▀', '▟', '▶', '✓', '✗', '✦']) expect(kept(ch)).toBe(ch)
  })

  test('a faísca de toda classe, em todo quadro do pulso, passa', () => {
    const sparks = [0, 1, 2, 3].flatMap(tier => Array.from({ length: 12 }, (_, frame) => sparkAt(tier as Tier, frame)))
    for (const ch of [...sparks, ...SPINNER]) expect(kept(ch)).toBe(ch)
  })

  test('o que o terminal recusaria numa célula vira "?": controle, acento solto, largura zero, largo, fora do plano básico', () => {
    for (const ch of ['\u0007', '\u0301', '\u00ad', '\u200b', '\ufe0f', '日', '✨', '😀', '\u2028']) expect(kept(ch)).toBe('?')
  })

  test('um nome de ferramenta com acento decomposto não derruba a barra: o acento solto vira "?"', () => {
    const fiery = still([worker(MAIN, 40, { busy: 1, tool: 'cafe\u0301' })])
    const cells = rasterCells(hdScene({ prev: fiery, cur: fiery, alpha: 0, geo, hud: [], trace: 'blocks' }), { isLight: false, accent: 'claude' })
    const row = cells.slice(0, geo.width).map(c => String.fromCodePoint(c.code)).join('')
    expect(row).toContain('cafe?')
    expect(cells.every(c => c.code !== 0x301)).toBe(true)
  })
})

describe('o palco em blocos', () => {
  const scene = (sim: Sim, accent: string, hud: Part[] = [{ text: '12s' }]) => hdScene({ prev: sim, cur: sim, alpha: 0, geo, hud, accent, trace: 'blocks' })
  const cells = (sim: Sim, accent = 'claude', hud?: Part[]) => rasterCells(scene(sim, accent, hud), { isLight: false, accent })
  const rowOf = (list: Cell[], row: number) => list.slice(row * geo.width, (row + 1) * geo.width)
  const textOf = (list: Cell[]) => list.map(c => String.fromCodePoint(c.code)).join('')

  test('uma célula por célula do palco, linha a linha', () => {
    expect(cells(thinking).length).toBe(geo.width * 4)
  })

  test('o mascote sai em blocos, na cor de destaque', () => {
    expect(cells(thinking).filter(c => c.fg === CLAUDE || c.bg === CLAUDE).length).toBeGreaterThan(10)
  })

  test('o placar fica no canto de cima à direita, como texto', () => {
    expect(textOf(rowOf(cells(thinking), 0)).endsWith('12s')).toBe(true)
  })

  test('quem pensa tem a faísca sobre a cabeça, na cor de destaque', () => {
    // a faísca é um dos sinais ✢✳✶✻✽ (ou o ponto do começo do pulso), sobre o meio do mascote
    const above = rowOf(cells(thinking), 0).filter(c => c.fg === CLAUDE && c.code !== 0x20)
    expect(above.length).toBe(1)
    expect('·✢✳✶✻✽').toContain(String.fromCodePoint(above[0]?.code ?? 0))
  })

  test('o chão é a linha de sempre: a pista à esquerda e a esteira à direita', () => {
    const floor = textOf(rowOf(cells(thinking), 3))
    expect(floor).toContain('─')
    expect(floor).toContain('═')
  })

  test('a cor de destaque dos ajustes pinta o mascote e a faísca dele', () => {
    const blue = cells(thinking, '#5FA8FF')
    expect(blue.some(c => c.fg === 0x5fa8ff || c.bg === 0x5fa8ff)).toBe(true)
    expect(blue.some(c => c.fg === CLAUDE || c.bg === CLAUDE)).toBe(false)
  })

  test('um texto sem cor fica na cor do terminal; apagado, esmaece; e o que não é um caractere simples vira ?', () => {
    // "日" ocupa duas colunas: o placar reserva as duas, e a letra vira um "?" na primeira
    const tail = rowOf(cells(thinking, 'claude', [{ text: 'a', dim: true }, { text: '日' }, { text: 'b' }]), 0).slice(-4)
    expect(textOf(tail)).toBe('a?b ')
    expect(tail[0]?.fg).not.toBe(DEFAULT_COLOR)
    expect(tail[2]?.fg).toBe(DEFAULT_COLOR)
  })

  test('um texto sobre o clarão fica com o clarão de fundo, não num buraco', () => {
    // um mascote com aura, e o placar posto bem em cima dele
    const fiery = still([worker(MAIN, geo.width * 2 - 30, { thinking: 1 })])
    const lit = rasterCells(hdScene({ prev: fiery, cur: fiery, alpha: 0, geo, hud: [{ text: 'XXXXXXXXXXXX' }], trace: 'blocks', powers: new Map([[MAIN, { tier: 3, level: 4 }]]) }), { isLight: false, accent: 'claude' })
    const letters = rowOf(lit, 0).filter(c => c.code === 'X'.codePointAt(0))
    expect(letters.length).toBe(12)
    expect(letters.some(c => c.bg !== DEFAULT_COLOR)).toBe(true)
  })

  test('empacotado para o terminal e lido de volta, é a mesma lista', () => {
    const list = cells(thinking)
    expect(unpackCells(packCells(list))).toEqual(list)
  })
})

describe('o palco em pixels e em vetor', () => {
  const fine = hdScene({ prev: thinking, cur: thinking, alpha: 0, geo, hud: [], trace: 'pixels' })

  test('a imagem é um PNG ampliado, em base64', () => {
    expect(stageImage(fine).startsWith('iVBORw0KGgo')).toBe(true) // a assinatura do PNG
    expect(IMAGE_SCALE).toBe(2)
    expect([fine.width, fine.height]).toEqual([geo.width * CELL_W, 4 * CELL_H])
  })

  test('a imagem de sondagem é um PNG mínimo', () => {
    expect(PROBE_PNG.startsWith('iVBORw0KGgo')).toBe(true)
    expect(PROBE_PNG.length).toBeLessThan(120)
  })

  test('o vetor é um documento SVG do tamanho do quadro, dentro do limite do elemento', () => {
    const svg = stageSvg(fine)
    expect(svg?.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fine.width} ${fine.height}"`)).toBe(true)
    expect((svg ?? '').length).toBeLessThan(131_072)
  })

  test('um documento que passaria do limite não sai: quem chama cai no texto', () => {
    const huge = { ...fine, shapes: Array.from({ length: 20_000 }, (_, i) => ({ x: i % 600, y: i % 60, w: 1, h: 1, rgb: (i * 7919) & 0xffffff, a: 1 })) }
    expect(stageSvg(huge)).toBeNull()
  })
})

describe('o palco no tamanho dobrado', () => {
  const small = geometry(60) as Geo // o mundo de uma barra de 120 colunas no tamanho dobrado
  const big = (trace: 'pixels' | 'blocks', hud: Part[] = [{ text: '12s' }]) => hdScene({ prev: thinking, cur: thinking, alpha: 0, geo: small, hud, trace, zoom: 2 })
  const normal = hdScene({ prev: thinking, cur: thinking, alpha: 0, geo: small, hud: [{ text: '12s' }], trace: 'blocks' })

  test('ocupa o dobro das colunas e das linhas do mundo dele', () => {
    const scene = big('blocks')
    expect([scene.columns, scene.rows]).toEqual([small.width * 2, 8])
    expect([scene.width, scene.height]).toEqual([small.width * 2 * CELL_W, 8 * CELL_H])
    expect([normal.columns, normal.rows]).toEqual([small.width, 4])
  })

  test('o mascote ocupa mais que o dobro das células (no tamanho de sempre, uma célula pela metade já conta)', () => {
    // a cor de destaque e os tons dela (no tamanho dobrado o topo do corpo clareia e a base escurece)
    const isWarm = (rgb: number) => rgb <= 0xffffff && (rgb >> 16) > 170 && ((rgb >> 8) & 0xff) > 80 && ((rgb >> 8) & 0xff) < 190 && (rgb & 0xff) < 140
    const painted = (scene: typeof normal) => rasterCells(scene, { isLight: false, accent: 'claude' }).filter(c => isWarm(c.fg) || isWarm(c.bg)).length
    expect(painted(big('blocks'))).toBeGreaterThan(painted(normal) * 2)
  })

  test('o placar segue encostado no canto, e o sinal de quem pensa fica na linha logo acima da cabeça', () => {
    const scene = big('blocks')
    const hud = scene.labels.find(l => l.parts.some(part => part.text === '12s'))
    expect([hud?.row, hud?.cell]).toEqual([0, small.width * 2 - 3])
    const spark = scene.labels.find(l => l.parts.some(part => part.color === 'claude'))
    expect(spark?.row).toBe(1)
    expect(spark?.cell).toBe((normal.labels.find(l => l.parts.some(part => part.color === 'claude'))?.cell ?? 0) * 2)
  })

  test('o chão vem desenhado em blocos, não em caracteres; as estrelas seguem como texto, cada uma na sua célula', () => {
    const scene = big('blocks')
    const cells = rasterCells(scene, { isLight: false, accent: 'claude' })
    const floorRow = cells.slice(7 * scene.columns, 8 * scene.columns)
    expect(floorRow.some(c => c.code === '─'.codePointAt(0) || c.code === '═'.codePointAt(0))).toBe(false)
    expect(floorRow.filter(c => c.code >= 0x2580 && c.code <= 0x259f).length).toBeGreaterThan(scene.columns / 2)
    const stars = Array.from({ length: scene.columns * 6 }, (_, i) => [i % scene.columns, Math.floor(i / scene.columns)] as const).filter(([cell, row]) => scene.under(cell, row) !== undefined)
    expect(stars.length).toBeGreaterThan(0)
    expect(stars.every(([cell, row]) => cell % 2 === 0 && row % 2 === 0)).toBe(true)
  })

  test('em pixels, a imagem e o vetor dobram junto', () => {
    const scene = big('pixels')
    expect(stageSvg(scene)?.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${small.width * 2 * CELL_W} ${8 * CELL_H}"`)).toBe(true)
    expect(stageImage(scene).startsWith('iVBORw0KGgo')).toBe(true)
    expect(scene.labels).toEqual([])
  })
})
