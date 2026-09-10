# nes-cli examples

Generated from a Super Mario Bros. 3 (USA) cartridge dump, which is **not** in
this repository. Regenerate them against your own copy with:

```bash
node tools/make-examples.js /path/to/smb3.nes
```

That script navigates the World 1 map to level 1-1 and plays a little way in,
so everything here is real gameplay.

## Screen

| File | Description |
|---|---|
| `smb3_title.png` | Title screen |
| `smb3_map.png` | World 1 map |
| `smb3_gameplay.png` | Level 1-1 |
| `smb3_gameplay.txt` | The same frame as ASCII art |
| `smb3_gameplay.gif` | 4 seconds of play, 20fps |
| `smb3_gameplay.wav` | 5 seconds of audio, 48000 Hz mono |

## Sprites

`sprites/oam/` holds the hardware sprites present on the captured frame, each
with a real alpha channel, plus `oam.json` describing position, tile, palette
and flip flags.

`sprites/metasprites/` holds composite characters recovered by grouping sprites
that sit together and recur across frames - the goomba, two Mario poses, the
map's speech bubble, and raccoon Mario. Each is one PNG with transparency.

`sprites/chr/` holds both pattern tables as sheets, in greyscale and in each of
the four sprite palettes. These were captured **as banked on screen row 100**,
the playfield. SMB3 swaps CHR banks partway down every frame so its status bar
can have its own tiles; sampling at the end of a frame instead returns the
status bar's tiles and the character tiles come out blank. See
`TECHNICAL_FINDINGS.md`.
