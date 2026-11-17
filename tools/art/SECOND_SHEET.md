# Second Trooper action sheet

## What to give your image generator

1. `tools/art/source/trooper_action_sheet.png` (the Unit-7 sheet): the **style and character** reference.
2. `tools/art/source/sheet2_template.png`: the **pose and layout** reference.
3. This prompt:

> Create a character action sheet of the same character as in the first image (Unit-7: spiky black hair with a red streak, white chest armour, orange shoulder pad on his left shoulder, black combat suit, white knee and shin guards, white boots), in exactly the same hand-drawn comic style: bold dark ink outlines, flat cel shading, no pixel art.
>
> Follow the layout and poses of the second image: 5 rows, every figure facing RIGHT, one figure per slot, evenly spaced, same size in every frame (full body, about the same height in every standing pose).
> Row 1: run cycle, 8 frames. Row 2: idle, side view, holding a glowing cyan energy sword low in a ready stance, 4 near-identical breathing frames. Row 3: forward roll, 6 frames (crouch, 4 tumbling, standing up). Row 4: sword combo, 9 frames: three swings of wind-up, strike, follow-through. The sword is a glowing cyan energy blade (white-hot core, cyan glow) in every frame, with a cyan slash trail only on strike frames. Row 5: wall slide with one hand on the wall, wall-jump kick-off, airborne after the kick (3 frames).
>
> Background: one flat, solid chroma green (#00B140) everywhere. No text, no labels, no arrows, no walls, ladders, sparks, shadows or floor. Figures must not touch or overlap each other.

Tips: if the generator struggles with 30 figures, ask for one row per image (same prompt, "only row N"). The extractor reads the rows top to bottom, so you can stack the row images into one tall image. Keep the green background.

## Dropping it into the game

```bash
python3 -I tools/art/grid_extract.py path/to/sheet2.png build/cut
python3 -I tools/art/sheet_extract.py tools/art/source/trooper_action_sheet.png build/cut   # first sheet (once)
python3 -I tools/art/assemble_trooper.py build/cut public/assets
```

`grid_extract.py` prints the number of figures it found per row. Expected: `[8, 4, 6, 9, 3]`. Any frames it finds replace the first sheet's run, idle, roll, saber and wall frames; everything else (jump, shoot, hurt, death, ledge) keeps the first sheet's art. Or just send the image to Claude.
