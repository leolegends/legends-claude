import { REACH_LEFT, WHITE, framed, patch } from './avatar-kit'
import { CLAWD } from './sprites'
import type { Art, Detail, Patch } from './sprites'

// ── A rainha do gelo ──────────────────────────────────────────────────────────────────────────────
//
// Em homenagem à minha filha.
//
// De vestido azul de gelo, capa transparente e a trança loira sobre o ombro. O vestido vai até o chão:
// no lugar das pernas, a barra dele e as pontas da capa, que balançam de um passo para o outro.
//
// O desenho fino também é o que o palco de blocos mostra no tamanho grande, onde cada célula (dois
// pontos de largura, quatro de altura) só comporta duas tintas, separadas por uma borda reta, e cada
// região fica com a tinta do desenho mais próxima da média dela (`settled`, em blocks.ts). Os olhos
// são feitos para isso. Cada um ocupa uma célula: a sombra da pálpebra na primeira linha, o azul nas
// duas do meio e a pupila, que acende de Opus para cima, só na última, uma faixa que um bloco desenha
// exata. Fechado, sobra o risco azul da última linha. De lado, o olho se divide entre duas células, e
// ali uma luz clara junto do azul daria a vez à pele ou ao lilás: por isso de lado o olho é todo azul,
// sem pupila, e não acende.

const SKIN = '#FFE0D0'
const NECK = '#F0C4B0' // a sombra do queixo sobre o colo
const HAIR = '#F7E8B0'
const BRAID = '#DDC27E' // a sombra do cabelo: os gomos da trança, a risca da franja, os fios soltos
const LIPS = '#E2557F'
const LIDS = '#B58BE0' // a sombra lilás das pálpebras
const IRIS = '#2C56B0' // a íris (`i`) e a pupila (`e`): a mesma tinta, até a pupila acender
const VEIL = '#BFECFA' // as mangas e a capa

// Os olhos são os mesmos nos dois desenhos: fechados (fica o risco de baixo, do azul da íris), e
// olhando para um lado e para o outro (a sombra da pálpebra vai junto).
const EYES: Detail['eyes'] = {
  closed: patch(5, ['..........SS....SS..........', '..........SS....SS..........', '..........ii....ii..........'], REACH_LEFT),
  left: patch(4, ['.........VVS...VVS..........', ...Array.from({ length: 3 }, () => '.........iiS...iiS..........')], REACH_LEFT),
  right: patch(4, ['..........SVV...SVV.........', ...Array.from({ length: 3 }, () => '..........Sii...Sii.........')], REACH_LEFT),
}

const BARE = ['___', '___', '___', '___'] as const // o que os braços abaixados deixam ao subir: nada

// Os braços para cima: as mangas (`sleeve`) sobem pelos lados da cabeça, com as mãos na ponta, e os
// braços abaixados saem do desenho. `behind` é o que aparece onde eles estavam, linha a linha, do lado
// esquerdo (o direito é o espelho dele).
const raisedOf = (sleeve: string, behind: readonly string[] = BARE): Patch => {
  const arm = sleeve.repeat(3)
  return patch(4, [
    '.SSS....................SSS.',
    '.SSS....................SSS.',
    ...Array.from({ length: 3 }, () => `.${arm}....................${arm}.`),
    `.${arm}${sleeve}..................${sleeve}${arm}.`,
    `..${arm}${sleeve}................${sleeve}${arm}..`,
    `...${arm}................${arm}...`,
    ...behind.map(left => `.....${left}............${[...left].reverse().join('')}.....`),
  ], REACH_LEFT)
}

const ELSA_DETAIL: Detail = {
  frame: framed([
    '..........HHHHHHHH..........',
    '........HHHHHHHHHHHH........',
    '.......HHHHhHHHHHHHHH.......',
    '......HHHHhHHHHHHHHHHH......',
    '......HHHhVVSSSSVVSHHH......',
    '......HHSSiiSSSSiiSSHH......',
    '......HSSSiiSSSSiiSSSH......',
    '......HSSSeeSSSSeeSSSH......',
    '......HSSSSSSSSSSSSSSHH.....',
    '.......SSSSSSPPSSSSSHHH.....',
    '........SSSSSSSSSSShHh......',
    '......LLSnnSSSSnnSHhHL......',
    '.....LLL.BBBBSSBBhHhLLL.....',
    '.....LLL.BBBBBBBBHh.LLL.....',
    '.....SSS.BBBBBBBBhB.SSS.....',
    '.....SSSDDDDdDDDDDDDSSS.....',
    '....LLLDDDDdDDDDDDDdDLLL....',
    '...LWLLDDDdDDDDDDDdDDLLLL...',
    '..LLLLDDDdDDDDDDDDdDDDLLWL..',
    '.LLLLLDDdDDDDDDDDDdDDDLLLLL.',
  ], REACH_LEFT),
  eyes: EYES,
  raised: raisedOf('L'),
  // a barra do vestido e as pontas da capa vão para o lado
  stride: patch(18, ['.LLLLDDDdDDDDDDDDdDDDLLWL_..', 'LLLLLDDdDDDDDDDDDdDDDLLLLL_.'], REACH_LEFT),
}

// Com poder, é o quinto espírito: o cabelo solto pelos ombros, o vestido branco de mangas lilases e
// losangos de gelo, a barra dele lilás junto da capa.
const SPIRIT_DETAIL: Detail = {
  frame: framed([
    '.........HHHHHHHHHH.........',
    '.......HHHHHHHHHHHHHH.......',
    '......HHHHHhHHHHHHHHHH......',
    '.....HHHHHhHHHHHHHHHHHH.....',
    '.....HHHHhVVSSSSVVSHHHH.....',
    '....HHHHSSiiSSSSiiSSHHHH....',
    '....HHHSSSiiSSSSiiSSSHHH....',
    '....HHHSSSeeSSSSeeSSSHHH....',
    '...HHHHSSSSSSSSSSSSSSHHHH...',
    '..HHhHHSSSSSSPPSSSSSSHHhHH..',
    '..HHhHHhSSSSSSSSSSSShHHhHH..',
    '..HHhHIISnnSSSSSSnnSIIHhHH..',
    '..HHhIIINNNNNSSNNNNNIIIhHH..',
    '..HHhIIINNNNNNNNNNNNIIIhHH..',
    '...HhSSSNNNNGNNGNNNNSSShH...',
    '....hSSSNNNNNNNNNNNNSSSh....',
    '....LLLNNNNNNNNNNNNNNLLL....',
    '...LWLLNNNNGNNNNNGNNNLLLL...',
    '..LLLLIINNNNNNNNNNNNIILLWL..',
    '.LLLLLIIIINNNNNNNNIIIILLLLL.',
  ], REACH_LEFT),
  eyes: EYES,
  raised: raisedOf('I', ['HHH', 'HHH', 'H__', '___']), // com o cabelo solto, é ele que aparece atrás
  stride: patch(18, ['.LLLLIINNNNNNNNNNNNIILLWL_..', 'LLLLLIIIINNNNNNNNIIIILLLLL_.'], REACH_LEFT),
}

const SPIRIT: Art = {
  ...CLAWD,
  top: '...HHHHHHHHHHHH...',
  eyes: {
    open: '...HHSeSSSSeSHH...',
    closed: '...HHSSSSSSSSHH...',
    left: '...HHeSSSSeSSHH...',
    right: '...HHSSeSSSSeHH...',
  },
  arms: '..HHIISSSSSSIIHH..',
  body: '..HHSSNNNNNNSSHH..',
  legs: ['..LLNNNNNNNNNNLL..', '.LLNNNNNNNNNNLL...'],
  hands: [1, 16],
  hand: 'I',
  pupil: 'e',
  paints: { H: HAIR, h: BRAID, S: SKIN, n: NECK, P: LIPS, V: LIDS, i: IRIS, e: IRIS, N: '#EEF5FF', I: '#C9BCFA', G: '#7FE3F5', L: VEIL, W: WHITE },
  detail: SPIRIT_DETAIL,
  element: 'frost',
}

/** A Elsa: o desenho de base e, com a aura forte, o quinto espírito. */
export const ELSA: Art = {
  ...CLAWD,
  top: '....HHHHHHHHHH....',
  eyes: {
    open: '....HSeSSSSeSH....',
    closed: '....HSSSSSSSSH....',
    left: '....HeSSSSeSSH....',
    right: '....HSSeSSSSeH....',
  },
  arms: '..LLSSSSSSSSHHLL..',
  body: '..SSBBBBBBBBHBSS..',
  legs: ['..LLDDDDDDDDDDLL..', '.LLDDDDDDDDDDLL...'],
  hands: [2, 15],
  hand: 'L',
  pupil: 'e',
  paints: { H: HAIR, h: BRAID, S: SKIN, n: NECK, P: LIPS, V: LIDS, i: IRIS, e: IRIS, B: '#2E9FD3', D: '#5AC8EC', d: '#A6E5F8', L: VEIL, W: WHITE },
  detail: ELSA_DETAIL,
  element: 'frost',
  form: SPIRIT,
}
