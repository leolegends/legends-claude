import { kindOf } from './palette'
import { DEMO_PREFIX, MAIN, begin, enqueue, finish, retire, settle, summon, think } from './sim'
import type { Sim } from './sim'

// A demonstração: um turno de mentira, com hora marcada para cada coisa, para ver o palco sem gastar
// um turno de verdade. Usa as mesmas funções que os eventos reais usam.

const ANA = `${DEMO_PREFIX}1`
const BIA = `${DEMO_PREFIX}2`

type Cue = readonly [at: number, run: (sim: Sim) => Sim]

const tools = (who: string, ...names: string[]) => (sim: Sim) => names.reduce((s, name) => enqueue(s, who, kindOf(name), name), sim)
const done = (who: string, count = 1) => (sim: Sim) => Array.from({ length: count }).reduce<Sim>(s => settle(s, who), sim)
const thinking = (who: string, isOn: boolean) => (sim: Sim) => think(sim, who, isOn)

// O roteiro: pensa, lê e busca, pensa de novo, uma rajada com um shell demorado, chama dois ajudantes,
// todos trabalham, os ajudantes terminam, uma última leva, e o fim com confete.
const SCRIPT: readonly Cue[] = [
  [0, begin],
  [0, thinking(MAIN, true)],
  [16, thinking(MAIN, false)],
  [16, tools(MAIN, 'Read', 'Read', 'Grep')],
  [18, done(MAIN, 3)],
  [18, thinking(MAIN, true)],
  [50, thinking(MAIN, false)],
  [50, tools(MAIN, 'Read', 'Edit', 'Bash', 'Read', 'Write', 'Glob', 'WebFetch', 'Edit')],
  [52, done(MAIN, 7)], // o Bash segue rodando
  [78, done(MAIN)],
  [78, tools(MAIN, 'Agent')],
  [80, sim => summon(sim, ANA)],
  [86, tools(ANA, 'Grep', 'Read', 'Read')],
  [88, done(ANA, 3)],
  [90, tools(MAIN, 'Agent')],
  [92, sim => summon(sim, BIA)],
  [98, tools(BIA, 'Read', 'Edit')],
  [100, done(BIA, 2)],
  [106, tools(ANA, 'Bash')],
  [112, tools(BIA, 'Write', 'Edit', 'Read')],
  [114, done(BIA, 3)],
  [120, done(ANA)],
  [120, tools(ANA, 'Read', 'Read')],
  [122, done(ANA, 2)],
  [140, sim => retire(sim, ANA, true)],
  [142, done(MAIN, 2)],
  [142, tools(MAIN, 'Read', 'Edit', 'mcp__docs__search', 'Bash')],
  [144, done(MAIN, 4)],
  [150, sim => retire(sim, BIA, true)],
  [152, thinking(MAIN, true)],
  [184, thinking(MAIN, false)],
  [184, finish],
]

/** Quadros que a demonstração dura, da entrada do mascote ao fim do confete. */
export const DEMO_FRAMES = 206

/** Puro: a cena depois do que o roteiro marca para o quadro `frame`. */
export const applyDemo = (sim: Sim, frame: number): Sim => SCRIPT.filter(([at]) => at === frame).reduce((s, [, run]) => run(s), sim)
