import type { StatusAgent as Agent, StatusMain as Main } from '../types'

/** Um trecho de uma linha do palco: o mesmo formato dos trechos das outras linhas da barra. */
export type StagePart = { text: string; color?: string; dim?: boolean; bold?: boolean }
type Style = Omit<StagePart, 'text'>
/** Um carimbo na grade: um texto numa linha e coluna; os espaços dele são transparentes. */
type Stamp = Style & { y: 0 | 1; x: number; chars: string[] }
type Sprite = { body: string; blink: string; legs: readonly [string, string] }
/** Onde um bichinho está no vaivém e o que está fazendo. */
export type Pose = { x: number; isCarrying: boolean; isMoving: boolean; isDropping: boolean }

// O mascote do Claude Code, em blocos, como na tela de abertura: a cabeça com os olhos e as patinhas.
const CLAWD: Sprite = { body: '▐▛███▜▌', blink: '▐█████▌', legs: [' ▘▘ ▝▝ ', ' ▝▘ ▘▝ '] }
// Um ajudante: o mesmo bicho, menor e mais ligeiro.
const HELPER: Sprite = { body: '▐▛█▜▌', blink: '▐███▌', legs: [' ▘ ▝ ', ' ▝ ▘ '] }

const SOLID = '\u00a0' // num carimbo: um espaço opaco, que esconde o que está atrás (o espaço comum é transparente)
const PARCEL = '▤' // um arquivo
const PILE = '▤▤▤' // a pilha de onde os arquivos saem, à esquerda
const DOCK = 4 // a coluna onde os bichos pegam o arquivo, logo depois da pilha
const SHELF_ROOM = 7 // colunas reservadas à direita para a prateleira e o que acabou de ser entregue
const MIN_WIDTH = 40 // mais estreito que isso não há pista para andar
const PICK = 2 // quadros parado pegando o arquivo
const DROP = 2 // quadros parado entregando
const MAIN_GO = 3 // colunas por quadro carregando
const MAIN_BACK = 5 // colunas por quadro voltando de mãos vazias
const BLINK_EVERY = 23 // a cada tantos quadros o bicho pisca
const SPAWN = 3 // quadros da nuvem de faíscas de onde um ajudante brota
const SHOUT = 5 // quadros em que o mascote grita "!" chamando um ajudante
const CELEBRATE = 6 // quadros entre um ajudante terminar e sumir: ✓ e depois faíscas
const POOF_FROM = 4 // a partir deste quadro da despedida o ajudante já é só faíscas
const MAX_HELPERS = 6 // ajudantes desenhados ao mesmo tempo; os demais seguem só na lista
const WAIT_GAP = 6 // colunas entre ajudantes parados à espera

// As cores dos ajudantes: do tema, para lerem bem no claro e no escuro. A linha do agente usa a mesma.
const TINTS = ['suggestion', 'warning', 'planMode', 'bashBorder', 'success', 'merged'] as const

const hash = (id: string) => [...id].reduce((n, ch) => (n * 31 + (ch.codePointAt(0) ?? 0)) >>> 0, 7)

/** A cor de um agente no palco e na lista: a mesma enquanto ele existir. */
export const tintOf = (id: string): string => TINTS[hash(id) % TINTS.length] ?? 'suggestion'

const at = (y: 0 | 1, x: number, text: string, style: Style = {}): Stamp => ({ ...style, y, x: Math.round(x), chars: [...text] })
const lane = (width: number, sprite: Sprite) => ({ from: DOCK, to: Math.max(DOCK + 1, width - SHELF_ROOM - sprite.body.length) })

// O vaivém: pega na esquerda, anda carregando até a direita, entrega, volta mais rápido de mãos vazias.
export const cycle = (t: number, from: number, to: number, go: number, back: number): Pose => {
  const span = Math.max(1, to - from)
  const goFrames = Math.ceil(span / go)
  const period = PICK + goFrames + DROP + Math.ceil(span / back)
  const step = ((t % period) + period) % period
  if (step < PICK) return { x: from, isCarrying: step > 0, isMoving: false, isDropping: false }
  if (step < PICK + goFrames) return { x: Math.min(to, from + (step - PICK + 1) * go), isCarrying: true, isMoving: true, isDropping: false }
  if (step < PICK + goFrames + DROP) return { x: to, isCarrying: false, isMoving: false, isDropping: true }
  return { x: Math.max(from, to - (step - PICK - goFrames - DROP + 1) * back), isCarrying: false, isMoving: true, isDropping: false }
}

const STANDING = (x: number): Pose => ({ x, isCarrying: false, isMoving: false, isDropping: false })

// Um bicho na grade: corpo, patas andando, o arquivo que carrega (com o nome da ferramenta, quando há) e
// o brilho da entrega. É opaco, com uma coluna de margem: quem está na frente esconde quem passa atrás.
const draw = (sprite: Sprite, pose: Pose, t: number, style: Style, label: string | null): Stamp[] => {
  const hand = pose.x + sprite.body.length
  const legs = sprite.legs[pose.isMoving ? Math.abs(t) % 2 : 0] ?? sprite.legs[0]
  return [
    at(0, pose.x - 1, `${SOLID}${t % BLINK_EVERY === BLINK_EVERY - 1 ? sprite.blink : sprite.body}${SOLID}`, style),
    at(1, pose.x - 1, `${SOLID}${legs.replaceAll(' ', SOLID)}${SOLID}`, style),
    ...(pose.isCarrying ? [at(0, hand, `${PARCEL}${SOLID}`, { bold: true }), ...(label ? [at(0, hand + 2, `${label}${SOLID}`, { dim: true })] : [])] : []),
    ...(pose.isDropping ? [at(0, hand, '✽', { color: 'claude', bold: true })] : []),
  ]
}

const mainPose = (t: number, width: number) => {
  const { from, to } = lane(width, CLAWD)
  return cycle(t, from, to, MAIN_GO, MAIN_BACK)
}

// Onde um ajudante está `age` quadros depois de nascer: brota em `origin`, corre de mãos vazias até a
// pilha e daí em diante faz o próprio vaivém, um pouco mais rápido ou mais lento conforme o agente.
const helperPose = (age: number, origin: number, width: number, id: string): Pose => {
  const { from, to } = lane(width, HELPER)
  const go = MAIN_GO + (hash(id) % 3)
  const back = go + 2
  const lived = age - SPAWN
  if (lived < 0) return STANDING(origin)
  const approach = Math.ceil((origin - from) / back)
  if (lived < approach) return { ...STANDING(Math.max(from, origin - (lived + 1) * back)), isMoving: true }
  return cycle(lived - approach, from, to, go, back)
}

export type StageInput = {
  main: Main
  /** Os agentes a desenhar, na ordem da lista. */
  agents: readonly Agent[]
  now: number
  /** O turno principal está rodando. */
  isWorking: boolean
  width: number
  frameMs: number
}

const framesBetween = (later: number, earlier: number, frameMs: number) => Math.floor((later - earlier) / frameMs)

// Puro: os carimbos de um quadro do palco, do fundo para a frente.
const stamps = ({ main: m, agents, now, isWorking, width, frameMs }: StageInput): Stamp[] => {
  const isTurn = isWorking && m.startedAt > 0
  const t = isTurn ? framesBetween(now, m.startedAt, frameMs) : framesBetween(now, 0, frameMs)
  const helperLane = lane(width, HELPER)
  const pose = isTurn ? mainPose(t, width) : STANDING(DOCK)

  // Um ajudante brota logo atrás de onde o mascote estava quando o chamou; sem turno em curso, da pilha.
  const originOf = (a: Agent) =>
    isTurn && a.startedAt >= m.startedAt
      ? Math.min(helperLane.to, Math.max(helperLane.from, mainPose(framesBetween(a.startedAt, m.startedAt, frameMs), width).x - HELPER.body.length - 1))
      : helperLane.from

  const helpers = agents.slice(0, MAX_HELPERS).flatMap((a, i): Stamp[] => {
    const style: Style = { color: tintOf(a.id) }
    const age = framesBetween(now, a.startedAt, frameMs)
    const origin = originOf(a)
    if (a.state === 'waiting') {
      const x = Math.min(helperLane.to, helperLane.from + CLAWD.body.length + 2 + i * WAIT_GAP)
      return [...draw(HELPER, STANDING(x), 0, { ...style, dim: true }, null), at(0, x + HELPER.body.length, 'z', { dim: true })]
    }
    if (a.state === 'running') {
      if (age < 0) return []
      if (age < SPAWN) return [at(0, origin, ['  ✽  ', ' ✶✻✶ ', '✢✳✻✳✢'][age] ?? '', { ...style, bold: true })]
      return draw(HELPER, helperPose(age, origin, width, a.id), age, style, null) // só o mascote leva o nome da ferramenta
    }
    // Terminou: fica onde estava, com ✓ (ou ✗), e some em faíscas.
    if (a.endedAt === undefined) return []
    const since = framesBetween(now, a.endedAt, frameMs)
    if (since < 0 || since >= CELEBRATE) return []
    const stood = STANDING(helperPose(framesBetween(a.endedAt, a.startedAt, frameMs), origin, width, a.id).x)
    if (since >= POOF_FROM) return [at(0, stood.x, since === POOF_FROM ? ' ✶✻✶ ' : '  ·  ', style)]
    const isDone = a.state === 'done'
    return [
      ...draw(HELPER, stood, 0, isDone ? style : { ...style, dim: true }, null),
      at(0, stood.x + HELPER.body.length, isDone ? '✓' : '✗', { color: isDone ? 'success' : 'error', bold: true }),
    ]
  })

  const isCalling = agents.some(a => a.state === 'running' && framesBetween(now, a.startedAt, frameMs) >= 0 && framesBetween(now, a.startedAt, frameMs) < SHOUT)
  const isDelivering =
    pose.isDropping ||
    agents.slice(0, MAX_HELPERS).some(a => a.state === 'running' && helperPose(framesBetween(now, a.startedAt, frameMs), originOf(a), width, a.id).isDropping)
  const delivered = (isTurn ? m.tools : 0) + agents.reduce((n, a) => n + a.tools, 0)
  const shelf = `${PARCEL} ${delivered}`

  return [
    at(1, 0, PILE, { dim: true }),
    ...helpers,
    ...draw(CLAWD, pose, t, { color: 'claude' }, isTurn ? m.lastTool : null),
    ...(isCalling ? [at(0, pose.x + CLAWD.body.length, '!', { color: 'claude', bold: true })] : []),
    at(1, width - shelf.length, shelf, isDelivering ? { color: 'claude', bold: true } : { dim: true }),
  ]
}

const isSameStyle = (a: StagePart, b: StagePart) => a.color === b.color && a.dim === b.dim && a.bold === b.bold

// Uma linha da grade: em cada coluna vale o carimbo mais à frente que tenha algo ali.
const rowOf = (front: readonly Stamp[], y: 0 | 1, width: number): StagePart[] => {
  const cells = Array.from({ length: width }, (_, x): StagePart => {
    const top = front.find(s => s.y === y && x >= s.x && x < s.x + s.chars.length && s.chars[x - s.x] !== ' ')
    const ch = top?.chars[x - top.x]
    return top && ch && ch !== SOLID ? { text: ch, color: top.color, dim: top.dim, bold: top.bold } : { text: ' ' }
  })
  const runs = cells.reduce<StagePart[]>((out, c) => {
    const last = out[out.length - 1]
    return last && isSameStyle(last, c) ? [...out.slice(0, -1), { ...last, text: last.text + c.text }] : [...out, c]
  }, [])
  const tail = runs[runs.length - 1]
  return tail && !tail.text.trim() ? runs.slice(0, -1) : runs
}

/** Há cena para mostrar: o turno rodando, um ajudante vivo, ou um que acabou de terminar. */
export const hasScene = ({ main: m, agents, now, isWorking, frameMs }: Omit<StageInput, 'width'>) =>
  (isWorking && m.startedAt > 0) ||
  agents.some(a => a.state === 'running' || a.state === 'waiting' || (a.endedAt !== undefined && now - a.endedAt < CELEBRATE * frameMs))

/**
 * Puro: as duas linhas do palco (corpos e arquivos em cima, patas, pilha e prateleira embaixo),
 * ou nenhuma quando não há cena. Tudo sai do relógio: o mesmo instante desenha sempre o mesmo quadro.
 */
export const stageRows = (input: StageInput): StagePart[][] => {
  if (input.width < MIN_WIDTH || !hasScene(input)) return []
  const front = [...stamps(input)].reverse()
  return [rowOf(front, 0, input.width), rowOf(front, 1, input.width)]
}

/** Quanto tempo depois de um agente terminar o palco ainda precisa de quadros. */
export const celebrationMs = (frameMs: number) => CELEBRATE * frameMs
