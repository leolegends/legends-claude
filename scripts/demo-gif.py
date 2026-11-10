"""Desenha os quadros de scripts/demo-frames.ts num GIF animado.

    bun run scripts/demo-frames.ts | python3 scripts/demo-gif.py docs/demo.gif [largura-da-célula] [fonte.ttf]

Os blocos (▀▄█▌▐▘▝▖▗…) e as linhas (─━═╪) são traçados como retângulos exatos, para o GIF ficar igual
ao que um terminal desenha; o resto do texto sai pela fonte. Precisa de Pillow. Não faz parte do mod.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
CELL_W = int(sys.argv[2]) if len(sys.argv) > 2 else 9
FONT = sys.argv[3] if len(sys.argv) > 3 else '/System/Library/Fonts/Menlo.ttc'
CELL_H = CELL_W * 2  # uma célula de terminal tem o dobro da altura
MARGIN = 8
BACKGROUND = (22, 22, 26)
FOREGROUND = (220, 220, 220)
COLORS = 128

# As cores do tema escuro do Claude Code, aproximadas, para os nomes que o mod usa.
THEME = {
    'claude': '#D97757', 'subtle': '#6b6b6b', 'success': '#4EC98B', 'error': '#FF6B80', 'warning': '#FFC107',
    'suggestion': '#B1B9F9', 'planMode': '#48968C', 'bashBorder': '#FD5DB1', 'merged': '#AF87FF', 'text': '#FFFFFF',
}
# Cada bloco de quadrante e os subpixels que ele acende: 1 cima-esquerda, 2 cima-direita, 4 baixo-esquerda, 8 baixo-direita.
QUADRANTS = {'▘': 1, '▝': 2, '▀': 3, '▖': 4, '▌': 5, '▞': 6, '▛': 7, '▗': 8, '▚': 9, '▐': 10, '▜': 11, '▄': 12, '▙': 13, '▟': 14, '█': 15}
LINES = '─━═╪'


def rgb(name):
    if name is None:
        return FOREGROUND
    value = THEME.get(name, name)
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5)) if value.startswith('#') else FOREGROUND


def dimmed(color):
    return tuple((a + b) // 2 for a, b in zip(color, BACKGROUND))


def draw_line(draw, ch, x, y, color):
    middle = y + CELL_H // 2
    stroke = max(1, CELL_W // 8)
    if ch == '─':
        draw.rectangle([x, middle - stroke // 2, x + CELL_W - 1, middle - stroke // 2 + stroke - 1], fill=color)
    elif ch == '━':
        draw.rectangle([x, middle - stroke, x + CELL_W - 1, middle + stroke], fill=color)
    else:  # os dois trilhos da esteira e, no rolete, a travessa
        for offset in (-2 * stroke, stroke):
            draw.rectangle([x, middle + offset, x + CELL_W - 1, middle + offset + stroke - 1], fill=color)
        if ch == '╪':
            center = x + CELL_W // 2 - stroke // 2
            draw.rectangle([center, middle - CELL_H // 4, center + stroke - 1, middle + CELL_H // 4], fill=color)


def draw_frame(draw, rows, width, fonts):
    half_w, half_h = CELL_W // 2, CELL_H // 2
    for r, parts in enumerate(rows):
        column = 0
        for part in parts:
            color = rgb(part.get('color'))
            color = dimmed(color) if part.get('dim') else color
            background = rgb(part['bg']) if part.get('bg') else None
            for ch in part['text']:
                x, y = MARGIN + column * CELL_W, MARGIN + r * CELL_H
                column += 1
                if column > width:
                    continue
                if background:
                    draw.rectangle([x, y, x + CELL_W - 1, y + CELL_H - 1], fill=background)
                if ch in QUADRANTS:
                    # cada quarto vai da sua origem até o meio ou até a borda: com célula de largura ímpar,
                    # a metade direita fica com o pixel que sobra, e não aparece uma fresta entre as células
                    for bit, (x0, y0, x1, y1) in (
                        (1, (0, 0, half_w, half_h)), (2, (half_w, 0, CELL_W, half_h)),
                        (4, (0, half_h, half_w, CELL_H)), (8, (half_w, half_h, CELL_W, CELL_H)),
                    ):
                        if QUADRANTS[ch] & bit:
                            draw.rectangle([x + x0, y + y0, x + x1 - 1, y + y1 - 1], fill=color)
                elif ch in LINES:
                    draw_line(draw, ch, x, y, color)
                elif ch != ' ':
                    draw.text((x, y), ch, font=fonts[bool(part.get('bold'))], fill=color)


def main():
    data = json.load(sys.stdin)
    width, frames = data['width'], data['frames']
    size = int(CELL_W * 1.6)
    regular = ImageFont.truetype(FONT, size)
    try:
        bold = ImageFont.truetype(FONT, size, index=1)  # numa coleção .ttc, a segunda face costuma ser o negrito
    except OSError:
        bold = regular
    rows = max(len(frame) for frame in frames)  # a barra muda de altura: o GIF tem a da mais alta
    canvas = (width * CELL_W + 2 * MARGIN, rows * CELL_H + 2 * MARGIN)
    images = []
    for frame in frames:
        image = Image.new('RGB', canvas, BACKGROUND)
        draw_frame(ImageDraw.Draw(image), frame, width, {False: regular, True: bold})
        # sem pontilhado: as áreas de cor chapada (o mascote, os tijolos) não podem ganhar listras
        images.append(image.quantize(colors=COLORS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
    images[0].save(OUT, save_all=True, append_images=images[1:], duration=data.get('frameMs', 125), loop=0, optimize=True)
    print(f'{OUT}: {canvas[0]}x{canvas[1]}, {len(images)} quadros, {os.path.getsize(OUT) // 1024} KB')


if __name__ == '__main__':
    main()
