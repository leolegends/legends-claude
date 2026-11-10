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

// As cores dos ajudantes: do tema, para lerem bem no claro e no escuro. A linha do agente usa a mesma.
const TINTS = ['suggestion', 'warning', 'planMode', 'bashBorder', 'success', 'merged'] as const

const hash = (id: string) => [...id].reduce((n, ch) => (n * 31 + (ch.codePointAt(0) ?? 0)) >>> 0, 7)

/** A cor de um agente no palco e na lista: a mesma enquanto ele existir. */
export const tintOf = (id: string): string => TINTS[hash(id) % TINTS.length] ?? 'suggestion'
