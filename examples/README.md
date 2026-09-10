# nes-cli examples

Generated from a Super Mario Bros. 3 (USA) cartridge dump, which is **not** in
this repository. Regenerate them against your own copy with:

```bash
node tools/make-examples.js /path/to/smb3.nes
```

Two captures are made: the title demo, and gameplay in level 1-1.

## Title demo

Left alone at the title screen, SMB3 runs a demo in which Mario and Luigi walk
on and jump around, followed by a leaf, a star, a mushroom and a goomba. No
buttons are pressed for this capture at all - it is the richest source of
character sprites in the game, and it needs nothing but patience.

| File | Description |
|---|---|
| `smb3_title.png` | The title screen at rest |
| `smb3_title_demo.png` | Frame 250, with Luigi mid-jump |
| `sprites-title-demo/contact-sheet.png` | Every extracted character on one sheet |
| `sprites-title-demo/metasprites/` | 15 metasprites: eight 16x32 Mario and Luigi poses, then the items |

The contact sheet is drawn on a checkerboard so the transparency is visible
rather than merely claimed. Each character is composited from pattern-table
colour indices, so there is no background in any of them.

## Gameplay

`tools/make-examples.js` navigates the World 1 map to level 1-1 and plays a
little way in. Worth recording, because the route is not obvious: Mario starts
on the START panel, which is *below* the path, so he has to go right and then up
before A will enter the level.

| File | Description |
|---|---|
| `smb3_map.png` | World 1 map |
| `smb3_gameplay.png` | Level 1-1 |
| `smb3_gameplay.txt` | The same frame as ASCII art |
| `smb3_gameplay.gif` | 4 seconds of play, 20fps |
| `smb3_gameplay.wav` | 5 seconds of audio, 48000 Hz mono |
| `sprites/oam/` | The hardware sprites on the captured frame, with alpha, plus `oam.json` |
| `sprites/metasprites/` | Composite characters: goomba, two Mario poses, speech bubble, raccoon Mario |
| `sprites/chr/` | Both pattern tables as sheets, in greyscale and each sprite palette |

The `chr/` sheets were captured **as banked on screen row 100**, the playfield.
SMB3 swaps CHR banks partway down every frame so its status bar can have its own
tiles; sampling at the end of a frame instead returns the status bar's tiles and
the character tiles come out blank. See `TECHNICAL_FINDINGS.md`.
