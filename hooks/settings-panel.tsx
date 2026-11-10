import type { EngineInterface, RenderElement } from 'claude-code'

import { LANGUAGES } from './i18n'
import type { Strings } from './i18n'
import { ACCENTS, AGENT_LIMITS, MOTIONS, SPEEDS, TOGGLES } from './settings'
import type { StatusSettings as Settings } from '../types'

type Elements = ReturnType<EngineInterface['ui']['resolve']>

// Os sinais da aba, iguais em qualquer idioma.
const MARKS = { close: ' ✕ ', selected: '● ', on: '☑ ', off: '☐ ' } as const

const LABEL_WIDTH = 12 // a coluna dos rótulos, para as opções começarem alinhadas

export type PanelProps = {
  el: Elements
  settings: Settings
  /** Os textos no idioma em vigor. */
  strings: Strings
  /** A cor de destaque já resolvida, para pintar o que está selecionado. */
  accent: string
  onChange: (patch: Partial<Settings>) => void
  onReset: () => void
  /** Roda a demonstração do palco. */
  onDemo: () => void
  onClose: () => void
}

/** A aba de ajustes: uma linha por grupo, cada opção um botão; a escolhida vem marcada com ●. */
export const SettingsPanel = ({ el, settings: s, strings: t, accent, onChange, onReset, onDemo, onClose }: PanelProps): RenderElement[] => {
  const { Box, Button, Text } = el
  const label = (text: string) => <Text dimColor>{text.padEnd(LABEL_WIDTH)}</Text>

  // Uma opção: marcada com ● na cor de destaque quando é a atual; `color` pinta o próprio rótulo (a paleta).
  const option = (key: string, text: string, isCurrent: boolean, onPress: () => void, color?: string) => [
    <Text> </Text>,
    <Button key={key} plain onPress={onPress}>
      <Text color={color ?? (isCurrent ? accent : undefined)} bold={isCurrent}>
        {isCurrent ? `${MARKS.selected}${text}` : text}
      </Text>
    </Button>,
  ]

  return [
    <Box key="set-head">
      <Text color={accent} bold>⚙ </Text>
      <Text bold>{t.panel.title}</Text>
      <Box flexGrow={1} />
      <Button key="set-demo" label={t.panel.demo} plain dimColor onPress={onDemo} />
      <Button key="set-reset" label={t.panel.reset} plain dimColor onPress={onReset} />
      <Button key="set-close" label={MARKS.close} plain dimColor onPress={onClose} />
    </Box>,
    // O idioma vem primeiro, com cada opção escrita no próprio idioma: quem não lê o atual acha o seu.
    <Box key="set-language">
      {label(t.panel.language)}
      {LANGUAGES.flatMap(l => option(`set-language-${l.id}`, l.label, s.language === l.id, () => onChange({ language: l.id })))}
    </Box>,
    <Box key="set-accent">
      {label(t.panel.accent)}
      {ACCENTS.flatMap(a => option(`set-accent-${a.id}`, t.accents[a.id], s.accent === a.id, () => onChange({ accent: a.id }), a.color))}
    </Box>,
    <Box key="set-motion">
      {label(t.panel.motion)}
      {MOTIONS.flatMap(m => option(`set-motion-${m.id}`, t.motions[m.id], s.motion === m.id, () => onChange({ motion: m.id })))}
    </Box>,
    <Box key="set-speed">
      {label(t.panel.speed)}
      {SPEEDS.flatMap(v => option(`set-speed-${v.id}`, t.speeds[v.id], s.speed === v.id, () => onChange({ speed: v.id })))}
      {s.motion === 'parada' ? <Text dimColor>{`  ${t.panel.stillSpeed}`}</Text> : null}
    </Box>,
    <Box key="set-show">
      {label(t.panel.show)}
      {TOGGLES.flatMap(key => [
        <Text> </Text>,
        <Button key={`set-${key}`} plain onPress={() => onChange({ [key]: !s[key] })}>
          <Text color={s[key] ? accent : undefined} dimColor={!s[key]}>
            {`${s[key] ? MARKS.on : MARKS.off}${t.toggles[key]}`}
          </Text>
        </Button>,
      ])}
    </Box>,
    <Box key="set-agents">
      {label(t.panel.agents)}
      {AGENT_LIMITS.flatMap(n => option(`set-agents-${n}`, String(n), s.maxAgents === n, () => onChange({ maxAgents: n })))}
    </Box>,
  ]
}
