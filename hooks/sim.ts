import { noise } from './effects'
import { KINDS, KIND_PAINT, tintOf } from './palette'
import type { Kind } from './palette'
import { CLAWD, MINI } from './sprites'
import type { StatusAgentState as AgentState } from '../types'

// A simulação do palco, pura: um estado e funções que devolvem o estado seguinte.
// Cada chamada de ferramenta vira um tijolo na pilha da esquerda; o mascote (e um ajudante por agente)
// busca os seus, carrega na cabeça até a esteira, e a esteira leva ao mosaico que cresce à direita.
// As posições dos bichos são em subpixels (meia célula); as da esteira e do mosaico, em células.

export const MAIN = 'main'
/** Ajudantes de demonstração: a conferência com a lista de agentes não mexe neles. */
export const DEMO_PREFIX = 'demo:'

/** O que um bicho está fazendo. */
export type Act = 'enter' | 'idle' | 'home' | 'fetch' | 'lift' | 'haul' | 'drop' | 'sleep' | 'cheer' | 'fail' | 'poof'

export type Worker = {
  /** `MAIN` para o mascote; o id do agente para um ajudante. */
  id: string
  /** A borda esquerda do desenho, em subpixels. */
  x: number
  act: Act
  /** Quadros passados no que está fazendo. */
  t: number
  /** Os tijolos na cabeça, da esquerda para a direita (uma letra por família). */
  load: string
  /** Os tijolos dele esperando na pilha. */
  queue: string
  /** Ferramentas dele em execução agora. */
  busy: number
  /** O nome da última ferramenta em execução, para o balão. */
  tool: string | null
  /** Pedidos ao modelo em curso: enquanto houver algum, ele está pensando. */
  thinking: number
  /** O agente dele está à espera: quando chegar em casa, dorme. */
  isAsleep: boolean
  /** Quadros que ainda fica parado gritando por um ajudante. */
  shout: number
}

/** Um tijolo na esteira, numa célula. */
export type Brick = { kind: Kind; x: number }
/** Uma faísca: posição e velocidade em subpixels, quadros de vida e a tinta. */
export type Spark = { x: number; y: number; vx: number; vy: number; life: number; paint: string }

export type Sim = {
  tick: number
  /** O turno principal (ou a demonstração) está rodando. */
  isOn: boolean
  /** Quadros que faltam da comemoração do fim do turno. */
  finale: number
  /** Quantas ferramentas este turno já chamou, de todos: a festa do fim é do tamanho do trabalho. */
  work: number
  /** O mascote primeiro, quando existe; depois os ajudantes, na ordem em que chegaram. */
  workers: readonly Worker[]
  belt: readonly Brick[]
  /** O mosaico: uma letra por tijolo, do mais antigo ao mais novo. Fica de um turno para o outro, a sessão inteira. */
  wall: string
  /** Quadros que o tijolo mais novo do mosaico ainda fica aceso. */
  flash: number
  sparks: readonly Spark[]
}

/** As medidas do palco para uma largura de barra. */
export type Geo = {
  /** Células de largura. */
  width: number
  /** Onde um bicho para para pegar da pilha, e onde o mascote para para pôr na esteira (subpixels). */
  pick: number
  drop: number
  /** Onde o mascote espera, no meio do caminho (subpixels). */
  home: number
  /** A primeira célula da esteira e a última do mosaico. */
  beltFrom: number
  wallRight: number
  /** Quantas colunas de tijolo o mosaico pode ter. */
  wallCols: number
}

/** Um tijolo ocupa duas células. */
const BRICK = 2
/** A pilha: colunas de tijolos, e quantos em cada uma. */
export const PILE_COLS = 2
export const PILE_ROWS = 4
/** As fiadas do mosaico. */
export const WALL_ROWS = 5
/** Tijolos lado a lado em cada camada sobre a cabeça, por subpixel de largura dela. */
const HEAD_PER_BRICK = BRICK * 2
/** Camadas de tijolos que um bicho leva na cabeça. */
export const LOAD_LAYERS = 2
const PICK = PILE_COLS * BRICK * 2 + 2
const WORLD_MIN = 56 // mais estreito que isso não cabe pista, esteira e mosaico
const WORLD_MAX = 120 // numa barra mais larga o palco não estica: a esteira ficaria comprida demais
const LANE_SHARE = 0.3 // a fração da largura que é pista
const LANE_MIN = 18
const LANE_MAX = 32
const BELT_MIN = 6 // células de esteira que sobram mesmo com o mosaico cheio
const WALL_MAX_COLS = 20 // colunas de tijolo
const MAX_HELPERS = 6 // ajudantes em cena; os demais agentes seguem só na lista
const QUEUE_MAX = 48 // além disso a pilha não cresce: o tijolo vai direto para o mosaico
const BELT_SPEED = 3 // células por quadro
const MAIN_PACE = [3, 4] // subpixels por quadro: carregando, de mãos vazias
const HELPER_PACE = [4, 5]
const HURRY_AT = 6 // com tantos tijolos esperando, aperta o passo
const HURRY = 2
const SHOUT = 5 // quadros do grito que chama um ajudante
/** Quadros de faíscas antes de um ajudante recém-chamado aparecer. */
export const SPAWN = 3
const DROP_IN = 2 // quadros que ele leva caindo até o chão
const CHEER = 9 // quadros da comemoração de um ajudante que terminou
const FAIL = 7 // quadros que um ajudante que falhou fica em cena
const POOF = 3 // quadros da nuvem em que ele some
const FINALE = 18 // quadros da comemoração do fim de um turno que trabalhou: pulos e confete
const SHORT_FINALE = 7 // quadros da de um turno curto: um pulinho, sem confete
const PARTY_FROM = 3 // com menos ferramentas que isso no turno, não há confete
const FLASH = 2
const GRAVITY = 0.35 // subpixels por quadro²
const POOF_SPARKS = 10
const CONFETTI = 30
const SPARKS_MAX = 64
const HELPER_HOMES = [-14, 22, -26, 34, -6, 12] // onde cada ajudante espera, em subpixels a partir do meio da pista
const BODY_Y = 4 // a meia altura de um bicho em pé, em sublinhas
/** A sublinha onde pés e tijolos se apoiam, bem em cima da linha do chão. */
export const FLOOR_Y = 6

export const EMPTY_SIM: Sim = { tick: 0, isOn: false, finale: 0, work: 0, workers: [], belt: [], wall: '', flash: 0, sparks: [] }

const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n))
const artOf = (w: Worker) => (w.id === MAIN ? CLAWD : MINI)
const isLeaving = (w: Worker) => w.act === 'cheer' || w.act === 'fail' || w.act === 'poof'

const worker = (id: string, x: number): Worker => ({
  id, x, act: 'enter', t: 0, load: '', queue: '', busy: 0, tool: null, thinking: 0, isAsleep: false, shout: 0,
})

/** As medidas do palco numa barra de `columns` células, ou `null` quando não cabe. */
export const geometry = (columns: number): Geo | null => {
  if (!(columns >= WORLD_MIN)) return null
  const width = Math.min(Math.floor(columns), WORLD_MAX)
  const lane = clamp(Math.floor(width * LANE_SHARE), LANE_MIN, LANE_MAX)
  const drop = PICK + lane * 2
  const beltFrom = Math.ceil((drop + CLAWD.width) / 2) + 1
  const wallCols = clamp(Math.floor((width - beltFrom - BELT_MIN) / BRICK), 3, WALL_MAX_COLS)
  return { width, pick: PICK, drop, home: PICK + lane, beltFrom, wallRight: width - 1, wallCols }
}

/** Há cena para mostrar: o turno rodando, a comemoração dele, ou algum ajudante em cena. */
export const hasScene = (sim: Sim) => sim.isOn || sim.finale > 0 || sim.workers.some(w => w.id !== MAIN)

/** Algo se mexe em cena: sem isso, um quadro novo desenharia a mesma coisa. Fora de cena, nada conta. */
export const isAnimating = (sim: Sim) =>
  hasScene(sim) &&
  (sim.finale > 0 || sim.flash > 0 || sim.belt.length > 0 || sim.sparks.length > 0 ||
    sim.workers.some(w => w.shout > 0 || w.queue.length > 0 || !(w.act === 'sleep' || (w.act === 'idle' && !w.isAsleep))))

const patch = (sim: Sim, id: string, change: (w: Worker) => Worker): Sim => ({ ...sim, workers: sim.workers.map(w => (w.id === id ? change(w) : w)) })
const has = (sim: Sim, id: string) => sim.workers.some(w => w.id === id)
const mainOf = (sim: Sim) => sim.workers.find(w => w.id === MAIN)

// Uma nuvem de faíscas em volta de um bicho, na cor dele: de onde um ajudante brota e para onde some.
const poof = (w: Worker, tick: number): Spark[] =>
  Array.from({ length: POOF_SPARKS }, (_, i) => {
    const angle = (i / POOF_SPARKS) * Math.PI * 2 + noise(i, tick)
    const speed = 1 + noise(i + 50, tick) * 1.2
    return {
      x: w.x + artOf(w).width / 2, y: BODY_Y,
      vx: Math.cos(angle) * speed * 1.6, vy: Math.sin(angle) * speed * 0.8 - 0.4, // um subpixel é mais alto que largo
      life: 3 + Math.floor(noise(i + 90, tick) * 3), paint: tintOf(w.id),
    }
  })

// O confete do fim do turno: sobe da cabeça do mascote e chove, nas cores dos tijolos.
const confetti = (x: number, tick: number): Spark[] =>
  Array.from({ length: CONFETTI }, (_, i) => ({
    x: x + CLAWD.width / 2 + (noise(i, tick + 1) - 0.5) * 10, y: 2,
    vx: (noise(i, tick + 2) - 0.5) * 9, vy: -(0.4 + noise(i, tick + 3)),
    life: 9 + Math.floor(noise(i, tick + 4) * 7), paint: KIND_PAINT[KINDS[i % KINDS.length] ?? 'o'],
  }))

// Um ajudante novo brota logo atrás do mascote, que para um instante e grita por ele.
const spawnHelper = (sim: Sim, id: string): Sim => {
  if (sim.workers.filter(w => w.id !== MAIN).length >= MAX_HELPERS) return sim
  const main = mainOf(sim)
  const x = Math.max(PICK, (main?.x ?? PICK) - MINI.width - 4)
  return { ...sim, workers: [...sim.workers.map(w => (w.id === MAIN && sim.isOn ? { ...w, shout: SHOUT } : w)), worker(id, x)] }
}

/** O turno principal começou: o mascote entra em cena pela esquerda (ou segue onde estava, se a cena já rodava). */
export const begin = (sim: Sim): Sim => {
  const main = mainOf(sim)
  const onStage =
    main && hasScene(sim) ? { ...main, act: main.act === 'cheer' ? ('idle' as const) : main.act, busy: 0, tool: null, thinking: 0 } : worker(MAIN, -CLAWD.width)
  return { ...sim, isOn: true, finale: 0, work: 0, workers: [onStage, ...sim.workers.filter(w => w.id !== MAIN)] }
}

/** Uma ferramenta começou: um tijolo da família dela entra na pilha de quem a chamou. */
export const enqueue = (sim: Sim, id: string, kind: Kind, tool: string): Sim => {
  const counted = { ...sim, work: sim.work + 1 }
  const staffed = has(counted, id) ? counted : id === MAIN ? { ...counted, workers: [worker(MAIN, -CLAWD.width), ...counted.workers] } : spawnHelper(counted, id)
  const target = staffed.workers.find(w => w.id === id)
  // Sem quem carregue (ajudantes demais, ou ele já está se despedindo) o tijolo vai direto para o mosaico.
  if (!target || isLeaving(target)) return { ...staffed, wall: staffed.wall + kind }
  // Com a pilha dele no teto, também.
  if (target.queue.length >= QUEUE_MAX) return { ...patch(staffed, id, w => ({ ...w, busy: w.busy + 1, tool })), wall: staffed.wall + kind }
  return patch(staffed, id, w => ({ ...w, queue: w.queue + kind, busy: w.busy + 1, tool }))
}

/** Uma ferramenta terminou. */
export const settle = (sim: Sim, id: string): Sim =>
  patch(sim, id, w => ({ ...w, busy: Math.max(0, w.busy - 1), tool: w.busy <= 1 ? null : w.tool }))

/** Um pedido ao modelo começou (`true`) ou terminou. São contados: dois ao mesmo tempo só acabam quando os dois acabam. */
export const think = (sim: Sim, id: string, isStarting: boolean): Sim =>
  patch(sim, id, w => ({ ...w, thinking: Math.max(0, w.thinking + (isStarting ? 1 : -1)) }))

/** Um ajudante terminou (ou falhou): entrega o que tinha, comemora e some. O mascote não se aposenta. */
export const retire = (sim: Sim, id: string, isOk: boolean): Sim => {
  const w = sim.workers.find(x => x.id === id)
  if (!w || w.id === MAIN || isLeaving(w)) return sim
  return {
    ...patch(sim, id, x => ({ ...x, act: isOk ? 'cheer' : 'fail', t: 0, load: '', queue: '', busy: 0, tool: null, thinking: 0, isAsleep: false, shout: 0 })),
    wall: sim.wall + w.queue + w.load,
  }
}

/** Um ajudante entra em cena por pedido (a demonstração); os de agentes entram por `syncHelpers`. */
export const summon = (sim: Sim, id: string): Sim => (has(sim, id) ? sim : spawnHelper(sim, id))

// O mascote larga tudo e passa a fazer outra coisa: o que carregava e o que esperava na pilha dele saem com ele.
const dropAll = (w: Worker, act: Act): Worker => ({ ...w, act, t: 0, load: '', queue: '', busy: 0, tool: null, thinking: 0, shout: 0 })

/**
 * O turno principal acabou bem: o que faltava vai para o mosaico e o mascote comemora. A festa é do
 * tamanho do trabalho: com algumas ferramentas chamadas, pulos e confete; num turno curto, um pulinho.
 */
export const finish = (sim: Sim): Sim => {
  const main = mainOf(sim)
  if (!main) return { ...sim, isOn: false }
  const isParty = sim.work >= PARTY_FROM
  return {
    ...sim, isOn: false, finale: isParty ? FINALE : SHORT_FINALE, wall: sim.wall + main.queue + main.load,
    workers: sim.workers.map(w => (w.id === MAIN ? dropAll(w, 'cheer') : w)),
    sparks: isParty ? [...sim.sparks, ...confetti(main.x, sim.tick)].slice(-SPARKS_MAX) : sim.sparks,
  }
}

/** O turno principal foi interrompido ou acabou em erro: sem festa. O que faltava vai para o mosaico e a cena se recolhe. */
export const halt = (sim: Sim): Sim => {
  const main = mainOf(sim)
  if (!main) return { ...sim, isOn: false }
  return {
    ...sim, isOn: false, finale: 0, wall: sim.wall + main.queue + main.load,
    workers: sim.workers.map(w => (w.id === MAIN ? dropAll(w, 'idle') : w)),
  }
}

/** Puro: a cena conferida com a lista de agentes. Quem roda sem ajudante ganha um; quem terminou se despede. */
export const syncHelpers = (sim: Sim, agents: readonly { id: string; state: AgentState }[]): Sim => {
  const stateOf = new Map(agents.map(a => [a.id, a.state]))
  const staffed = agents
    .filter(a => a.state === 'running' || a.state === 'waiting')
    .reduce((s, a) => (has(s, a.id) ? s : spawnHelper(s, a.id)), sim)
  return staffed.workers
    .filter(w => w.id !== MAIN && !w.id.startsWith(DEMO_PREFIX))
    .reduce((s, w) => {
      const state = stateOf.get(w.id)
      if (state === 'running' || state === 'waiting') return w.isAsleep === (state === 'waiting') ? s : patch(s, w.id, x => ({ ...x, isAsleep: state === 'waiting' }))
      // Recém-chegado e ainda fora da lista: a ferramenta dele chegou antes da linha do agente. Fica.
      if (state === undefined && w.act === 'enter') return s
      return retire(s, w.id, state !== 'failed') // terminou, ou saiu da lista
    }, staffed)
}

/** A primeira célula ocupada pelo mosaico: as fiadas ímpares avançam uma célula, como numa parede. */
export const wallFront = (wall: string, geo: Geo) => geo.wallRight - BRICK * Math.ceil(wall.length / WALL_ROWS)

/** O que um quadro fez de um bicho: como ele ficou (`null` se saiu de cena), os tijolos que pôs na esteira, as faíscas que soltou. */
type Moved = { worker: Worker | null; bricks: readonly Kind[]; sparks: readonly Spark[] }

// Um quadro de um bicho: anda, pega, carrega, entrega, espera, comemora ou some.
const advance = (w: Worker, slot: number, sim: Sim, geo: Geo): Moved => {
  const isMain = w.id === MAIN
  const art = artOf(w)
  const dropX = geo.drop + CLAWD.width - art.width
  const homeX = isMain ? geo.home : clamp(geo.home + (HELPER_HOMES[slot % HELPER_HOMES.length] ?? 0), geo.pick, dropX)
  const cap = Math.floor(art.headWidth / HEAD_PER_BRICK) * LOAD_LAYERS
  const pace = (isCarrying: boolean) => ((isMain ? MAIN_PACE : HELPER_PACE)[isCarrying ? 0 : 1] ?? 3) + (w.queue.length >= HURRY_AT ? HURRY : 0)
  const keep = (change: Partial<Worker> = {}, bricks: readonly Kind[] = [], sparks: readonly Spark[] = []): Moved =>
    ({ worker: { ...w, t: w.t + 1, ...change }, bricks, sparks })
  const to = (act: Act, change: Partial<Worker> = {}): Moved => ({ worker: { ...w, ...change, act, t: 0 }, bricks: [], sparks: [] })
  const walk = (target: number, speed: number, then: Act): Moved => {
    const x = w.x < target ? Math.min(target, w.x + speed) : Math.max(target, w.x - speed)
    return x === target ? to(then, { x }) : keep({ x })
  }

  if (w.shout > 0) return { worker: { ...w, shout: w.shout - 1 }, bricks: [], sparks: [] }
  switch (w.act) {
    case 'enter':
      if (isMain) return w.queue ? to('fetch') : walk(homeX, pace(false), 'idle')
      if (w.t === 0) return keep({}, [], poof(w, sim.tick))
      return w.t >= SPAWN + DROP_IN ? to('idle') : keep()
    case 'idle':
      if (w.queue) return to('fetch')
      if (w.x !== homeX) return to('home')
      return w.isAsleep ? to('sleep') : keep()
    case 'home':
      return w.queue ? to('fetch') : walk(homeX, pace(false), 'idle')
    case 'sleep':
      return w.queue || !w.isAsleep ? to('idle') : keep()
    case 'fetch':
      return walk(geo.pick, pace(false), 'lift')
    case 'lift':
      if (w.queue && w.load.length < cap) return keep({ load: w.load + w.queue.slice(0, 1), queue: w.queue.slice(1) })
      return to(w.load ? 'haul' : 'idle')
    case 'haul':
      return walk(dropX, pace(true), 'drop')
    case 'drop':
      if (w.load) return keep({ load: w.load.slice(0, -1) }, [w.load.slice(-1) as Kind])
      return to(w.queue ? 'fetch' : 'home')
    case 'cheer':
      if (isMain) return sim.finale > 1 ? keep() : to('idle')
      return w.t >= CHEER ? to('poof') : keep()
    case 'fail':
      return w.t >= FAIL ? to('poof') : keep()
    case 'poof':
      if (w.t === 0) return keep({}, [], poof(w, sim.tick))
      return w.t >= POOF ? { worker: null, bricks: [], sparks: [] } : keep()
  }
}

/** Puro: um quadro da cena. Os bichos andam, a esteira corre, o mosaico cresce, as faíscas caem. */
export const step = (sim: Sim, geo: Geo): Sim => {
  const helpers = sim.workers.filter(w => w.id !== MAIN)
  const moved = sim.workers.map(w => advance(w, helpers.indexOf(w), sim, geo))
  // Quem saiu de cena neste quadro ainda com tijolos (na pilha ou na cabeça) deixa-os direto no mosaico.
  const orphaned = sim.workers.filter((_, i) => !moved[i]?.worker).map(w => w.queue + w.load).join('')
  // Dois bichos que entregam no mesmo quadro põem os tijolos em fila, não um em cima do outro.
  const entering = moved.flatMap(m => m.bricks).map((kind, i): Brick => ({ kind, x: geo.beltFrom + i * BELT_SPEED }))
  // Do mais adiantado ao mais atrasado: um tijolo encaixa quando encosta na frente do mosaico.
  const rolling = [...sim.belt.map(b => ({ ...b, x: b.x + BELT_SPEED })), ...entering].sort((a, b) => b.x - a.x)
  const settled = rolling.reduce<{ wall: string; belt: Brick[] }>(
    (acc, b) => (b.x + BRICK >= wallFront(acc.wall, geo) ? { ...acc, wall: acc.wall + b.kind } : { ...acc, belt: [...acc.belt, b] }),
    { wall: sim.wall + orphaned, belt: [] },
  )
  // Mosaico cheio: as colunas mais antigas saem pela direita.
  const spare = settled.wall.length - geo.wallCols * WALL_ROWS
  const wall = spare > 0 ? settled.wall.slice(Math.ceil(spare / WALL_ROWS) * WALL_ROWS) : settled.wall
  const flying = sim.sparks
    .map(s => ({ ...s, x: s.x + s.vx, y: s.y + s.vy, vy: s.vy + GRAVITY, life: s.life - 1 }))
    .filter(s => s.life > 0 && s.y < FLOOR_Y + 0.5 && s.x >= 0 && s.x < geo.width * 2) // o confete para no chão
  return {
    tick: sim.tick + 1,
    isOn: sim.isOn,
    finale: Math.max(0, sim.finale - 1),
    work: sim.work,
    workers: moved.flatMap(m => (m.worker ? [m.worker] : [])),
    belt: settled.belt,
    wall,
    flash: settled.wall.length > sim.wall.length ? FLASH : Math.max(0, sim.flash - 1),
    sparks: [...flying, ...moved.flatMap(m => m.sparks)].slice(-SPARKS_MAX),
  }
}

/**
 * Não há lugar para o palco (barra estreita demais, palco desligado): a cena não anda, então não pode
 * guardar nada que peça quadros nem crescer. Fica vazia, lembrando só se o turno está rodando.
 */
export const blank = (sim: Sim): Sim =>
  sim.workers.length || sim.belt.length || sim.sparks.length || sim.wall || sim.finale || sim.flash ? { ...EMPTY_SIM, isOn: sim.isOn } : sim

/** A cena saiu de vista: o que estava na esteira encaixa no mosaico e as faíscas somem. */
export const fold = (sim: Sim): Sim =>
  sim.belt.length || sim.sparks.length ? { ...sim, wall: sim.wall + sim.belt.map(b => b.kind).join(''), belt: [], sparks: [], flash: 0 } : sim
