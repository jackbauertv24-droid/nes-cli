# Analysis and plan

A record of why the first version of nes-cli only partly worked, what the
evidence was, what has been fixed, and what is left.

Written after auditing the tree at commit `e828fea` against jsnes 1.2.1.

---

## The short version

Two mistakes account for almost everything.

**Controller input never worked.** `jsnes` exports its button constants as
`Controller.BUTTON_A`, but the code looked up `Controller.A`. Every button
resolved to `undefined`, so no press ever reached the emulator. Nothing could
get past a title screen, which is why every artifact in `examples/` - including
the file named `smb3_gameplay.png` - is the SMB3 title screen.

**The MMC3 diagnosis was wrong, and it forced a bad design.** The original
`TECHNICAL_FINDINGS.md` concluded that CHR bank switching made tile data
unrecoverable and that sprites therefore had to be scraped out of the rendered
framebuffer. In fact jsnes copies the active CHR bank into `ppu.vramMem` on
every bank switch, so live tile data was always available. Scraping the
framebuffer instead meant extracted sprites carried the background with them
and could not have real transparency.

---

## Findings

Each was reproduced against jsnes 1.2.1 before being fixed.

### 1. Controller input was a complete no-op

`src/core/emulator.js` called `this.nes.buttonDown(player, jsnes.Controller[button])`
with `button` being `'A'`, `'START'` and so on.

```
> jsnes.Controller['A']       -> undefined
> jsnes.Controller.BUTTON_A   -> 0
```

`nes.buttonDown(1, undefined)` sets `state[undefined]` on the controller
object, leaving all eight real entries at their released value:

```
after buttonDown(1,"A") controller1.state = [64,64,64,64,64,64,64,64]
stray junk key set: [ 'undefined' ]
```

Fixed: buttons are looked up in an explicit `BUTTONS` map built from the
`BUTTON_*` constants, and an unrecognised name now throws instead of silently
doing nothing. `test/input.test.js` drives a fixture ROM that latches the
controller port into zero page and asserts each of the eight buttons arrives.

A press also used to last exactly one frame (`buttonDown; run(1); buttonUp`),
which many games poll straight past. The default hold is now three frames, with
`--hold-frames` to override.

### 2. CHR bank switching was misdiagnosed

The claim was that tile numbers are meaningless because MMC3 re-banks CHR, so
sprite pixels had to come from the framebuffer.

What actually happens, in `jsnes/src/mappers.js`:

```js
loadVromBank: function (bank, address) {
  ...
  utils.copyArrayElements(this.nes.rom.vrom[...], 0, this.nes.ppu.vramMem, address, 4096);
  var vromTile = this.nes.rom.vromTile[...];
  utils.copyArrayElements(vromTile, 0, this.nes.ppu.ptTile, ...);
}
```

Every bank switch updates `ppu.vramMem` and `ppu.ptTile`. MMC3's 1KB and 2KB
bank routines do the same. So reading `ppu.vramMem[0x0000..0x1FFF]` gives the
tiles the PPU is drawing from *at this instant* - correct under any mapper, and
correct for CHR-RAM games, which have no CHR in the file at all.

The related note that `ptTile[i].pix` "is unreliable, mostly zeros" has a
simpler explanation: sprites usually live in pattern table 1, which is
`ptTile[index + 256]`. jsnes itself indexes it that way in `ppu.js`.

Fixed: `Emulator.getPatternTile(table, index)` reads live PPU memory. Sprite
extraction composites from colour indices and converts to RGB last.

### 3. Transparency was believed impossible

The original finding: palette entry 0 and entry 3 are both black on many NES
palettes, so transparent pixels cannot be told from outline pixels.

That is true *after* flattening to RGB, which is exactly what framebuffer
scraping does first. As colour **indices** they are never ambiguous - index 0
is the PPU's transparency slot and index 3 is a colour. Compositing from
indices and only resolving to RGB at write time makes the problem disappear.

Extracted sprites now have a real alpha channel, and
`test/sprites.test.js` asserts that no background colour appears in an
extracted sprite.

### 4. Sprite tile addressing ignored the pattern-table bit

In 8x16 mode, bit 0 of the OAM tile byte selects the pattern table and bits 7-1
select the tile pair. The old code did `tileIndex & 0xFE` and dropped bit 0
entirely, so every 8x16 sprite was read from table 0. In 8x8 mode the table
comes from PPUCTRL bit 3, which was not consulted either.

Fixed in `Emulator.resolveSpriteTiles`. The `sprites.nes` fixture uses tile byte
`$05` specifically so that ignoring bit 0 fails the test.

### 5. Audio was written at the wrong sample rate

jsnes generates at `opts.sampleRate`, which defaults to **48000**. The emulator
was constructed without passing it, and the WAV writer hardcoded 44100.

A two-second capture produced 95,845 samples - 47,922/s - written with a 44100
header. Every WAV played about 9% slow and reported its length as 2.17s.
`--sample-rate` made this worse: it changed only the header, never the
emulator.

Fixed: the rate is set on the emulator and the same value is written to the
header. `test/audio.test.js` asserts a one-second capture is one second long.

### 6. The documented CLI workflow could not run

`bin/nes-cli.js` kept the emulator in a module-level `currentEmulator`. Each
subcommand is a separate process, so the README's own example failed:

```
$ nes-cli load rom.nes
Loaded ROM: rom.nes
$ nes-cli run 60
No ROM loaded. Use "load" command first.
```

Fixed: `load` writes a session file, every other command restores it, operates,
and writes it back. `script` and `repl` still keep one emulator in memory and
skip the serialisation entirely.

### 7. CHR banks change partway down a frame

Found while validating the rewrite against the real SMB3 cartridge: after all
the fixes above, every extracted character still came out blank.

Reading `ppu.vramMem` once per frame is not enough. SMB3 raises an MMC3 IRQ
partway down the screen and swaps CHR so the status bar can have its own tiles.
Tracing one frame of level 1-1:

```
load1kVromBank addr=0x1000 scanline=6    <- playfield tiles in
load1kVromBank addr=0x1400 scanline=6
...
load1kVromBank addr=0x1400 scanline=214  <- status bar tiles in
load1kVromBank addr=0x1800 scanline=215
table 1 non-zero at end of frame: 0
```

Sixteen bank switches per frame. By the time the frame ends the playfield's
tiles are gone, so anything sampling at the frame boundary reads the status
bar's banks - and pattern table 1, where SMB3's character tiles live, is
entirely zero.

Fixed by `src/core/chr-recorder.js`, which wraps the mapper's bank-loading
entry points and keeps a snapshot of pattern memory each time the banks change,
tagged with the scanline it took effect on. `getPatternTile` takes an optional
screen row and returns the tiles that were in place while that row was drawn;
sprite extraction passes each sprite's own row. jsnes renders screen row 0 on
scanline 21, which is the offset between the two.

`--format chr` takes `--at-row` for the same reason.

### 8. Two kinds of false metasprite

Also found against the real ROM. Proximity grouping is transitive, so a line of
evenly spaced sprites chains into a single cluster - one extraction came out as
a screen-tall black smear. Separately, games park unused sprites off-screen and
often stack all of them at identical coordinates, which grouped into a cluster
of 64 sprites occupying one tile.

Both are now bounded: `--max-size` (default 64 pixels) rejects clusters too
large to be a character, and `--max-sprites` (default 16) rejects piles. The
PPU can only draw eight sprites per scanline, so a real composite character is
a handful.

### 9. CHR-RAM cartridges were unsupported in two ways

Found while preparing for a Castlevania ROM rather than from a bug report.
Castlevania is UNROM (mapper 2) with **CHR-RAM**: the cartridge carries no tile
data at all, and the game writes it into PPU memory at runtime. Two things were
wrong for that whole class of cartridge.

The recorder only wrapped the mapper's bank-loading routines, which a CHR-RAM
game never calls. Its record of a frame was therefore a single snapshot taken
before the frame ran. It now also wraps `ppu.writeMem` for addresses below
$2000, which is where $2007 writes to tile memory land.

Snapshotting on every such write would be ruinous - a tile upload is thousands
of consecutive byte writes, and copying 8KB for each would cost tens of
megabytes a frame. Snapshots are taken lazily instead: on the first change of a
*new* scanline, at which point the current contents are exactly the finished
state of the previous one. One copy per scanline that saw changes, however many
bytes were written.

The second problem was subtler and would have produced empty output rather than
an error. Pose identity was built from tile indices, offsets and attributes. A
CHR-RAM game animates by rewriting tile data while the index stays fixed, so
every frame of a walk cycle shares an identical key and collapses into one
pose. Verified against a fixture: before the fix the tracker found zero
animations in a character that visibly alternates between two forms.

Identity now includes a hash of the tile bytes themselves. For a CHR-ROM game,
where the index does determine the art, this agrees with the old key - the SMB3
examples regenerate identically.

### 10. Smaller defects

| Defect | Effect |
|---|---|
| `sprites --format animation` | crashed - `trackAnimations`, `extractAnimations` and `saveAnimations` were called but never defined. Now reports that it is unimplemented; see "Still to do". |
| OAM spritesheet used 8px cells for 16px sprites | rows overwrote each other, producing the noise visible in `examples/sprites/oam/spritesheet.png` |
| CHR extraction read the ROM file at a fixed offset | only ever bank 0, table 0, first 256 tiles; nothing at all for CHR-RAM games |
| `--fps` only multiplied the frame count; GIF delay was hardcoded to 1000/60 | recordings captured the wrong amount of time and played at the wrong speed |
| Duration regex `^(\d+)(s\|ms)$` | `1.5s`, `300` and `2m` silently fell back to the default |
| `package-lock.json` pinned to `mirrors.tencentyun.com` | `npm install` failed anywhere outside that network |
| `npm test` ran `jest`, which was not a dependency; `.gitignore` excluded `tests/` | no tests could run, or even be committed |
| `script rom.nes screenshot:x.png` | failed with "No frame captured yet" because loading did not render |
| Save-state "slots" held in an in-memory `Map` | always empty, since every command is a new process |
| Metasprite filter hardcoded `screenY > 140 && palette in {0,1}` | SMB3 title-screen tuning baked into library code |

### 11. One trap that was not a bug, and now cannot become one

`emulator.js` called `ppu.palTable.loadDefaultPalette()` after every ROM load.
jsnes deliberately leaves that call commented out in its own constructor,
because the legacy table it builds is packed `0xRRGGBB` while the framebuffer
convention is `0x00BBGGRR`. jsnes's own debug code labels `0x0000ff` as red.

The old `unpackRGB` read the high byte as red, which matched the legacy table -
so the two mistakes cancelled and the colours came out right, but locked to
jsnes's less accurate legacy palette. Anyone who fixed either half alone would
have swapped red and blue across every PNG, GIF and ANSI output.

Now: the `loadDefaultPalette` call is gone, jsnes's NTSC palette is used, and
all conversion goes through `src/core/color.js`. `test/palette.test.js` renders
a known red from a fixture ROM and fails if the byte order is ever inverted.
Colours shift slightly against the old output - a known red is now `(188,25,0)`
rather than `(219,43,0)` - because the NTSC palette is the more accurate one.

---

## Validation against a real cartridge

The rewrite was checked end to end against a Super Mario Bros. 3 dump (mapper 4,
MMC3). That run is what produced findings 7 and 8, neither of which the NROM
fixtures could have surfaced. Both are now covered by `banked.nes`, a synthetic
MMC3 fixture that reproduces the mid-frame swap without needing a commercial
ROM.

The best source of character sprites turned out to need no input at all: left
alone at the title screen, SMB3 runs a demo in which Mario and Luigi jump
around. Fifteen metasprites come out of it, including eight distinct 16x32
poses. This is the same scene the original version of this project spent its
whole git history fighting - it is now one command.

For the record, the input sequence that reaches gameplay - Mario starts on the
START panel, which is *below* the path, so he has to go right and then up
before A will enter level 1-1:

```
run 300; START; wait; START; wait    -> World 1 map
RIGHT; UP; A                         -> level 1-1
```

`tools/make-examples.js` automates it and regenerates `examples/`.

## Test fixtures

The suite needs ROMs, and commercial dumps cannot live in a public repository.
`tools/make-fixtures.js` generates them from 6502 source using the small
assembler in `tools/asm6502.js`:

| Fixture | Purpose |
|---|---|
| `solid.nes` | fills the screen with NES colour `$16`, a red - pins the framebuffer byte order |
| `input.nes` | strobes `$4016` each frame and shifts the eight button bits into `$0010` - lets a test read exactly which buttons arrived |
| `sprites.nes` | two 8x16 sprites from pattern table 1 over a distinct background - pins tile addressing, transparency and background bleed |
| `metasprite.nes` | a 16x32 character from four adjacent sprites, plus a lone HUD sprite - pins clustering and the filters |
| `banked.nes` | an MMC3 cartridge that swaps the CHR bank at $1000 partway down every frame, so the same tile index is different art at the top and bottom of the screen - pins finding 7 |
| `animation.nes` | a 16x32 character cycling three poses every eight frames while walking right - pins cross-frame tracking, hold durations and strip ordering |
| `chrram.nes` | a cartridge with no CHR-ROM that animates by rewriting tile data while the OAM tile byte never changes - pins finding 9 |

Regenerate with `npm run fixtures`.

---

## Still to do

**Cycle detection.** `--format animation` gives the full timeline in order but
does not try to find the repeating loop inside it. Mario's walk is plainly
`B,C,B,A` repeated, and pulling that out automatically would be useful - but it
is a guess, and a wrong one is hard to notice, so it was left out rather than
shipped as if it were certain.
