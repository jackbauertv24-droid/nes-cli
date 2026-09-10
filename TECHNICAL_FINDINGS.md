# Technical notes: NES sprite extraction

What is actually true about pulling sprites out of a running NES, learned the
hard way. An earlier version of this document drew the opposite conclusion on
its central point; see `ANALYSIS.md` for how that happened.

## Read tiles from PPU memory, not from the ROM file

Reading CHR at a file offset only works for cartridges that never switch banks.
Anything with a mapper - MMC1, MMC3, and most of the library - swaps CHR banks
during a frame, so tile 177 during one scene is different art from tile 177
during another.

The fix is not to give up on tile data. jsnes copies the active bank into
`ppu.vramMem` on every switch, so:

```js
// $0000-$0FFF is pattern table 0, $1000-$1FFF is table 1.
const base = table * 0x1000 + index * 16;
const lowByte  = ppu.vramMem[base + y];
const highByte = ppu.vramMem[base + y + 8];
```

always reflects what the PPU is drawing right now. This also works for CHR-RAM
games, which have no CHR data in the ROM file at all.

`ptTile[i].pix` is populated too, and is not unreliable - but sprites usually
live in pattern table 1, which is `ptTile[i + 256]`. Indexing `ptTile[i]` for a
sprite tile reads the background table and generally finds blanks.

## Tile data can be RAM

Not every cartridge carries tile data. UNROM boards - Castlevania, Mega Man,
Metal Gear and plenty more - have no CHR-ROM at all: the pattern tables are RAM,
and the game uploads tiles through $2007 as it runs. Nothing in the ROM file
holds the art, so any extraction that reads the file finds nothing.

This also changes what "animation" looks like. A CHR-ROM game animates by
pointing a sprite at different tile indices; a CHR-RAM game usually animates by
rewriting the tile data underneath a *fixed* index. So a pose identity built
from tile numbers, offsets and attributes will see one unchanging pose through
an entire walk cycle. Identity has to include what the tile actually contains -
hash the bytes.

## Sample the pattern tables at the right scanline, not at the frame boundary

Reading pattern memory once per frame is still not enough, because bank
switching does not only happen between frames. A cartridge can raise a mapper
IRQ partway down the screen and swap CHR so that different horizontal strips
draw from different banks. SMB3 does exactly this to give its status bar its
own tiles - sixteen bank switches per frame in level 1-1, the playfield's tiles
loaded around scanline 6 and the status bar's around scanline 214.

The consequence is blunt: once a frame has finished, the playfield's tiles are
gone. Pattern table 1, where SMB3 keeps its character tiles, reads as entirely
zero, and every character extracts as a blank image.

So snapshot pattern memory whenever it changes, tag each snapshot with the
scanline it took effect on, and when extracting a sprite ask for the snapshot
covering that sprite's own row. In jsnes, wrap `mmap.loadVromBank`,
`load1kVromBank` and `load2kVromBank` for bank switching, and `ppu.writeMem`
below $2000 for CHR-RAM writes; screen row 0 is scanline 21, so
`scanline = screenY + 21`.

Take those snapshots lazily. A CHR-RAM tile upload is thousands of consecutive
byte writes, and copying 8KB on each one costs tens of megabytes a frame. Copy
on the first change of a *new* scanline instead: at that moment the current
contents are exactly the finished state of the previous scanline. One copy per
scanline that changed, no matter how many bytes moved.

The same applies to dumping the pattern tables wholesale: "the CHR" is not one
thing, it is a thing that depends on where down the screen you look.

## Composite from colour indices, not from the framebuffer

It is tempting to copy the rendered pixels under a sprite's bounding box. Do
not. The framebuffer has already resolved everything to RGB, so:

- the background behind and around the sprite comes with it, and
- palette entry 0 (transparent) and entry 3 (often an outline) are both black
  on many NES palettes, so once flattened they are indistinguishable.

Work in colour indices instead. Index 0 is the PPU's transparency slot and is
never ambiguous with index 3, whatever colours they resolve to. Convert to RGB
only when writing the file, and write index 0 as alpha 0.

## Sprite size is one global setting, not a per-sprite one

PPUCTRL bit 5 chooses 8x8 or 8x16 for **all 64 sprites at once**. A game cannot
draw some sprites at one size and some at the other in the same frame.

This is worth stating because the obvious inference from watching a game is the
wrong one. Mario growing after a mushroom is not a sprite that changed size: it
is a character that went from a 16x16 metasprite to a 16x32 one by using more
hardware sprites. The size setting is untouched. The same is true of every
character that appears to change dimensions.

For extraction that means a growth transition shows up as two different
metasprites, which is correct - they are genuinely different poses - and the
cluster bounding box changes, so a size bound has to be loose enough for the
larger form.

The setting *can* be changed between frames, or in principle partway down one,
which would be the same trap as mid-frame CHR banking. In practice it is not:
measured over 7500 frames of three cartridges, the size in force while the
visible area was drawn never once differed from the value present at the end of
the frame - even for Castlevania, which writes PPUCTRL about twice a frame and
changed the size mid-render on 106 of 2500 frames. Reading it at extraction time
is safe.

## Sprite tile addressing

**8x8 mode.** The pattern table comes from PPUCTRL bit 3. The tile byte is the
whole index.

**8x16 mode.** Bit 0 of the tile byte selects the pattern table; bits 7-1 select
a tile pair. So tile byte `$05` means table 1, tiles 4 and 5 - not tile 5.
PPUCTRL bit 3 is ignored entirely in this mode.

```js
if (is8x16) {
  return { table: tileByte & 1, tiles: [tileByte & 0xfe, (tileByte & 0xfe) + 1] };
}
return { table: ppuctrlBit3, tiles: [tileByte] };
```

A vertical flip of an 8x16 sprite mirrors all sixteen rows, which swaps the two
tiles as well as reversing each one.

## OAM layout

Four bytes per sprite, 64 sprites:

| Byte | Meaning |
|---|---|
| 0 | Y position, stored as `screenY - 1` |
| 1 | Tile index (see above) |
| 2 | Attributes: bits 0-1 palette, bit 5 priority, bit 6 flip H, bit 7 flip V |
| 3 | X position |

The Y offset is real: the PPU adds one back when it draws. Games hide unused
sprites by parking them at Y >= `$EF`, so a decoder should treat those as
invisible - and a test fixture should park them there too, or 62 stray sprites
appear across the top of the screen.

Lower OAM index means higher priority. When compositing overlapping sprites,
draw from the highest index down so low indices land on top.

## Sprite palettes

Sprite palettes live at `$3F10`, `$3F14`, `$3F18`, `$3F1C`. Entry 0 of each
mirrors the universal background colour at `$3F00` and is never drawn.

Palette assignment is game logic, not a convention. It changes from scene to
scene, so "palette 0 is the player" holds only for as long as the game feels
like it. Treat `--palettes` as a filter you tune per scene, not as an identity.

## Framebuffer byte order

jsnes packs each pixel as `0x00BBGGRR` - **red is the low byte**. This is easy
to get backwards, because `PaletteTable`'s own `getRed`/`getBlue` helpers read
the bytes the other way round and only stay self-consistent internally.

Two independent confirmations inside jsnes: its debug code labels `0x0000ff` as
red, and its canvas path ORs the packed value straight into a little-endian
RGBA word. Also note that `palTable.loadDefaultPalette()` builds a table in the
*opposite* order to the framebuffer convention, which is why jsnes leaves that
call commented out in its own constructor. Do not call it.

## Audio

jsnes generates samples at `opts.sampleRate`, defaulting to 48000 - not 44100.
Whatever writes the WAV header has to use the same number the emulator was
constructed with, or the file plays at the wrong pitch and misreports its
length.

## Following a character between frames

Three signals are available and each fails on some cartridge.

**OAM slots.** Many games keep a character in the same slots for as long as it
lives, which makes slot overlap a strong identity signal. But games that draw
more sprites than the PPU can show on a scanline rotate slots every frame, so
that the object dropped by the hardware differs each time and everything appears
to flicker rather than one object vanishing. Castlevania does this: Simon's
slots run `[19,23,38,53]`, `[17,21,36,51,55]`, `[20,24,31,35,…]` on consecutive
frames. Overlap is zero, permanently.

**Palette.** A good hint, and a bad rule. A group's dominant palette depends on
what is in the group, and a character's own attachments may use another palette
- Simon is palette 0, his whip is a chain of palette-1 sprites, and when the
whip is out the combined group's majority flips.

**Position.** Always available, and the only one that survives both. Use it as
the gate and the other two as preferences: require a candidate to be within
reach, then prefer shared slots and a matching palette among those that are.

Make the reach grow while a character is missing. Games drop sprites when the
screen is busy - Castlevania's demo loses Simon for six to twelve frames at a
time - and a character keeps moving while it is not being drawn.

## Grouping sprites into characters

Characters are several hardware sprites side by side, so grouping by proximity
is the right instinct - but a flood fill is transitive, and that has two failure
modes worth guarding against explicitly.

A line of evenly spaced sprites - a row of coins, a fence, a scrolling strip -
chains into one cluster spanning the screen. Bound the bounding box; a character
is small.

Games hide unused sprites by parking them off-screen, and often park all of them
at identical coordinates. Those stack into a cluster of dozens of sprites
occupying a single tile. Bound the member count too: the PPU draws at most eight
sprites per scanline, so a real composite character is a handful, not sixty.

## Where to find characters

Reaching gameplay is not always the quickest way to collect a game's sprites.
Attract and demo modes exist to show characters off, animate them through
several poses, and need no input at all - SMB3's title screen walks Mario and
Luigi on and jumps them around before parading a leaf, a star, a mushroom and a
goomba past. Waiting is cheaper than navigating a menu, and the poses are more
varied than a few seconds of play will give you.

## Extraction recipe

1. Run to the scene you want. Sprite extraction is a snapshot; pattern tables
   and palettes both change as the game runs.
2. Decode OAM, discarding sprites parked at Y >= `$EF`.
3. Resolve each tile byte to a table and tile pair for the current sprite size.
4. Read those tiles from the pattern-table snapshot covering the sprite's own
   screen row, applying the flip bits.
5. Group sprites by proximity to find composite characters, bounding both the
   size of a cluster and the number of sprites in it.
6. Composite back-to-front, skipping colour index 0.
7. Resolve to RGB and write, with index 0 as alpha 0.
