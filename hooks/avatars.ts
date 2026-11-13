import { CLAWD, FINE_X } from './sprites'
import type { Art, Detail, Patch } from './sprites'
import type { StatusAvatar as Avatar } from '../types'

// Os avatares do mascote: quem ele é no palco. O de sempre é o Clawd, de uma cor só (a de destaque dos
// ajustes). Os outros são coloridos: cada marca do desenho é uma tinta da paleta dele. Todos têm a
// mesma largura e a mesma cabeça do Clawd, então a simulação (onde ele para, quanto carrega) não muda.
//
// Cada avatar colorido tem dois desenhos. O comum, em subpixels, é o que o palco de texto e o de blocos
// mostram, e é a silhueta de onde a aura sai. O fino (`detail`), com `FINE_X`×`FINE_Y` pontos por
// subpixel, é o que aparece onde há detalhe: em pixels, em vetor e em blocos no tamanho grande.
//
// O poder também é de cada um. A aura de um avatar colorido tem as tintas do elemento dele (`element`),
// não as da classe do modelo: raio, estrela, fogo. E com a aura forte ele se transforma (`form`): outro
// desenho, com a mesma largura e a mesma cabeça, declarado antes do desenho de base que aponta para ele.

const WIDTH = CLAWD.width
const FINE_WIDTH = WIDTH * FINE_X
const BODY_LEFT = 8 // onde o corpo do desenho fino começa, em pontos: ele ocupa os 20 do meio
const REACH_LEFT = 4 // e onde começa um remendo que passa do corpo (os braços para cima)

// Linhas de um desenho fino postas a partir de `left`, completadas com vazio até a largura dele.
const framed = (rows: readonly string[], left: number, fill = '.'): string[] =>
  rows.map(row => `${fill.repeat(left)}${row}${fill.repeat(Math.max(0, FINE_WIDTH - left - row.length))}`)

const patch = (at: number, rows: readonly string[], left = BODY_LEFT): Patch => ({ at, rows: framed(rows, left) })

// As pernas do outro passo: o pé esquerdo sobe uma linha. `foot` é a marca dele.
const strideOf = (foot: string, thigh = foot): Patch =>
  patch(17, [`...${thigh}${foot.repeat(4)}`, `..${foot.repeat(6)}`, '..______'])

const INK = '#26262B' // as pupilas: escuras nos dois temas, sobre a pele ou o pelo
const WHITE = '#FFFFFF'

// ── O rato elétrico amarelo ───────────────────────────────────────────────────────────────────────

const PIKACHU_DETAIL: Detail = {
  frame: framed([
    '.KK..............KK.',
    '.KKK............KKK.',
    '..YYY..........YYY.....YYYYY',
    '..YYYY........YYYY....YYYYYY',
    '...YYYYYYYYYYYYYY....YYYYYY.',
    '..YYYYYYYYYYYYYYYY...YYYYY..',
    '.YYYYYYYYYYYYYYYYYY....YYY..',
    '.YYYWeYYYYYYYYWeYYY...YYY...',
    '.YYYeeYYYKKYYYeeYYY..YYY....',
    '.RRRYYYYYYYYYYYYRRR..YYYYY..',
    '.RRRYYYYKYYKYYYYRRR....YYY..',
    '..YYYYYYYKKYYYYYYY....BY....',
    '...YYYYYYYYYYYYYY....BB.....',
    '.YYYYYYYYYYYYYYYYYYBBB......',
    '.YY.YYYYYYYYYYYY.YY.',
    '....YYYYYYYYYYYY....',
    '....YYYYYYYYYYYY....',
    '....YYYYY..YYYYY....',
    '...YYYYY....YYYYY...',
    '..YYYYYY....YYYYYY..',
  ], BODY_LEFT),
  eyes: {
    closed: patch(7, ['....YY........YY....']),
    left: patch(7, ['...WeY.......WeY....', '...eeY.......eeY....']),
    right: patch(7, ['....YWe.......YWe...', '....Yee.......Yee...']),
  },
  raised: patch(10, [
    '..YY....................YY..',
    '..YYY..................YYY..',
    '...YYY................YYY...',
    '.....___............___.....',
    '.....__..............__.....',
  ], REACH_LEFT),
  stride: patch(17, ['...Y', '..Y', '..______']),
}

// Com poder, evolui: laranja, de barriga branca, bochechas amarelas, orelhas e patas marrons, e o rabo
// comprido e fino que termina num raio.
const RAICHU_DETAIL: Detail = {
  frame: framed([
    'NNNN....................NNNN',
    'NNYYN..................NYYNN',
    '.NNYYNN..............NNYYNN',
    '...NNNNN............NNNNN',
    '.....NNOOOOOOOOOOOOOONN',
    '......OOOOOOOOOOOOOOOO',
    '.....OOOOOOOOOOOOOOOOOO.....YYYY',
    '.....OOOWeOOOOOOOOWeOOO....YYYYY',
    '.....OOOeeOOOKKOOOeeOOO...YYYYY.',
    '.....YYYOOOOOOOOOOOOYYY.....YYYY',
    '.....YYYOOOOKOOKOOOOYYY....YYY..',
    '......OOOOOOOKKOOOOOOO....YY',
    '.......OOOOOOOOOOOOOO.....K',
    '.....OOOOOOWWWWWWOOOOOO..K',
    '.....NN.OOOWWWWWWOOO.NN.K',
    '........OOOWWWWWWOOOKKKK',
    '........OOOOWWWWOOOO',
    '........OOOOO..OOOOO',
    '.......OOOOO....OOOOO',
    '......NNNNNN....NNNNNN',
  ], REACH_LEFT),
  eyes: {
    closed: patch(7, ['....OO........OO....']),
    left: patch(7, ['...WeO.......WeO....', '...eeO.......eeO....']),
    right: patch(7, ['....OWe.......OWe...', '....Oee.......Oee...']),
  },
  raised: patch(10, [
    '..NN....................NN..',
    '..OOO..................OOO..',
    '...OOO................OOO...',
    '.....___............___.....',
    '.....__..............__.....',
  ], REACH_LEFT),
  stride: patch(17, ['...O', '..NNNNNN', '..______']),
}

const RAICHU: Art = {
  ...CLAWD,
  top: '...NNY......YNN...',
  eyes: {
    open: '....OOeOOOOeOO..YY',
    closed: '....OOOOOOOOOO..YY',
    left: '....OeOOOOeOOO..YY',
    right: '....OOOeOOOOeO..YY',
  },
  arms: '...NYOOOOOOOOYNYY.',
  body: '....OOOWWWWOOOK...',
  legs: ['....NNN....NNN....', '.....NNN..NNN.....'],
  hands: [3, 14],
  hand: 'N',
  pupil: 'e',
  paints: { O: '#F39A2B', N: '#7A4A21', Y: '#FFD93B', W: WHITE, K: '#4A3423', e: INK },
  detail: RAICHU_DETAIL,
  element: 'volt',
}

const PIKACHU: Art = {
  ...CLAWD,
  top: '....KY......YK.YYY',
  eyes: {
    open: '....YYeYYYYeYY.YY.',
    closed: '....YYYYYYYYYY.YY.',
    left: '....YeYYYYeYYY.YY.',
    right: '....YYYeYYYYeY.YY.',
  },
  arms: '...YRYYYYYYYYRYB..',
  body: '....YYYYYYYYYY....',
  legs: ['....YYY....YYY....', '.....YYY..YYY.....'],
  hands: [3, 14],
  hand: 'Y',
  pupil: 'e',
  paints: { Y: '#F7D02C', K: '#62626E', R: '#E8433A', W: WHITE, B: '#9C6A2C', e: INK },
  detail: PIKACHU_DETAIL,
  element: 'volt',
  form: RAICHU,
}

// ── O encanador de boné vermelho ──────────────────────────────────────────────────────────────────

const MARIO_DETAIL: Detail = {
  frame: framed([
    '....RRRRRRRRRRRR....',
    '...RRRRRRRRRRRRRR...',
    '..RRRRRRRWWRRRRRRR..',
    '.RRRRRRRRRRRRRRRRRR.',
    '..HHSSSSSSSSSSSSHH..',
    '..HSSSeeSSSSeeSSSH..',
    '.SHSSSeeSSSSeeSSSHS.',
    '.SSSSSSSPPPPSSSSSSS.',
    '..SSSHHHHPPHHHHSSS..',
    '..SSHHHHHHHHHHHHSS..',
    '...SSSSSSSSSSSSSS...',
    '..RRRROORRRROORRRR..',
    '.RRRRROYOOOOYORRRRR.',
    '.RRR.OOOOOOOOOO.RRR.',
    '.WWW.OOOOOOOOOO.WWW.',
    '.WWW.OOOOOOOOOO.WWW.',
    '....OOOOO..OOOOO....',
    '....OOOO....OOOO....',
    '...NNNNN....NNNNN...',
    '..NNNNNN....NNNNNN..',
  ], BODY_LEFT),
  eyes: {
    closed: patch(5, ['......SS....SS......']),
    left: patch(5, ['.....eeS...eeS......', '.....eeS...eeS......']),
    right: patch(5, ['......See...See.....', '......See...See.....']),
  },
  raised: patch(4, [
    '.WWW....................WWW.',
    '.WWW....................WWW.',
    '.WWW....................WWW.',
    '.RRR....................RRR.',
    '.RRR....................RRR.',
    '.RRRR..................RRRR.',
    '..RRRR................RRRR..',
    '...RRR................RRR...',
    '',
    '.....___............___.....',
    '.....___............___.....',
    '.....___............___.....',
  ], REACH_LEFT),
  stride: strideOf('N'),
}

// Com poder, é o Super Mario: o mesmo encanador, de capa amarela, que abre dos ombros até os pés.
const SUPER_MARIO_DETAIL: Detail = {
  frame: framed([
    '........RRRRRRRRRRRR',
    '.......RRRRRRRRRRRRRR',
    '......RRRRRRRWWRRRRRRR',
    '.....RRRRRRRRRRRRRRRRRR',
    '......HHSSSSSSSSSSSSHH',
    '......HSSSeeSSSSeeSSSH',
    '.....SHSSSeeSSSSeeSSSHS',
    '.....SSSSSSSPPPPSSSSSSS',
    '......SSSHHHHPPHHHHSSS',
    '......SSHHHHHHHHHHHHSS',
    '....CC.SSSSSSSSSSSSSS.CC',
    '...CCCRRRROORRRROORRRRCCC',
    '...CCRRRRROYOOOOYORRRRRCC',
    '..CCGRRRGOOOOOOOOOOGRRRGCC',
    '..CCGWWWGOOOOOOOOOOGWWWGCC',
    '.CCGGWWWGOOOOOOOOOOGWWWGGCC',
    '.CCGGGGGOOOOO..OOOOOGGGGGCC',
    'CCGGGGGGOOOO....OOOOGGGGGGCC',
    'CCGGGGGNNNNN....NNNNNGGGGGCC',
    'C.C.G.NNNNNN....NNNNNN.G.C.C',
  ], REACH_LEFT),
  eyes: {
    closed: patch(5, ['......SS....SS......']),
    left: patch(5, ['.....eeS...eeS......', '.....eeS...eeS......']),
    right: patch(5, ['......See...See.....', '......See...See.....']),
  },
  raised: patch(4, [
    '.WWW....................WWW.',
    '.WWW....................WWW.',
    '.WWW....................WWW.',
    '.RRR....................RRR.',
    '.RRR....................RRR.',
    '.RRRR..................RRRR.',
    '..RRRR................RRRR..',
    '...RRR................RRR...',
    '',
    '.....GGG............GGG.....',
    '.....GGG............GGG.....',
    '.....GGG............GGG.....',
  ], REACH_LEFT),
  stride: strideOf('N'),
}

const SUPER_MARIO: Art = {
  ...CLAWD,
  top: '....RRRRRRRRRR....',
  eyes: {
    open: '....HSeSSSSeSH....',
    closed: '....HSSSSSSSSH....',
    left: '....HeSSSSeSSH....',
    right: '....HSSeSSSSeH....',
  },
  arms: '.CWRRSHHHHHHSRRWC.',
  body: '.CCGOOYOOOOYOOGCC.',
  legs: ['.CCGNNN....NNNGCC.', '.CCG.NNN..NNN.GCC.'],
  hands: [2, 15],
  hand: 'W',
  pupil: 'e',
  paints: { R: '#E52521', S: '#FFC89E', P: '#F0A070', H: '#7A4520', O: '#2F54E0', Y: '#FFD21E', W: WHITE, N: '#8A5524', C: '#FFD234', G: '#E0A418', e: INK },
  detail: SUPER_MARIO_DETAIL,
  element: 'star',
}

const MARIO: Art = {
  ...CLAWD,
  top: '....RRRRRRRRRR....',
  eyes: {
    open: '....HSeSSSSeSH....',
    closed: '....HSSSSSSSSH....',
    left: '....HeSSSSeSSH....',
    right: '....HSSeSSSSeH....',
  },
  arms: '..WRRSHHHHHHSRRW..',
  body: '....OOYOOOOYOO....',
  legs: ['....NNN....NNN....', '.....NNN..NNN.....'],
  hands: [2, 15],
  hand: 'W',
  pupil: 'e',
  paints: { R: '#E52521', S: '#FFC89E', P: '#F0A070', H: '#7A4520', O: '#2F54E0', Y: '#FFD21E', W: WHITE, N: '#8A5524', e: INK },
  detail: MARIO_DETAIL,
  element: 'star',
  form: SUPER_MARIO,
}

// ── O espartano de pele de cinza ──────────────────────────────────────────────────────────────────

const KRATOS_DETAIL: Detail = {
  frame: framed([
    '....AAAAAAAAARRA....',
    '...AAAAAAAAAARRAA...',
    '..AAAAAAAAAAARRAAA..',
    '..AAAAAAAAAAARRAAA..',
    '..AAKKKKAAAAKKKKAA..',
    '..AAAeeAAAAAReeRAA..',
    '..AAAAAAAAAAARRAAA..',
    '..AKKAAAAAAAARRKKA..',
    '..KKKKKKAAAAKKKKKK..',
    '...KKKKKKKKKKKKKK...',
    '....KKKKKKKKKKKK....',
    '..GGGAAAAAAAARRRAA..',
    '.GGGGAAAAAAAARRRRAA.',
    '.AAA.AAAAAAAAAR.AAA.',
    '.LLL.GGGGGGGGGG.LLL.',
    '.AAA.LLLLLLLLLL.AAA.',
    '....LLLLL..LLLLL....',
    '....AAAA....AAAA....',
    '...LLLLL....LLLLL...',
    '..LLLLLL....LLLLLL..',
  ], BODY_LEFT),
  eyes: {
    closed: patch(5, ['.....aa......aa.....']),
    left: patch(5, ['....eeA.....eeR.....']),
    right: patch(5, ['.....Aee.....Ree....']),
  },
  raised: patch(4, [
    '.AAA....................AAA.',
    '.AAA....................AAA.',
    '.LLL....................LLL.',
    '.LLL....................LLL.',
    '.AAA....................AAA.',
    '.AAAA..................AAAA.',
    '..AAAA................AAAA..',
    '...AAA................AAA...',
    '',
    '.....___............___.....',
    '.....___............___.....',
    '.....___............___.....',
  ], REACH_LEFT),
  stride: strideOf('L'),
}

// Com poder, entra em fúria: a faixa e os olhos acendem, a pele pega o calor do fogo e os punhos ardem.
const RAGE_DETAIL: Detail = {
  frame: framed([
    '....AAAAAAAAARRA....',
    '...AAAAAAAAAARRAA...',
    '..AAAAAAAAAAARRAAA..',
    '..AAAAAAAAAAARRAAA..',
    '..AAKKKKAAAAKKKKAA..',
    '..AAAeeAAAAAReeRAA..',
    '..AAAAAAAAAAARRAAA..',
    '..AKKAAAAAAAARRKKA..',
    '..KKKKKKAAAAKKKKKK..',
    '...KKKKKKKKKKKKKK...',
    '....KKKKKKKKKKKK....',
    '..GGGAAAAAAAARRRAA..',
    '.GGGGAAAAAAAARRRRAA.',
    '.AAA.AAAAAAAAAR.AAA.',
    '.LLL.GGGGGGGGGG.LLL.',
    '.FYF.LLLLLLLLLL.FYF.',
    '....LLLLL..LLLLL....',
    '....AAAA....AAAA....',
    '...LLLLL....LLLLL...',
    '..LLLLLL....LLLLLL..',
  ], BODY_LEFT),
  eyes: {
    closed: patch(5, ['.....aa......aa.....']),
    left: patch(5, ['....eeA.....eeR.....']),
    right: patch(5, ['.....Aee.....Ree....']),
  },
  raised: patch(4, [
    '.FYF....................FYF.',
    '.FYF....................FYF.',
    '.LLL....................LLL.',
    '.LLL....................LLL.',
    '.AAA....................AAA.',
    '.AAAA..................AAAA.',
    '..AAAA................AAAA..',
    '...AAA................AAA...',
    '',
    '.....___............___.....',
    '.....___............___.....',
    '.....___............___.....',
  ], REACH_LEFT),
  stride: strideOf('L'),
}

const RAGE: Art = {
  ...CLAWD,
  top: '....AAAAAAARAA....',
  eyes: {
    open: '....AAeAAAAeRA....',
    closed: '....AAAAAAAARA....',
    left: '....AeAAAAeARA....',
    right: '....AAAeAAAAeA....',
  },
  arms: '..FAAKKKKKKKKAAF..',
  body: '....AAAAAAARRA....',
  legs: ['....LLL....LLL....', '.....LLL..LLL.....'],
  hands: [2, 15],
  hand: 'F',
  pupil: 'e',
  paints: { A: '#F4E2D0', a: '#C9B8A6', R: '#FF5A1F', K: '#5A4636', G: '#E6B92E', L: '#7A5632', F: '#FF8A1F', Y: '#FFD25A', e: '#FFE9A8' },
  detail: RAGE_DETAIL,
  element: 'fire',
}

const KRATOS: Art = {
  ...CLAWD,
  top: '....AAAAAAARAA....',
  eyes: {
    open: '....AAeAAAAeRA....',
    closed: '....AAAAAAAARA....',
    left: '....AeAAAAeARA....',
    right: '....AAAeAAAAeA....',
  },
  arms: '..LAAKKKKKKKKAAL..',
  body: '....AAAAAAARRA....',
  legs: ['....LLL....LLL....', '.....LLL..LLL.....'],
  hands: [2, 15],
  hand: 'A',
  pupil: 'e',
  paints: { A: '#E9E3DA', a: '#B9B0A3', R: '#B3261E', K: '#5A4636', G: '#C9A227', L: '#7A5632', e: INK },
  detail: KRATOS_DETAIL,
  element: 'fire',
  form: RAGE,
}

/** O desenho de cada avatar do mascote. */
export const AVATAR_ART: Record<Avatar, Art> = { clawd: CLAWD, pikachu: PIKACHU, mario: MARIO, kratos: KRATOS }

/** O desenho do mascote para um avatar; o Clawd para o que não se conhece. */
export const artOf = (avatar: Avatar | undefined): Art => (avatar ? (AVATAR_ART[avatar] ?? CLAWD) : CLAWD)
