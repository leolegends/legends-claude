import { mix } from './color'

// As cores do palco: a de cada família de ferramenta (o tijolo dela) e a de cada ajudante.

/** A família de uma ferramenta: decide a cor do tijolo que ela vira. */
export type Kind = 'r' | 's' | 'e' | 'b' | 'w' | 'a' | 'm' | 'o'

/** Tons médios, que leem bem em tema claro e escuro. */
export const KIND_PAINT: Record<Kind, string> = {
  r: '#5FA8FF', // ler
  s: '#A78BFA', // buscar
  e: '#4EC98B', // editar e escrever
  b: '#F5B841', // shell
  w: '#22D3EE', // web
  a: '#F472B6', // agentes
  m: '#FB923C', // ferramentas MCP
  o: '#9CA3AF', // o resto
}

export const KINDS = Object.keys(KIND_PAINT) as Kind[]

/**
 * Um tijolo, como a cena o guarda: a letra da família dele. Em maiúscula, é o de uma chamada que
 * terminou em erro: um tijolo rachado, que segue na parede com a cor da família, apagada.
 */
export type Tile = string

const ASH = '#4B5563' // a cinza para onde a cor de um tijolo rachado esmaece: lê como apagado no tema claro e no escuro
const CRACK_FADE = 0.6

/** A tinta do tijolo rachado de cada família: uma cor chapada, para valer igual como bloco e como fundo de célula. */
export const CRACKED_PAINT = Object.fromEntries(KINDS.map(kind => [kind, mix(KIND_PAINT[kind], ASH, CRACK_FADE)])) as Record<Kind, string>

/** O tijolo rachado de uma família. */
export const cracked = (kind: Kind): Tile => kind.toUpperCase()
/** O tijolo é o de uma chamada que falhou. */
export const isCracked = (tile: Tile): boolean => tile !== tile.toLowerCase()
/** A família de um tijolo, rachado ou não; uma letra que não é de família nenhuma vale como "o resto". */
export const kindOfTile = (tile: Tile): Kind => {
  const kind = tile.toLowerCase()
  return KINDS.includes(kind as Kind) ? (kind as Kind) : 'o'
}
/** A tinta de um tijolo: a da família dele, ou a apagada dela se ele rachou. */
export const tilePaint = (tile: Tile): string => (isCracked(tile) ? CRACKED_PAINT : KIND_PAINT)[kindOfTile(tile)]

// A ordem importa: a primeira família que casa leva ("WebSearch" é web, não busca; "NotebookRead" é leitura).
const FAMILIES: readonly (readonly [Kind, RegExp])[] = [
  ['m', /^mcp__/i],
  ['o', /^todo/i],
  ['w', /^web/i],
  ['r', /read/i],
  ['e', /edit|write/i],
  ['b', /^bash|shell|^kill/i], // "Skill" tem "kill" no meio: só no começo do nome
  ['a', /agent|task|workflow|sendmessage/i],
  ['s', /grep|glob|search|^ls$/i],
]

/** A família de uma ferramenta pelo nome: "Read" → ler, "mcp__x__y" → MCP, desconhecida → o resto. */
export const kindOf = (tool: string): Kind => FAMILIES.find(([, pattern]) => pattern.test(tool))?.[0] ?? 'o'

// As ferramentas que são, elas mesmas, uma pergunta à pessoa: o turno fica parado até ela responder.
const QUESTIONS: readonly string[] = ['AskUserQuestion', 'ExitPlanMode']

/** A ferramenta é uma pergunta à pessoa (uma pergunta de fato, ou um plano que espera a aprovação dela). */
export const isQuestion = (tool: string): boolean => QUESTIONS.includes(tool)

// As cores dos ajudantes: do tema, para lerem bem no claro e no escuro. A linha do agente usa a mesma.
const TINTS = ['suggestion', 'warning', 'planMode', 'bashBorder', 'success', 'merged'] as const

/** Um número fixo para um texto (um id): o mesmo texto dá sempre o mesmo, e textos vizinhos dão números distantes. */
export const hashOf = (id: string) => [...id].reduce((n, ch) => (n * 31 + (ch.codePointAt(0) ?? 0)) >>> 0, 7)

/** A cor de um agente no palco e na lista: a mesma enquanto ele existir. */
export const tintOf = (id: string): string => TINTS[hashOf(id) % TINTS.length] ?? 'suggestion'
