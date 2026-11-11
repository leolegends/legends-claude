import { describe, expect, test } from 'claude-code/testing'

import { DEMO_FRAMES, applyDemo } from './demo'
import { kindOf, tintOf } from './palette'
import {
  DEMO_PREFIX, EMPTY_SIM, FLOOR_Y, MAIN, WALL_ROWS,
  begin, blank, enqueue, finish, fold, geometry, halt, hasScene, isAnimating, partyAge, retire, settle, step, summon, syncHelpers, think, wallFront,
} from './sim'
import type { Geo, Sim } from './sim'

const GEO = geometry(100) as Geo
const run = (sim: Sim, frames: number, geo = GEO) => Array.from({ length: frames }).reduce<Sim>(s => step(s, geo), sim)
// Anda quadro a quadro até a condição valer; devolve a cena e quantos quadros levou.
const until = (sim: Sim, isThere: (s: Sim) => boolean, limit = 400, frames = 0): { sim: Sim; frames: number } =>
  isThere(sim) || frames >= limit ? { sim, frames } : until(step(sim, GEO), isThere, limit, frames + 1)
const who = (sim: Sim, id: string) => sim.workers.find(w => w.id === id)
const main = (sim: Sim) => who(sim, MAIN)
const isActing = (id: string, act: string) => (s: Sim) => who(s, id)?.act === act
const tools = (sim: Sim, id: string, ...names: string[]) => names.reduce((s, name) => enqueue(s, id, kindOf(name), name), sim)
const sorted = (s: string) => [...s].sort().join('')
// O mascote já em casa, à espera, com o turno rodando.
const AT_HOME = until(begin(EMPTY_SIM), isActing(MAIN, 'idle')).sim

describe('as medidas do palco', () => {
  test('abaixo de 56 colunas não cabe; acima, a pista, a esteira e o mosaico cabem todos', () => {
    expect(geometry(55)).toBeNull()
    for (const columns of [56, 60, 80, 100, 120]) {
      const g = geometry(columns) as Geo
      expect(g.width).toBe(columns)
      expect(g.pick < g.home && g.home < g.drop).toBe(true)
      expect(g.beltFrom * 2 > g.drop + 18).toBe(true) // a esteira começa depois do mascote parado para entregar
      expect(g.width - g.beltFrom - g.wallCols * 2 >= 6).toBe(true) // sobra esteira mesmo com o mosaico cheio
      expect(g.wallRight).toBe(columns - 1)
    }
  })

  test('numa barra muito larga o palco para de esticar', () => {
    expect(geometry(200)?.width).toBe(120)
    expect(geometry(Infinity)?.width).toBe(120)
  })
})

describe('as famílias de ferramenta', () => {
  test('cada ferramenta cai na sua família, e a desconhecida no resto', () => {
    const family = (...names: string[]) => names.map(kindOf).join('')
    expect(family('Read', 'NotebookRead')).toBe('rr')
    expect(family('Grep', 'Glob', 'ToolSearch', 'LS')).toBe('ssss')
    expect(family('Edit', 'Write', 'NotebookEdit')).toBe('eee')
    expect(family('Bash', 'KillShell')).toBe('bb')
    expect(family('WebFetch', 'WebSearch')).toBe('ww') // web, não busca
    expect(family('Agent', 'Task', 'SendMessage')).toBe('aaa')
    expect(family('mcp__github__search_code', 'mcp__docs__read')).toBe('mm') // MCP antes de tudo
    expect(family('TodoWrite', 'AskUserQuestion', 'Skill')).toBe('ooo')
  })

  test('um agente tem sempre a mesma cor', () => {
    expect(tintOf('a1')).toBe(tintOf('a1'))
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(tintOf)).size > 2).toBe(true)
  })
})

describe('o mascote', () => {
  test('entra pela esquerda, fora de cena, e para no meio da pista', () => {
    const start = begin(EMPTY_SIM)
    expect(start.isOn).toBe(true)
    expect(main(start)).toMatchObject({ act: 'enter' })
    expect((main(start)?.x ?? 0) < 0).toBe(true)
    const home = until(start, isActing(MAIN, 'idle'))
    expect(main(home.sim)?.x).toBe(GEO.home)
    expect(home.frames > 5).toBe(true)
  })

  test('uma ferramenta vira um tijolo na pilha dele; quando ela termina, deixa de estar em execução', () => {
    const called = tools(AT_HOME, MAIN, 'Read', 'Grep', 'Edit')
    expect(main(called)).toMatchObject({ queue: 'rse', busy: 3, tool: 'Edit' })
    const oneLeft = settle(settle(called, MAIN), MAIN)
    expect(main(oneLeft)).toMatchObject({ busy: 1, tool: 'Edit' })
    expect(main(settle(oneLeft, MAIN))).toMatchObject({ busy: 0, tool: null })
    expect(main(settle(settle(oneLeft, MAIN), MAIN))?.busy).toBe(0) // nunca fica negativo
  })

  test('busca na pilha, levanta um por quadro, carrega até a esteira e entrega um por quadro', () => {
    const lifting = until(tools(AT_HOME, MAIN, 'Read', 'Grep', 'Edit'), isActing(MAIN, 'lift')).sim
    expect(main(lifting)?.x).toBe(GEO.pick)
    expect(main(step(lifting, GEO))).toMatchObject({ load: 'r', queue: 'se' })
    const hauling = until(lifting, isActing(MAIN, 'haul')).sim
    expect(main(hauling)).toMatchObject({ load: 'rse', queue: '' })
    const dropping = until(hauling, isActing(MAIN, 'drop')).sim
    expect(main(dropping)?.x).toBe(GEO.drop)
    const first = step(dropping, GEO)
    expect(main(first)?.load).toBe('rs')
    expect(first.belt).toEqual([{ kind: 'e', x: GEO.beltFrom }])
  })

  test('os tijolos andam pela esteira e encaixam no mosaico, que acende o recém-chegado', () => {
    const arrived = until(tools(AT_HOME, MAIN, 'Read', 'Grep', 'Edit'), s => s.wall.length === 3)
    expect(sorted(arrived.sim.wall)).toBe('ers')
    expect(arrived.sim.belt).toEqual([])
    expect(arrived.sim.flash > 0).toBe(true)
    expect(run(arrived.sim, 5).flash).toBe(0)
  })

  test('leva no máximo seis por viagem, e volta para buscar o resto', () => {
    const hauling = until(tools(AT_HOME, MAIN, ...Array.from({ length: 8 }, () => 'Read')), isActing(MAIN, 'haul')).sim
    expect(main(hauling)?.load.length).toBe(6)
    expect(main(hauling)?.queue.length).toBe(2)
    expect(until(hauling, s => s.wall.length === 8).sim.wall).toBe('rrrrrrrr')
  })

  test('com a pilha grande ele aperta o passo', () => {
    const paceWith = (count: number) => {
      const fetching = until(tools(AT_HOME, MAIN, ...Array.from({ length: count }, () => 'Read')), isActing(MAIN, 'fetch')).sim
      return (main(fetching)?.x ?? 0) - (main(step(fetching, GEO))?.x ?? 0)
    }
    expect(paceWith(2)).toBe(4)
    expect(paceWith(8)).toBe(6)
  })

  test('depois de entregar volta para casa; pensando ou não, fica parado lá', () => {
    const back = until(tools(AT_HOME, MAIN, 'Bash'), s => s.wall.length === 1 && main(s)?.act === 'idle').sim
    expect(main(back)?.x).toBe(GEO.home)
    const thinking = think(back, MAIN, true)
    expect(main(thinking)?.thinking).toBe(1)
    expect(main(run(thinking, 20))?.x).toBe(GEO.home)
  })

  test('dois pedidos ao modelo ao mesmo tempo: só para de pensar quando os dois terminam', () => {
    const twice = think(think(AT_HOME, MAIN, true), MAIN, true)
    expect(main(think(twice, MAIN, false))?.thinking).toBe(1)
    expect(main(think(think(twice, MAIN, false), MAIN, false))?.thinking).toBe(0)
    expect(main(think(AT_HOME, MAIN, false))?.thinking).toBe(0) // um fim sem começo não deixa negativo
  })
})

describe('os ajudantes', () => {
  const RUNNING = [{ id: 'a1', state: 'running' as const }]
  const withHelper = syncHelpers(AT_HOME, RUNNING)

  test('um agente rodando ganha um ajudante, que brota logo atrás do mascote; o mascote para e grita', () => {
    expect(who(withHelper, 'a1')).toMatchObject({ act: 'enter', t: 0 })
    expect((who(withHelper, 'a1')?.x ?? 0) < (main(withHelper)?.x ?? 0)).toBe(true)
    expect((main(withHelper)?.shout ?? 0) > 0).toBe(true)
    expect(step(withHelper, GEO).sparks.length > 0).toBe(true) // a nuvem de faíscas de onde ele sai
    const shouting = tools(withHelper, MAIN, 'Read')
    expect(main(run(shouting, 3))?.x).toBe(main(shouting)?.x) // parado enquanto grita
    expect((main(run(shouting, 12))?.x ?? 0) < (main(shouting)?.x ?? 0)).toBe(true) // depois vai buscar
    expect(who(until(withHelper, isActing('a1', 'idle')).sim, 'a1')).toBeDefined()
  })

  test('conferir de novo com a mesma lista não muda nada', () => {
    expect(syncHelpers(withHelper, RUNNING)).toEqual(withHelper)
  })

  test('os tijolos de um ajudante são dele, e é ele quem os leva', () => {
    const called = tools(until(withHelper, isActing('a1', 'idle')).sim, 'a1', 'Grep', 'Read')
    expect(who(called, 'a1')?.queue).toBe('sr')
    expect(main(called)?.queue).toBe('')
    const delivered = until(called, s => s.wall.length === 2).sim
    expect(sorted(delivered.wall)).toBe('rs')
    expect(main(delivered)?.x).toBe(GEO.home) // o mascote nem se mexeu
  })

  test('a ferramenta de um agente que ainda não tem ajudante faz ele nascer na hora', () => {
    const called = tools(AT_HOME, 'novo', 'Read')
    expect(who(called, 'novo')).toMatchObject({ act: 'enter', queue: 'r' })
  })

  test('à espera, ele dorme em casa; quando o agente volta a rodar, acorda', () => {
    const idle = until(withHelper, isActing('a1', 'idle')).sim
    const asleep = until(syncHelpers(idle, [{ id: 'a1', state: 'waiting' }]), isActing('a1', 'sleep'))
    expect(asleep.frames < 60).toBe(true)
    expect(isAnimating({ ...asleep.sim, isOn: false, workers: asleep.sim.workers.filter(w => w.id !== MAIN) })).toBe(false) // dormindo, nada se mexe
    const awake = step(syncHelpers(asleep.sim, RUNNING), GEO)
    expect(who(awake, 'a1')?.act).toBe('idle')
  })

  test('quando o agente termina ele entrega o que tinha, comemora e some', () => {
    const loaded = tools(until(withHelper, isActing('a1', 'idle')).sim, 'a1', 'Edit', 'Edit')
    const ended = syncHelpers(loaded, [{ id: 'a1', state: 'done' }])
    expect(who(ended, 'a1')).toMatchObject({ act: 'cheer', queue: '', load: '' })
    expect(ended.wall).toBe('ee')
    const gone = until(ended, s => !who(s, 'a1'))
    expect(gone.frames > 6 && gone.frames < 30).toBe(true)
    expect(syncHelpers(gone.sim, [{ id: 'a1', state: 'done' }]).workers.length).toBe(gone.sim.workers.length) // não renasce
  })

  test('quem falha ou some da lista também se despede', () => {
    const settled = until(withHelper, isActing('a1', 'idle')).sim
    expect(who(syncHelpers(settled, [{ id: 'a1', state: 'failed' }]), 'a1')?.act).toBe('fail')
    expect(who(syncHelpers(settled, []), 'a1')?.act).toBe('cheer')
    expect(until(syncHelpers(settled, [{ id: 'a1', state: 'failed' }]), s => !who(s, 'a1')).frames < 30).toBe(true)
  })

  test('recém-chegado e ainda fora da lista, o ajudante não é despedido: a lista é que está atrasada', () => {
    const justBorn = tools(AT_HOME, 'novo', 'Read') // nasceu de uma ferramenta, antes de a linha do agente existir
    expect(who(syncHelpers(justBorn, []), 'novo')).toMatchObject({ act: 'enter', queue: 'r' })
  })

  test('um tijolo que chega para quem já está se despedindo vai direto para o mosaico, sem se perder', () => {
    const leaving = retire(until(withHelper, isActing('a1', 'idle')).sim, 'a1', true)
    const late = tools(leaving, 'a1', 'Read', 'Edit')
    expect(who(late, 'a1')?.queue).toBe('')
    expect(late.wall).toBe('re')
    const gone = until(late, s => !who(s, 'a1')).sim
    expect(sorted(gone.wall)).toBe('er')
  })

  test('quem some de cena leva para o mosaico o que ainda tinha consigo', () => {
    const idle = until(withHelper, isActing('a1', 'idle')).sim
    const vanishing = { ...idle, workers: idle.workers.map(w => (w.id === 'a1' ? { ...w, act: 'poof' as const, t: 0, queue: 'rs', load: 'b' } : w)) }
    const gone = until(vanishing, s => !who(s, 'a1')).sim
    expect(sorted(gone.wall)).toBe('brs')
  })

  test('no máximo seis em cena; a ferramenta de quem ficou de fora vai direto para o mosaico', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `ag${i}`, state: 'running' as const }))
    const crowded = syncHelpers(AT_HOME, many)
    expect(crowded.workers.filter(w => w.id !== MAIN).length).toBe(6)
    const called = tools(crowded, 'ag8', 'Read')
    expect(who(called, 'ag8')).toBeUndefined()
    expect(called.wall).toBe('r')
  })

  test('um ajudante de demonstração não é mexido pela lista de agentes', () => {
    const staged = summon(AT_HOME, `${DEMO_PREFIX}1`)
    expect(who(syncHelpers(staged, []), `${DEMO_PREFIX}1`)?.act).toBe('enter')
    expect(who(retire(staged, `${DEMO_PREFIX}1`, true), `${DEMO_PREFIX}1`)?.act).toBe('cheer')
  })
})

describe('o fim do turno', () => {
  const busy = until(tools(AT_HOME, MAIN, 'Read', 'Edit', 'Bash', 'Grep'), isActing(MAIN, 'haul')).sim
  const ended = finish(tools(busy, MAIN, 'Write'))

  test('o que faltava vai para o mosaico, o mascote comemora e chove confete', () => {
    expect(ended.isOn).toBe(false)
    expect(ended.finale > 0).toBe(true)
    expect(main(ended)).toMatchObject({ act: 'cheer', load: '', queue: '', busy: 0, tool: null })
    expect(sorted(ended.wall)).toBe('beers')
    expect(ended.sparks.length > 10).toBe(true)
    expect(hasScene(ended)).toBe(true)
  })

  test('o confete não sai do palco nem atravessa o chão', () => {
    const frames = Array.from({ length: 24 }).reduce<Sim[]>(seen => [...seen, step(seen[seen.length - 1] ?? ended, GEO)], [ended])
    for (const frame of frames.slice(1))
      for (const s of frame.sparks) expect(s.x >= 0 && s.x < GEO.width * 2 && s.y < FLOOR_Y + 0.5).toBe(true)
    expect(frames[frames.length - 1]?.sparks).toEqual([])
  })

  test('passada a comemoração a cena sai, e nada mais se mexe', () => {
    const over = until(ended, s => !hasScene(s))
    expect(over.frames > 10 && over.frames < 40).toBe(true)
    expect(isAnimating(over.sim)).toBe(false) // fora de cena, o caminho de volta para casa não segura o relógio
    expect(main(over.sim)?.act).toBe('idle')
  })

  test('um turno novo com a cena ainda em pé segue de onde o mascote estava', () => {
    const again = begin(run(ended, 4))
    expect(again.isOn && again.finale === 0).toBe(true)
    expect(main(again)).toMatchObject({ act: 'idle', x: main(ended)?.x })
  })

  test('sem mascote em cena, o fim do turno só apaga a luz', () => {
    expect(finish({ ...EMPTY_SIM, isOn: true })).toEqual(EMPTY_SIM)
    expect(halt({ ...EMPTY_SIM, isOn: true })).toEqual(EMPTY_SIM)
  })

  test('a festa é do tamanho do trabalho: num turno curto, um pulinho sem confete', () => {
    expect(busy.work).toBe(4)
    const quick = finish(tools(AT_HOME, MAIN, 'Read'))
    expect(main(quick)?.act).toBe('cheer')
    expect(quick.sparks).toEqual([])
    expect(quick.finale > 0 && quick.finale < ended.finale).toBe(true)
    expect(quick.wall).toBe('r') // o que ele tinha ainda assim é entregue
    expect(finish(AT_HOME).sparks).toEqual([]) // um turno sem ferramenta nenhuma
    expect(begin(ended).work).toBe(0) // a conta recomeça a cada turno
  })

  test('a festa conta os seus quadros: só num turno que trabalhou, e só enquanto dura', () => {
    expect(partyAge(busy)).toBeNull() // o turno ainda roda
    expect(partyAge(ended)).toBe(0)
    expect(partyAge(step(ended, GEO))).toBe(1)
    expect(partyAge(run(ended, 5))).toBe(5)
    expect(partyAge(finish(tools(AT_HOME, MAIN, 'Read')))).toBeNull() // um turno curto só dá um pulinho
    expect(partyAge(until(ended, s => s.finale === 0).sim)).toBeNull()
    expect(partyAge(begin(ended))).toBeNull() // um turno novo encerra a festa
    expect(partyAge(halt(busy))).toBeNull()
  })

  test('um turno interrompido não tem festa: entrega o que havia e a cena se recolhe', () => {
    const stopped = halt(tools(busy, MAIN, 'Write'))
    expect(stopped).toMatchObject({ isOn: false, finale: 0, sparks: [] })
    expect(main(stopped)).toMatchObject({ act: 'idle', load: '', queue: '', busy: 0 })
    expect(sorted(stopped.wall)).toBe('beers')
    expect(hasScene(stopped)).toBe(false)
    expect(isAnimating(stopped)).toBe(false)
  })
})

describe('o mosaico e a pilha', () => {
  test('a frente do mosaico avança uma coluna de tijolo a cada cinco', () => {
    expect(wallFront('', GEO)).toBe(GEO.wallRight)
    expect(wallFront('r', GEO)).toBe(GEO.wallRight - 2)
    expect(wallFront('rrrrr', GEO)).toBe(GEO.wallRight - 2)
    expect(wallFront('rrrrrr', GEO)).toBe(GEO.wallRight - 4)
  })

  test('cheio, as colunas mais antigas saem inteiras e as novas ficam', () => {
    const room = GEO.wallCols * WALL_ROWS
    const over = step({ ...EMPTY_SIM, wall: 'b'.repeat(7) + 'r'.repeat(room) }, GEO)
    expect(over.wall.length <= room).toBe(true)
    expect(over.wall.length % WALL_ROWS).toBe(2) // saíram colunas inteiras: a fiada de cima segue onde estava
    expect(over.wall.endsWith('r'.repeat(room - 5))).toBe(true)
  })

  test('a pilha de um bicho tem teto: o que passa vai direto para o mosaico', () => {
    const flooded = tools(AT_HOME, MAIN, ...Array.from({ length: 60 }, () => 'Read'))
    expect(main(flooded)?.queue.length).toBe(48)
    expect(flooded.wall.length).toBe(12)
  })

  test('sem lugar para o palco, a cena esvazia e só lembra se o turno está rodando', () => {
    const busy = tools(AT_HOME, MAIN, 'Read', 'Edit')
    expect(blank(busy)).toEqual({ ...EMPTY_SIM, isOn: true })
    expect(isAnimating(blank(finish(busy)))).toBe(false) // nem a comemoração fica pendente
    expect(blank(EMPTY_SIM)).toBe(EMPTY_SIM)
  })

  test('quando a cena sai de vista, o que estava na esteira encaixa no mosaico', () => {
    const folded = fold({ ...EMPTY_SIM, wall: 'r', belt: [{ kind: 'e', x: 50 }, { kind: 'b', x: 60 }], sparks: [{ x: 1, y: 1, vx: 0, vy: 0, life: 3, paint: 'text' }] })
    expect(folded).toMatchObject({ wall: 'reb', belt: [], sparks: [] })
    expect(fold(EMPTY_SIM)).toBe(EMPTY_SIM)
  })
})

describe('a demonstração', () => {
  const play = (frames: number) => Array.from({ length: frames }).reduce<Sim>((s, _, frame) => step(applyDemo(s, frame), GEO), EMPTY_SIM)

  test('o mesmo roteiro dá sempre a mesma cena', () => {
    expect(play(130)).toEqual(play(130))
  })

  test('no meio, o mascote e dois ajudantes trabalham; no fim, tudo entregue e a cena vazia', () => {
    const middle = play(112)
    expect(middle.isOn).toBe(true)
    expect(middle.workers.map(w => w.id)).toEqual([MAIN, `${DEMO_PREFIX}1`, `${DEMO_PREFIX}2`])
    const end = play(DEMO_FRAMES + 1)
    expect(hasScene(end)).toBe(false)
    expect(isAnimating(end)).toBe(false)
    expect(end.wall.length + end.belt.length).toBe(28) // as 28 ferramentas do roteiro
    expect(end.workers.map(w => w.id)).toEqual([MAIN])
  })
})
