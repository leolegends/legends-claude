import type { StatusLanguage as Language, StatusPicker as Picker } from '../types'

// O anel de foco da faixa: em que botão ele cai quando algo abre nela. Quem navega pelo teclado
// (ctrl+x tab, Tab ou as setas, Enter) tem o anel num botão da barra, e a barra pede ao engine que ele
// acompanhe o que abre e fecha. As chaves daqui são as `key` dos botões: a barra e a aba de ajustes
// desenham com as mesmas funções, para o anel nunca ser mandado a um botão que não existe.

/** O que abre na faixa sob o cabeçalho: um seletor ou a aba de ajustes. */
export type Opened = Exclude<Picker, null>

/** A `key` de uma opção do seletor de modelo ou de effort. */
export const pickKey = (value: string) => `pick-${value}`
/** A `key` de uma opção de idioma: a primeira linha da aba de ajustes. */
export const languageKey = (language: Language) => `set-language-${language}`

/** O que está em vigor quando algo abre: os modelos e os níveis oferecidos, e os atuais. */
export type Standing = {
  /** Os apelidos dos modelos do seletor, na ordem em que aparecem. */
  models: readonly string[]
  /** O modelo da sessão como a barra o escreve, em minúsculas ("fable 5.2"); '' quando ainda não se sabe. */
  model: string
  efforts: readonly string[]
  effort: string | null
  language: Language
}

/**
 * Puro: a `key` do botão em que o anel cai quando um seletor ou a aba de ajustes abre: a opção em
 * vigor (o modelo da sessão, o effort do último pedido, o idioma da barra); sem nenhuma, a primeira.
 */
export const landingKey = (kind: Opened, at: Standing): string =>
  kind === 'settings' ? languageKey(at.language)
  : kind === 'model' ? pickKey(at.models.find(value => at.model.startsWith(value)) ?? at.models[0] ?? '')
  : pickKey(at.efforts.find(level => level === at.effort) ?? at.efforts[0] ?? '')
