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

### 7. Smaller defects

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

### 8. One trap that was not a bug, and now cannot become one

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

Regenerate with `npm run fixtures`.

---

## Still to do

**Animation extraction.** Deferred by agreement. `--format animation` currently
reports that it is unimplemented rather than crashing. Doing it properly means
tracking metasprite identity across frames as the character moves and its pose
changes, which is a different problem from the single-frame grouping that
`--format metasprite` now does.

**Regenerate `examples/`.** Everything in there was produced by the broken
pipeline from the SMB3 attract screen. The sprite extractions in particular
show the background bleed described above. They need regenerating from real
gameplay - which is only possible now that input works - against a legally
obtained ROM. `examples/README.md` carries a note until then.

**Exercise a bank-switching mapper end to end.** `getPatternTile` is correct by
construction and covered against NROM, but no fixture yet swaps CHR banks mid
frame. Either a synthetic MMC3 fixture or a run against a real MMC3 cartridge
would close that gap.
