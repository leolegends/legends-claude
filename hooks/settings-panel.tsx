import type { EngineInterface, RenderElement } from 'claude-code'

import type { StatusSettings as Settings } from '../types'
import { ACCENTS, AGENT_LIMITS, MOTIONS, SPEEDS, TOGGLES } from './settings'

type Elements = ReturnType<EngineInterface['ui']['resolve']>

export const PANEL_STRINGS = {
  title: 'ajustes', reset: ' restaurar padrão ', close: ' ✕ ',
  accent: 'cor', motion: 'animação', speed: 'velocidade', show: 'mostrar', agents: 'agentes',
  selected: '● ', on: '☑ ', off: '☐ ',
  stillSpeed: '(sem efeito com animação parada)',
} as const

const LABEL_WIDTH = 12 // a coluna dos rótulos, para as opções começarem alinhadas

export type PanelProps = {
  el: Elements
  settings: Settings
  /** A cor de destaque já resolvida, para pintar o que está selecionado. */
  accent: string
  onChange: (patch: Partial<Settings>) => void
  onReset: () => void
  onClose: () => void
}

/** A aba de ajustes: uma linha por grupo, cada opção um botão; a escolhida vem marcada com ●. */
export const SettingsPanel = ({ el, settings: s, accent, onChange, onReset, onClose }: PanelProps): RenderElement[] => {
  const { Box, Button, Text } = el
  const label = (text: string) => <Text dimColor>{text.padEnd(LABEL_WIDTH)}</Text>

  // Uma opção: marcada com ● na cor de destaque quando é a atual; `color` pinta o próprio rótulo (a paleta).
  const option = (key: string, text: string, isCurrent: boolean, onPress: () => void, color?: string) => [
    <Text> </Text>,
    <Button key={key} plain onPress={onPress}>
      <Text color={color ?? (isCurrent ? accent : undefined)} bold={isCurrent}>
        {isCurrent ? `${PANEL_STRINGS.selected}${text}` : text}
      </Text>
    </Button>,
  ]

  return [
    <Box key="set-head">
      <Text color={accent} bold>⚙ </Text>
      <Text bold>{PANEL_STRINGS.title}</Text>
      <Box flexGrow={1} />
      <Button key="set-reset" label={PANEL_STRINGS.reset} plain dimColor onPress={onReset} />
      <Button key="set-close" label={PANEL_STRINGS.close} plain dimColor onPress={onClose} />
    </Box>,
    <Box key="set-accent">
      {label(PANEL_STRINGS.accent)}
      {ACCENTS.flatMap(a => option(`set-accent-${a.id}`, a.label, s.accent === a.id, () => onChange({ accent: a.id }), a.color))}
    </Box>,
    <Box key="set-motion">
      {label(PANEL_STRINGS.motion)}
      {MOTIONS.flatMap(m => option(`set-motion-${m.id}`, m.label, s.motion === m.id, () => onChange({ motion: m.id })))}
    </Box>,
    <Box key="set-speed">
      {label(PANEL_STRINGS.speed)}
      {SPEEDS.flatMap(v => option(`set-speed-${v.id}`, v.label, s.speed === v.id, () => onChange({ speed: v.id })))}
      {s.motion === 'parada' ? <Text dimColor>{`  ${PANEL_STRINGS.stillSpeed}`}</Text> : null}
    </Box>,
    <Box key="set-show">
      {label(PANEL_STRINGS.show)}
      {TOGGLES.flatMap(t => [
        <Text> </Text>,
        <Button key={`set-${t.key}`} plain onPress={() => onChange({ [t.key]: !s[t.key] })}>
          <Text color={s[t.key] ? accent : undefined} dimColor={!s[t.key]}>
            {`${s[t.key] ? PANEL_STRINGS.on : PANEL_STRINGS.off}${t.label}`}
          </Text>
        </Button>,
      ])}
    </Box>,
    <Box key="set-agents">
      {label(PANEL_STRINGS.agents)}
      {AGENT_LIMITS.flatMap(n => option(`set-agents-${n}`, String(n), s.maxAgents === n, () => onChange({ maxAgents: n })))}
    </Box>,
  ]
}
