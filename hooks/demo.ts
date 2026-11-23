import { kindOf } from './palette'
import { power } from './power'
import type { Power } from './power'
import { DEMO_PREFIX, MAIN, begin, enqueue, finish, retire, settle, shift, summon, think } from './sim'
import type { Sim } from './sim'
import type { Cue as Sound } from './sound'

// A demonstração: um turno de mentira, com hora marcada para cada coisa, para ver o palco sem gastar
// um turno de verdade. Usa as mesmas funções que os eventos reais usam.

const ANA = `${DEMO_PREFIX}1`
const BIA = `${DEMO_PREFIX}2`

/** O poder de cada ajudante da demonstração: um Sonnet em `high` e um Haiku em `max`, para as classes aparecerem. */
export const DEMO_CAST: readonly (readonly [string, Power])[] = [
  [ANA, power(1, 2)],
  [BIA, power(0, 4)],
]

type Cue = readonly [at: number, run: (sim: Sim) => Sim]

// O fim do roteiro: a última leva entregue e o mascote de volta em casa (numa barra larga, onde a
// pista é mais comprida, ele chega por último), a resposta sendo escrita, e a festa.
const WRITE_AT = 212
const END_AT = 238

const tools = (who: string, ...names: string[]) => (sim: Sim) => names.reduce((s, name) => enqueue(s, who, kindOf(name), name), sim)
const done = (who: string, count = 1) => (sim: Sim) => Array.from({ length: count }).reduce<Sim>(s => settle(s, who), sim)
const thinking = (who: string, isOn: boolean) => (sim: Sim) => think(sim, who, isOn)
// As fases de um pedido em curso: monta a chamada de uma ferramenta, escreve a resposta.
const drafting = (who: string, tool: string) => (sim: Sim) => shift(sim, who, 'draft', tool)
const writing = (who: string) => (sim: Sim) => shift(sim, who, 'write')

// O roteiro: entra pensando e monta a primeira chamada, lê e busca, pensa de novo, uma rajada com um
// shell demorado, chama dois ajudantes, todos trabalham, os ajudantes terminam, uma última leva, o
// mascote volta para casa, escreve a resposta, e o fim com confete.
const SCRIPT: readonly Cue[] = [
  [0, begin],
  [0, thinking(MAIN, true)],
  [20, drafting(MAIN, 'Read')],
  [26, thinking(MAIN, false)],
  [26, tools(MAIN, 'Read', 'Read', 'Grep')],
  [28, done(MAIN, 3)],
  [28, thinking(MAIN, true)],
  [60, thinking(MAIN, false)],
  [60, tools(MAIN, 'Read', 'Edit', 'Bash', 'Read', 'Write', 'Glob', 'WebFetch', 'Edit')],
  [62, done(MAIN, 7)], // o Bash segue rodando
  [88, done(MAIN)],
  [88, tools(MAIN, 'Agent')],
  [90, sim => summon(sim, ANA)],
  [96, tools(ANA, 'Grep', 'Read', 'Read')],
  [98, done(ANA, 3)],
  [100, tools(MAIN, 'Agent')],
  [102, sim => summon(sim, BIA)],
  [108, tools(BIA, 'Read', 'Edit')],
  [110, done(BIA, 2)],
  [116, tools(ANA, 'Bash')],
  [122, tools(BIA, 'Write', 'Edit', 'Read')],
  [124, done(BIA, 3)],
  [130, done(ANA)],
  [130, tools(ANA, 'Read', 'Read')],
  [132, done(ANA, 2)],
  [150, sim => retire(sim, ANA, true)],
  [152, done(MAIN, 2)],
  [152, tools(MAIN, 'Read', 'Edit', 'mcp__docs__search', 'Bash')],
  [154, done(MAIN, 4)],
  [160, sim => retire(sim, BIA, true)],
  [162, thinking(MAIN, true)],
  [WRITE_AT, writing(MAIN)],
  [END_AT, thinking(MAIN, false)],
  [END_AT, finish],
]

/** Os sons da demonstração, com o quadro de cada um: os ajudantes que nascem e a fanfarra do fim. */
export const DEMO_SOUNDS: readonly (readonly [at: number, sound: Sound])[] = [[90, 'spawn'], [102, 'spawn'], [END_AT, 'party']]

/** Quadros que a demonstração dura, da entrada do mascote ao fim do confete. */
export const DEMO_FRAMES = END_AT + 22

/** Puro: a cena depois do que o roteiro marca para o quadro `frame`. */
export const applyDemo = (sim: Sim, frame: number): Sim => SCRIPT.filter(([at]) => at === frame).reduce((s, [, run]) => run(s), sim)
