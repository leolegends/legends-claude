import { describe, expect, test } from 'claude-code/testing'

import { box } from './canvas'
import { SVG_LIMIT, toSvg } from './vector'

const RED = 0xff0000
const BLUE = 0x0000ff

const paths = (svg: string) => [...svg.matchAll(/<path [^>]*\/>/g)].map(m => m[0])

describe('a cena em SVG', () => {
  test('um documento com o tamanho do quadro, de bordas nítidas', () => {
    const svg = toSvg([], 800, 64)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 64" width="800" height="64" shape-rendering="crispEdges">')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(paths(svg)).toEqual([])
  })

  test('um retângulo é um traçado fechado, na cor dele', () => {
    expect(paths(toSvg([box(1, 0, 2, 1, RED)], 4, 2))).toEqual(['<path fill="#ff0000" d="M1 0h2v1h-2z"/>'])
  })

  test('vizinhos na lista com a mesma tinta saem num traçado só', () => {
    expect(paths(toSvg([box(0, 0, 1, 1, RED), box(2, 0, 1, 1, RED)], 4, 2))).toEqual(['<path fill="#ff0000" d="M0 0h1v1h-1zM2 0h1v1h-1z"/>'])
  })

  test('a ordem da lista é a da pintura: tintas diferentes não se juntam por cima de outra', () => {
    const svg = toSvg([box(0, 0, 2, 1, RED), box(1, 0, 2, 1, BLUE), box(0, 1, 1, 1, RED)], 4, 2)
    expect(paths(svg).map(p => /fill="(#\w+)"/.exec(p)?.[1])).toEqual(['#ff0000', '#0000ff', '#ff0000'])
  })

  test('tinta translúcida leva a opacidade; a opaca não', () => {
    const [glow, body] = paths(toSvg([box(0, 0, 1, 1, RED, 0.5), box(1, 0, 1, 1, RED)], 4, 2))
    expect(glow).toBe('<path fill="#ff0000" fill-opacity="0.5" d="M0 0h1v1h-1z"/>')
    expect(body).toBe('<path fill="#ff0000" d="M1 0h1v1h-1z"/>')
  })

  test('as posições arredondam e o que passa da borda é cortado, como no quadro de pixels', () => {
    expect(paths(toSvg([box(-3, -3, 5, 5, RED), box(1.5, 0, 1.5, 1, BLUE)], 4, 2))).toEqual([
      '<path fill="#ff0000" d="M0 0h2v2h-2z"/>',
      '<path fill="#0000ff" d="M2 0h1v1h-1z"/>',
    ])
  })

  test('o que não tem área, opacidade ou número de verdade não entra', () => {
    expect(paths(toSvg([box(0, 0, 0, 1, RED), box(0, 0, 1, 1, RED, 0), box(Number.NaN, 0, 1, 1, RED), box(9, 9, 1, 1, RED)], 4, 2))).toEqual([])
  })

  test('uma cor escura sai com os seis dígitos', () => {
    expect(paths(toSvg([box(0, 0, 1, 1, 0x00000a)], 1, 1))[0]).toContain('fill="#00000a"')
  })

  test('o limite do elemento Svg é o da documentação', () => {
    expect(SVG_LIMIT).toBe(131_072)
  })
})
