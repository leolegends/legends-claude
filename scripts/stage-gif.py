"""Monta o GIF do palco em alta resolução com os quadros de scripts/stage-frames.ts.

    python3 scripts/stage-gif.py docs/stage.gif "pixels=<a.bin>" "blocos=<b.bin>" [fonte.ttf]

Cada entrada é `legenda=arquivo`: as faixas ficam empilhadas, cada uma com a sua legenda, e andam
juntas (o GIF dura o que dura a mais curta). Os pixels vêm prontos; os textos do palco em blocos (o
chão, as estrelas, os sinais, o placar) são escritos aqui, com a fonte. Precisa de Pillow. Não faz
parte do mod.
"""
import json
import os
import sys
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFont

BACKGROUND = {False: (22, 22, 26), True: (250, 250, 250)}
FOREGROUND = {False: (220, 220, 220), True: (40, 40, 40)}
CAPTION = {False: (150, 150, 158), True: (90, 90, 96)}
MARGIN = 8
CAPTION_HEIGHT = 18
GAP = 10
COLORS = 128
# Os traços do chão do palco em blocos, desenhados como retângulos exatos, como um terminal os desenha.
LINES = '─═╪'


@dataclass(frozen=True)
class Strip:
    """Uma faixa do GIF: a legenda, as medidas e os quadros (os pixels e os textos de cada um)."""

    caption: str
    width: int
    height: int
    cell_w: int
    cell_h: int
    frame_ms: int
    is_light: bool
    frames: tuple


def read_strip(spec: str) -> Strip:
    caption, _, path = spec.partition('=')
    with open(path, 'rb') as source:
        head = json.loads(source.readline())
        size = head['width'] * head['height'] * 4
        frames = []
        while True:
            line = source.readline()
            if not line:
                break
            texts = json.loads(line)['texts']
            pixels = source.read(size)
            if len(pixels) < size:
                break
            frames.append((pixels, texts))
    return Strip(caption, head['width'], head['height'], head['cellW'], head['cellH'], head['frameMs'], bool(head.get('isLight')), tuple(frames))


def draw_line(draw: ImageDraw.ImageDraw, char: str, x: int, y: int, cell_w: int, cell_h: int, color: tuple) -> None:
    middle = y + cell_h // 2
    if char == '─':
        draw.rectangle([x, middle, x + cell_w - 1, middle], fill=color)
        return
    for offset in (-2, 1):  # os dois trilhos da esteira e, no rolete, a travessa
        draw.rectangle([x, middle + offset, x + cell_w - 1, middle + offset], fill=color)
    if char == '╪':
        draw.rectangle([x + cell_w // 2 - 1, middle - cell_h // 4, x + cell_w // 2 - 1, middle + cell_h // 4], fill=color)


def rgb_of(color, is_light: bool) -> tuple:
    if color is None:
        return FOREGROUND[is_light]
    return tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))


def paint_strip(canvas: Image.Image, strip: Strip, index: int, top: int, font: ImageFont.FreeTypeFont) -> None:
    pixels, texts = strip.frames[index]
    layer = Image.frombytes('RGBA', (strip.width, strip.height), pixels)
    canvas.paste(layer, (MARGIN, top), layer)
    draw = ImageDraw.Draw(canvas)
    for column, row, char, color in texts:
        x, y = MARGIN + column * strip.cell_w, top + row * strip.cell_h
        ink = rgb_of(color, strip.is_light)
        if char in LINES:
            draw_line(draw, char, x, y, strip.cell_w, strip.cell_h, ink)
        else:
            draw.text((x, y), char, font=font, fill=ink)


def main() -> None:
    out = sys.argv[1]
    specs = [arg for arg in sys.argv[2:] if '=' in arg]
    fonts = [arg for arg in sys.argv[2:] if '=' not in arg]
    font_path = fonts[0] if fonts else '/System/Library/Fonts/Menlo.ttc'
    strips = [read_strip(spec) for spec in specs]
    if not strips:
        raise SystemExit('falta ao menos uma faixa: "legenda=arquivo.bin"')
    is_light = strips[0].is_light
    font = ImageFont.truetype(font_path, int(strips[0].cell_w * 1.6))
    caption_font = ImageFont.truetype(font_path, 11)
    width = max(strip.width for strip in strips) + 2 * MARGIN
    height = MARGIN + sum(CAPTION_HEIGHT + strip.height + GAP for strip in strips)
    count = min(len(strip.frames) for strip in strips)
    images = []
    for index in range(count):
        canvas = Image.new('RGB', (width, height), BACKGROUND[is_light])
        draw = ImageDraw.Draw(canvas)
        top = MARGIN
        for strip in strips:
            draw.text((MARGIN, top), strip.caption, font=caption_font, fill=CAPTION[is_light])
            paint_strip(canvas, strip, index, top + CAPTION_HEIGHT, font)
            top += CAPTION_HEIGHT + strip.height + GAP
        # sem pontilhado: as áreas de cor chapada (o mascote, os tijolos) não podem ganhar listras
        images.append(canvas.quantize(colors=COLORS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
    images[0].save(out, save_all=True, append_images=images[1:], duration=strips[0].frame_ms, loop=0, optimize=True)
    print(f'{out}: {width}x{height}, {len(images)} quadros, {os.path.getsize(out) // 1024} KB')


if __name__ == '__main__':
    main()
