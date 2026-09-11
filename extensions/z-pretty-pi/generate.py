"""Generate Pi header frames with TerminalTextEffects ColorShift and Highlight."""

import gzip
import json
from pathlib import Path

from terminaltexteffects import Color, Gradient, easing
from terminaltexteffects.effects.effect_colorshift import ColorShift
from terminaltexteffects.effects.effect_highlight import Highlight
from terminaltexteffects.effects.effect_expand import Expand
from terminaltexteffects.utils.argutils import CharacterGroup

# Match the reference: the i sits outside the P and touches its corner.
LOGO = [
    *["█" * 15 + " " * 5 for _ in range(2)],
    *["█" * 5 + " " * 5 + "█" * 5 + " " * 5 for _ in range(2)],
    *["█" * 10 + " " * 5 + "█" * 5 for _ in range(2)],
    *["█" * 5 + " " * 10 + "█" * 5 for _ in range(2)],
]
WIDTH = max(map(len, LOGO))
HEIGHT = len(LOGO)
PALETTE = tuple(Color(c) for c in ("f053d0", "cf5bde", "a35fee", "a870e8", "879ae7", "a870e8", "cf5bde"))


def configure(effect):
    effect.terminal_config.frame_rate = 0
    effect.terminal_config.ignore_terminal_dimensions = True
    effect.terminal_config.canvas_width = WIDTH
    effect.terminal_config.canvas_height = HEIGHT
    effect.terminal_config.anchor_text = "sw"
    return effect


def colors(iterator, flip=False):
    return {
        (c.input_coord.column - 1, c.input_coord.row - 1 if flip else HEIGHT - c.input_coord.row):
        c.animation.current_character_visual.colors.fg_color.rgb_ints
        for c in iterator.terminal.get_characters()
    }


def generate():
    # TTE numbers rows from the bottom. Flip this input to move colors down and right.
    shift = configure(ColorShift("\n".join(reversed(LOGO))))
    shift.effect_config.gradient_stops = PALETTE
    shift.effect_config.gradient_steps = 20
    shift.effect_config.gradient_frames = 2
    shift.effect_config.travel_direction = Gradient.Direction.DIAGONAL
    shift.effect_config.reverse_travel_direction = True
    shift.effect_config.cycles = 2
    shift.effect_config.skip_final_gradient = True
    rainbow = iter(shift)
    count = len(Gradient(*PALETTE, steps=20, loop=True).spectrum) * 2

    # Use the actual Highlight effect as a grayscale mask over the moving rainbow.
    highlight = configure(Highlight("\n".join(LOGO)))
    highlight.effect_config.final_gradient_stops = (Color("808080"),)
    highlight.effect_config.highlight_brightness = 2
    highlight.effect_config.highlight_width = 5
    highlight.effect_config.highlight_direction = CharacterGroup.DIAGONAL_TOP_LEFT_TO_BOTTOM_RIGHT
    shine = iter(highlight)
    masks = []
    for _ in shine:
        masks.append(colors(shine))
    delay = (count - len(masks)) // 2
    assert delay > 0, "The highlight must finish before the loop repeats."

    frames = []
    for tick in range(count):
        next(rainbow)
        base = colors(rainbow, flip=True)
        if tick == 0:
            first_colors = base
        mask = masks[tick - delay] if delay <= tick < delay + len(masks) else {}
        lines = []
        for y, line in enumerate(LOGO):
            rendered = ""
            for x, symbol in enumerate(line):
                if symbol == " ":
                    rendered += " "
                    continue
                strength = max(0, (mask.get((x, y), (128,))[0] - 128) / 127) * 0.85
                rgb = [round(c + (255 - c) * strength) for c in base[x, y]]
                rendered += f"\033[48;2;{rgb[0]};{rgb[1]};{rgb[2]}m \033[0m"
            lines.append(rendered + "\033[0m")
        frames.append(lines)

    next(rainbow)
    assert colors(rainbow, flip=True) == first_colors, "The rainbow loop must be seamless."
    assert any(max(rgb) == 255 for mask in masks for rgb in mask.values())
    assert frames[0] != frames[count // 2]
    expand = configure(Expand("\n".join(LOGO)))
    expand.effect_config.movement_speed = 0.35
    expand.effect_config.expand_easing = easing.out_cubic
    expansion = iter(expand)
    intro = []
    for _ in expansion:
        cells = [[" " for _ in range(WIDTH)] for _ in range(HEIGHT)]
        for character in expansion.terminal.get_characters():
            position = character.motion.current_coord
            rgb = first_colors[character.input_coord.column - 1, HEIGHT - character.input_coord.row]
            cells[HEIGHT - position.row][position.column - 1] = (
                f"\033[48;2;{rgb[0]};{rgb[1]};{rgb[2]}m \033[0m"
            )
        rendered = ["".join(row) + "\033[0m" for row in cells]
        # Cell rounding and completed paths can produce repeated frames. Do not hold them.
        if not intro or rendered != intro[-1]:
            intro.append(rendered)
    assert intro[-1] == frames[0], "Expansion must join the color loop without a jump."
    data = {"width": WIDTH, "height": HEIGHT, "intervalMs": 33, "frames": frames, "intro": intro}
    destination = Path(__file__).with_name("frames.json.gz")
    destination.write_bytes(gzip.compress(json.dumps(data, ensure_ascii=False).encode(), mtime=0))
    print(f"Generated {count} combined frames ({destination.stat().st_size} bytes).")


if __name__ == "__main__":
    generate()
