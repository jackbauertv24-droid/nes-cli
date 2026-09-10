# Super Mario Bros. examples

Generated from a Super Mario Bros. cartridge dump, which is **not** in this
repository. Regenerate against your own copy with:

```bash
node tools/make-smb1-examples.js /path/to/smb1.nes
```

No input at all. Left alone the game alternates between its title screen and a
demo that plays World 1-1 - real gameplay, with Mario walking, jumping and
eventually dying. Boundaries were measured, not guessed: the title paints a
brown panel across the middle of the screen and the demo does not, so one pixel
tells them apart.

```
frames   33- 542   title screen
frames  543-1320   demo of World 1-1
frames 1321-1824   title again, then it repeats
```

## Why this cartridge mattered

It is the only one of the four with **8x8 sprites** - SMB3, Castlevania and
Zelda are all 8x16 - so Mario is four hardware sprites in a 16x16 box rather
than two in a 16x32 one. It is also NROM with **fixed CHR-ROM**: tile data never
moves, so there are no bank switches and no `$2007` writes, which is a third
tile-source mode again distinct from the other two.

It broke two things, both of them assumptions tuned on 8x16 content.

**The clustering gap was too loose.** The default was 8 pixels, chosen without
measurement. 8x8 sprites sit closer together, so 8 pixels was enough to weld
Mario to a floating score popup and produce 33 and 35 pixel wide "characters".
Measured across all four cartridges, a gap of 0 - meaning touching, which is how
a composite character is actually built - was never worse and twice better.

**Blank padding sprites were counted as part of the character.** Small Mario is
eight sprites, but four of them are tile `$FC`, which draws nothing; the game
allocates a fixed block and blanks what it does not need. Nothing in their OAM
entries marks them out. The result was a 16x32 Mario with an empty top half.
Sprites whose tiles are entirely transparent are now dropped before grouping,
and Mario comes out at his true 16x16.

## Contents

| File | Description |
|---|---|
| `smb1_title.png` | Title screen |
| `smb1_gameplay.png`, `smb1_gameplay.txt` | World 1-1 mid-demo, and as ASCII |
| `smb1_gameplay.gif`, `smb1_gameplay.wav` | Five seconds of the demo, six of audio |
| `sprites/metasprites/` | Every distinct pose, individually and as sheets |
| `sprites/animations/clip-000/` | Mario followed across the demo, in order |
| `sprites/oam/`, `sprites/chr/` | Hardware sprites and both pattern tables |

`sprites/chr/` needs no `--at-row` here. On the other cartridges that argument
matters because the tiles differ down the screen; on NROM there is only ever one
set.
