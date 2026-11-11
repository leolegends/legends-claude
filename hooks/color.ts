// As contas de cor do palco: misturar duas cores, tirar uma do arco-íris, e saber o hex aproximado de
// uma cor do tema. Tudo puro: a mesma entrada dá sempre a mesma cor.

type Rgb = readonly [number, number, number]

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
const GRAY: Rgb = [128, 128, 128]

const toRgb = (hex: string): Rgb => {
  const m = HEX.exec(hex)
  return m ? [parseInt(m[1] ?? '80', 16), parseInt(m[2] ?? '80', 16), parseInt(m[3] ?? '80', 16)] : GRAY
}

// Um canal de cor em dois dígitos; o que não é um número de verdade vale zero, nunca "NaN" no meio do hex.
const byte = (n: number) => Math.max(0, Math.min(255, Number.isFinite(n) ? Math.round(n) : 0)).toString(16).padStart(2, '0')
const toHex = ([r, g, b]: Rgb) => `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase()

/** Uma cor entre `from` e `to`, as duas em hex: `amount` 0 é a primeira, 1 a segunda. */
export const mix = (from: string, to: string, amount: number): string => {
  const a = toRgb(from)
  const b = toRgb(to)
  const t = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0
  return toHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
}

const HUE_STEP = 12 // os matizes andam de 12 em 12 graus: poucas cores distintas, as vizinhas juntam num trecho só
const SATURATION = 0.85
const LIGHTNESS = 0.64 // tom médio: lê bem no claro e no escuro

/** Uma cor do arco-íris pelo matiz em graus (0 vermelho, 120 verde, 240 azul), num tom médio e vivo. */
export const rainbow = (degrees: number): string => {
  const turn = Number.isFinite(degrees) ? degrees : 0
  const hue = (((Math.round(turn / HUE_STEP) * HUE_STEP) % 360) + 360) % 360
  const chroma = (1 - Math.abs(2 * LIGHTNESS - 1)) * SATURATION
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const lift = LIGHTNESS - chroma / 2
  const [r, g, b] =
    hue < 60 ? [chroma, second, 0]
    : hue < 120 ? [second, chroma, 0]
    : hue < 180 ? [0, chroma, second]
    : hue < 240 ? [0, second, chroma]
    : hue < 300 ? [second, 0, chroma]
    : [chroma, 0, second]
  return toHex([(r + lift) * 255, (g + lift) * 255, (b + lift) * 255])
}

// As cores do tema que o palco usa como tinta, aproximadas em hex para o tema escuro e para o claro.
// Servem só para derivar o clarão e o brilho de um bicho: o corpo dele segue pintado com a cor do tema.
const THEME: Record<string, readonly [dark: string, light: string]> = {
  claude: ['#D97757', '#D97757'],
  text: ['#E6E6E6', '#333333'],
  suggestion: ['#B1B9F9', '#5769F7'],
  warning: ['#FFC107', '#966C1E'],
  planMode: ['#48968C', '#006666'],
  bashBorder: ['#FD5DB1', '#FF0087'],
  success: ['#4EBA65', '#2C7A39'],
  merged: ['#AF87FF', '#8700FF'],
}

/** O hex de uma tinta: o próprio, se já é hex; o aproximado, se é uma cor do tema; cinza para o resto. */
export const hexOf = (paint: string, isLight = false): string =>
  HEX.test(paint) ? paint.toUpperCase() : (THEME[paint]?.[isLight ? 1 : 0] ?? toHex(GRAY))
