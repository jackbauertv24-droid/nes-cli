# Zelda examples

Generated from a Legend of Zelda (USA) (Rev 1) cartridge dump, which is **not**
in this repository. Regenerate against your own copy with:

```bash
node tools/make-zelda-examples.js /path/to/zelda.nes
```

## This one has to be played

The other two example sets are captured from attract-mode demos. Zelda has no
gameplay demo - its attract loop is the story text and a catalogue of items - so
Link has to be driven, and the game will not start until a save file exists.

Registering one is fiddly enough to be worth writing down, because the controls
are not what you would guess: the **D-pad drives the letter grid**, not the file
cursor, and the file cursor moves on **SELECT**.

```
START            title -> file select, cursor already on REGISTER YOUR NAME
START            -> name entry
A                types the letter under the grid cursor; one letter is a valid name
SELECT x3        moves the heart cursor down past the three file rows to REGISTER
START            registers, back to file select
START            begins the game on file 1
```

Extraction then has to hold a direction while it runs, or Link stands still for
every frame analysed and there is no animation to find. That is what `--hold` is
for:

```bash
nes-cli sprites --format animation --frames 150 --min-y 64 --hold RIGHT --output ./walk-right
```

## Walk cycles

| Directory | Contents |
|---|---|
| `walk-down/`, `walk-up/`, `walk-left/`, `walk-right/` | One animation clip per facing |
| `poses-down/` … `poses-right/` | Every distinct pose seen walking that way, as a sheet |
| `sprites/oam/`, `sprites/chr/` | Hardware sprites and both pattern tables at the starting screen |
| `zelda_title.png`, `zelda_start.png`, `zelda_start.txt` | Title and the first screen |
| `zelda_walk.gif`, `zelda_overworld.wav` | Four seconds of walking, six of the overworld theme |

Each walk clip reads `Ax2 Bx6 Ax6 Bx6 …` - a two-frame cycle held six frames a
step, which is Link's walk. `walk-left` and `walk-right` are the same art
mirrored, since the game flips the sprite rather than storing both.

## What this cartridge did and did not test

Zelda is **MMC1 (mapper 1)**, which was the reason for trying it - MMC1's CHR
paths had never run. They still have not: the cartridge is **CHR-RAM**, so
`vromCount` is zero and every mapper bank routine returns immediately. Measured
over 1200 frames of play: **0 mapper CHR bank calls, 8192 `$2007` tile writes**.
It exercises the same CHR-RAM path Castlevania does.

It is also **8x16** throughout, like both other cartridges, so the 8x8 sprite
path remains covered only by `test/fixtures/sprites8x8.nes`.

What it did contribute: it is the first game here with no demo, which is how the
`--hold` gap turned up. Nothing in the extraction itself was wrong.
