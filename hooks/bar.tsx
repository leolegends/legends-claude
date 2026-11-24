import type { EngineInterface, RenderElement } from 'claude-code'

import { ViewRow } from './bar-rows'
import type { Opened } from './focus'
import { BUTTONS_WIDTH, STAGE_SLOT } from './lines'
import { TAIL_GAP, lineWidth } from './parts'
import type { Line, Part } from './parts'

type Elements = ReturnType<EngineInterface['ui']['resolve']>

// A barra montada: a régua, o cabeçalho com os botões, e, sob ele, a aba de ajustes ou as linhas (a da
// vista, o seletor, o palco, o trabalho, os agentes). Pura: recebe os elementos da tela, as linhas já
// feitas e o que fazer a cada clique; quem fala com o engine é quem a chama.

/** Os sinais dos botões da barra, iguais em qualquer idioma. */
export type BarMarks = { settings: string; hide: string }

export type BarProps = {
  el: Elements
  /** A largura da barra, em colunas, e a folga à direita dela. */
  width: number
  rightPad: number
  /** A cor de destaque dos ajustes, já resolvida: as linhas falam `claude`, a barra pinta com a escolhida. */
  accent: string
  /** A régua de cima, ou `null` com ela desligada. */
  rule: readonly Part[] | null
  /** As linhas da barra: a primeira é o cabeçalho. */
  lines: readonly Line[]
  /** O palco como elemento (uma imagem, uma grade de blocos, um SVG): vai no lugar de `STAGE_SLOT`. */
  stage: RenderElement | null
  /** A imagem de sondagem, quando é hora dela: ocupa uma coluna no canto do cabeçalho. */
  probe: RenderElement | null
  /** As linhas de agente são botões: um clique põe a transcrição dele na tela (só no terminal). */
  canView: boolean
  /** O agente cuja transcrição está na tela. */
  viewedId: string | undefined
  /** A aba de ajustes está aberta: o botão dela fica aceso, e `panel` toma o lugar das linhas. */
  isSettingsOpen: boolean
  panel: readonly RenderElement[] | null
  /** Com a transcrição de um agente na tela: de quem ela é ("vendo Explore · buscar rotas"), a folga e o rótulo da volta. */
  viewed: { who: readonly Part[]; gap: number; back: string } | null
  /** As linhas de botões sob o cabeçalho, depois da da vista: o seletor aberto. */
  above: readonly RenderElement[]
  marks: BarMarks
  onToggle: (kind: Opened) => void
  onHide: () => void
  /** Um clique na linha de um agente: `undefined` volta à conversa principal. */
  onView: (agentId: string | undefined) => void
  /** Um clique no botão de compactar, na linha do contexto. */
  onCompact: () => void
}

const hasAction = (l: Line) => l.parts.some(q => q.action) || (l.tail ?? []).some(q => q.action)

export const Bar = ({ el, width, rightPad, accent, rule, lines, stage, probe, canView, viewedId, isSettingsOpen, panel, viewed, above, marks, onToggle, onHide, onView, onCompact }: BarProps): RenderElement => {
  const { Box, Button, Text } = el
  const paint = (color: string | undefined) => (color === 'claude' ? accent : color)
  const run = (q: Part) => <Text color={paint(q.color)} backgroundColor={paint(q.bg)} dimColor={q.dim} bold={q.bold} underline={q.underline}>{q.text}</Text>
  const gap = (l: Line, room: number) =>
    ' '.repeat(Math.max(l.tail?.length ? TAIL_GAP : 0, room - lineWidth(l) + (l.tail?.length ? TAIL_GAP : 0)))
  // Uma linha é um Text só, cortado na borda da barra; o trecho da direita encosta na borda.
  const row = (l: Line, room: number) => (
    <Text wrap="truncate-end">
      {l.parts.map(run)}
      {gap(l, room)}
      {(l.tail ?? []).map(run)}
    </Text>
  )
  // A linha de um agente, no terminal, é um botão do tamanho dela: um clique põe a transcrição dele
  // na tela; outro, na linha de quem já está em vista, volta à conversa principal.
  const agentRow = (l: Line, id: string) => (
    <Button key={`agent-${id}`} plain onPress={() => onView(id === viewedId ? undefined : id)}>
      {row(l, width)}
    </Button>
  )
  // Um trecho com `action` vira botão: o de compactar compacta; os outros abrem o seletor logo abaixo.
  const part = (q: Part) => {
    const action = q.action
    if (!action) return run(q)
    return <Button key={action} plain onPress={() => (action === 'compact' ? onCompact() : onToggle(action))}>{run(q)}</Button>
  }
  // Uma linha com botões (a do contexto) é uma fileira: os botões não cabem dentro de um Text.
  // O texto sem botões fica num Text só, como nas outras linhas.
  const actionRow = (l: Line, room: number, key: string) => (
    <Box key={key}>
      {l.parts.some(q => q.action)
        ? [...l.parts.map(part), <Text wrap="truncate-end">{gap(l, room)}</Text>]
        : <Text wrap="truncate-end">{l.parts.map(run)}{gap(l, room)}</Text>}
      {(l.tail ?? []).map(part)}
    </Box>
  )
  const [first = { parts: [] }, ...rest] = lines
  // Na primeira linha, modelo e effort são botões: um clique abre o seletor logo abaixo.
  const headParts = first.parts.map(part)
  return (
    <Box paddingRight={rightPad}>
      <Box width={width} flexDirection="column">
        {rule ? <Text key="rule" wrap="truncate-end">{rule.map(run)}</Text> : null}
        <Box key="head">
          {headParts}
          <Text wrap="truncate-end">
            {gap(first, width - BUTTONS_WIDTH - (probe ? 1 : 0))}
            {(first.tail ?? []).map(run)}
          </Text>
          <Button key="settings" label={marks.settings} plain dimColor={!isSettingsOpen} hover={{ color: accent }} onPress={() => onToggle('settings')} />
          <Button key="hide" label={marks.hide} plain dimColor hover={{ color: accent }} onPress={onHide} />
          {probe}
        </Box>
        {panel ?? [
          ...(viewed ? [ViewRow({ el, who: viewed.who.map(run), gap: viewed.gap, back: viewed.back, onBack: () => onView(undefined) })] : []),
          ...above,
          ...rest.map((l, n) => (
            l === STAGE_SLOT && stage ? stage
            : l.agentId !== undefined && canView ? agentRow(l, l.agentId)
            : hasAction(l) ? actionRow(l, width, `actions-${n}`)
            : row(l, width)
          )),
        ]}
      </Box>
    </Box>
  )
}

/** A barra recolhida: só o botão que a traz de volta, encostado à direita. */
export const HiddenBar = ({ el, label, rightPad, onShow }: { el: Elements; label: string; rightPad: number; onShow: () => void }): RenderElement => {
  const { Box, Button } = el
  return (
    <Box justifyContent="flex-end" paddingRight={rightPad}>
      <Button key="show" label={label} dimColor onPress={onShow} />
    </Box>
  )
}
