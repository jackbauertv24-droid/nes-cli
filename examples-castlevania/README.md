# Castlevania examples

Generated from a Castlevania (USA) (Rev A) cartridge dump, which is **not** in
this repository. Regenerate against your own copy with:

```bash
node tools/make-castlevania-examples.js /path/to/castlevania.nes
```

**No buttons are pressed at any point.** Left alone, Castlevania cycles between
its title screen and a playable demo of Stage 12, and the demo is where
everything is. The frame numbers in the generator come from measuring that cycle
rather than guessing - the status bar's sprite on screen row 23 exists only
during the demo, which gives exact boundaries:

```
frames    1- 702   title screen
frames  703-2096   demo: Simon walking, whipping, enemies, items
frames 2097-2783   title screen again, then it repeats
```

## Why this cartridge is a different test from SMB3

Castlevania is **UNROM (mapper 2) with CHR-RAM**. There is no tile data in the
ROM file at all - the game writes it into PPU memory as it runs, and rewrites it
in place to animate. Extraction that reads the file, or that only watches a
mapper's bank switches, finds nothing here.

It also **rotates every character through a fresh block of OAM slots on every
frame**, which is how the game spreads sprite flicker so no one object is
always the one dropped. Simon's slots run `[19,23,38,53]`, then
`[17,21,36,51,55]`, then `[20,24,31,35,…]` on consecutive frames. Identity that
leans on OAM slots has nothing to hold onto, and the demo loses Simon entirely
for six to twelve frames at a time when the screen gets busy.

## Screen

| File | Description |
|---|---|
| `cv_title.png` | Title screen |
| `cv_gameplay.png` | Stage 12, mid-demo |
| `cv_whip.png` | Simon attacking, whip extended |
| `cv_gameplay.txt` | A frame as ASCII art |
| `cv_gameplay.gif` | 5 seconds of the demo, 20fps |
| `cv_gameplay.wav` | 6 seconds of audio, 48000 Hz mono |

## Sprites

`sprites/metasprites/sheet-palette0.png` is Simon: eight poses - standing,
walking, crouching, kneeling. `sheet-palette1.png` holds his whip and several
enemies, which share that palette. The whip is worth noticing: it is a chain of
separate hardware sprites, so when it is out it clusters together with Simon and
the combined group is much larger than a character normally is.

`sprites/animations/clip-000/` is the good one - 47 cells over 395 frames and 17
distinct poses, Simon walking and whipping in order. The remaining clips are
enemies and items, which appear briefly and so have little to show.

`sprites/chr/` is both pattern tables as banked on screen row 120. Because this
is CHR-RAM, those sheets are the tiles the *game uploaded*, not anything read
from the cartridge.

## A caveat on the tracking

Since slot identity is useless here, characters are followed by position. That
mostly works, but a few cells of `clip-000` show a different figure: where Simon
vanishes for several frames and another character is standing near where he was,
the track can pick up the wrong one. `--max-move` and `--max-misses` tighten or
loosen this. There is no perfect answer available from OAM alone.
