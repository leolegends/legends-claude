import type { EngineInterface, RenderElement } from 'claude-code'

import { pickKey } from './focus'

type Elements = ReturnType<EngineInterface['ui']['resolve']>

// As linhas da barra que são feitas de botões e aparecem sob o cabeçalho: o seletor de modelo ou de
// effort, e a linha que diz de qual agente é a transcrição na tela. Puras: recebem os elementos da
// tela e o que fazer a cada clique; quem fala com o engine é quem as chama.

/** Uma opção de um seletor: o valor que o comando recebe, o rótulo, e se é a que está em vigor. */
export type Choice = { value: string; label: string; isCurrent: boolean }

export type PickerProps = {
  el: Elements
  /** O que se escolhe, antes das opções ("modelo ", "effort "). */
  label: string
  choices: readonly Choice[]
  /** A cor de destaque já resolvida: pinta a opção em vigor. */
  accent: string
  /** Os sinais da barra: o que marca a opção em vigor e o que fecha. */
  marks: { current: string; close: string }
  onPick: (value: string) => void
  onClose: () => void
}

/** `modelo  ● Fable  Opus  Sonnet  Haiku  ✕`: cada opção um botão, a em vigor marcada. */
export const PickerRow = ({ el, label, choices, accent, marks, onPick, onClose }: PickerProps): RenderElement => {
  const { Box, Button, Text } = el
  return (
    <Box key="picker">
      <Text dimColor>{label}</Text>
      {choices.flatMap(c => [
        <Text> </Text>,
        <Button key={pickKey(c.value)} plain onPress={() => onPick(c.value)}>
          <Text color={c.isCurrent ? accent : undefined} bold={c.isCurrent}>{c.isCurrent ? `${marks.current}${c.label}` : c.label}</Text>
        </Button>,
      ])}
      <Button key="pick-close" label={marks.close} plain dimColor onPress={onClose} />
    </Box>
  )
}

export type ViewProps = {
  el: Elements
  /** De quem é a transcrição na tela, já desenhado: "vendo Explore · buscar rotas". */
  who: readonly RenderElement[]
  /** Colunas entre o nome e o botão de volta. */
  gap: number
  /** O rótulo do botão que volta à conversa principal. */
  back: string
  onBack: () => void
}

/** `vendo Explore · buscar rotas  ← principal`: a transcrição de um agente está na tela, e a volta. */
export const ViewRow = ({ el, who, gap, back, onBack }: ViewProps): RenderElement => {
  const { Box, Button, Text } = el
  return (
    <Box key="view">
      {who}
      <Text>{' '.repeat(gap)}</Text>
      <Button key="view-main" label={back} plain onPress={onBack} />
    </Box>
  )
}
