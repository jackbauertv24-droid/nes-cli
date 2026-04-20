# NES ROM Resources & Testing Guide

## Legal Considerations

### ⚠️ Important Warning
Downloading copyrighted ROMs (like official Super Mario Bros, Zelda, etc.) may be illegal in many jurisdictions. 

### Legal Options

| Source | Type | Legal Status | Notes |
|--------|------|--------------|-------|
| **Homebrew Games** | Original creations | ✅ Fully legal | Free, community-made NES games |
| **Test ROMs** | Development tools | ✅ Fully legal | Used for emulator testing |
| **Your own cartridges** | Personal dumps | ✅ Legal (in most regions) | Dump ROMs from cartridges you own |
| **Public domain ROMs** | Abandoned/open | ✅ Legal | Games released into public domain |
| **Commercial ROMs** | Copyrighted games | ⚠️ Potentially illegal | Requires ownership of original media |

---

## Legal NES ROM Sources

### 1. GitHub Homebrew Projects

| Repository | Description | URL |
|------------|-------------|-----|
| **RoboRun-NES** | Platform game in Assembly/C | https://github.com/jones-hm/roborun-nes |
| **fnes-intro** | NES intro demo | https://github.com/jakubito/fnes-intro |

### 2. itch.io Homebrew Games

| Game | Author | Type | URL |
|------|--------|------|-----|
| **NES Mario - Windows Zone Mod** | SuperJamesWorld | Fangame | https://superjamesworld.itch.io/nes-mario |
| **Mario Fangame (NES Remake)** | WilliamBurke | Level recreation | https://williamburke.itch.io/mario-nes-remake |
| **Mario Bros Clone** | Zokidawa | 1986 clone | https://zokidawa.itch.io/mario-bros |
| **NES Super Mario Bros Wonder** | Team Omnistar | Fangame | https://team-omnistar.itch.io/nessuper-mario-bros-wonder |
| **Polly Mario Bros** | PollySoft | SMB1 fangame | https://socksmakepeoplesexy.itch.io/polly-mario-bros |
| **Super Excitebike** | Jordan Greydanus | Racing clone | https://jordangreydanus.itch.io/super-excitebike |
| **Kart Racer '86** | blackbirddev | Mario Kart demake | https://blackbirddev.itch.io/mariokart86 |
| **The Wit.nes** | dustmop | Puzzle demake | https://dustmop.itch.io/the-witnes |
| **L'Abbaye des Morts** | Parisoft | Platformer port | https://parisoft.itch.io/abbaye-nes |
| **Circus C-Jagura** | Ikishi_Mario | NES platformer | https://tails-mario10.itch.io/circus-c-jagura-nes |
| **Super Ikishi** | Ikishi_Mario | NES platformer | https://tails-mario10.itch.io/super-ikishi |

### 3. NES Test ROMs (Emulator Development)

| Test ROM | Purpose | Source |
|----------|---------|--------|
| **nestest.nes** | CPU instruction tests | https://github.com/christopherpow/nes-test-roms |
| **ppu_vbl_nmi** | PPU timing tests | Same repo |
| **sprite_hit_tests** | Sprite 0 hit tests | Same repo |
| **apu_reset** | APU initialization tests | Same repo |

Full test ROM collection: https://github.com/christopherpow/nes-test-roms

---

## Using nes-cli to Test ROMs

### Installation

```bash
cd /root/opencode-workspace/emu
npm install
```

### Basic Commands

```bash
# Load and run a ROM
node bin/nes-cli.js load game.nes

# Run with frames
node bin/nes-cli.js load game.nes --frames 600

# Take screenshot
node bin/nes-cli.js load game.nes --frames 100 --screenshot screen.png
```

### Screen Recording (10 seconds = 600 frames)

**GIF Animation:**
```bash
node bin/nes-cli.js script game.nes \
  run:600 \
  record:gif:10s:gameplay.gif
```

**PNG Sequence:**
```bash
node bin/nes-cli.js script game.nes \
  run:600 \
  record:png-sequence:10s:./frames/
```

**ASCII Art (text output):**
```bash
node bin/nes-cli.js script game.nes \
  run:600 \
  record:ascii:10s:gameplay.txt
```

**ANSI Colors (terminal):**
```bash
node bin/nes-cli.js script game.nes \
  run:600 \
  record:ansi:10s:gameplay.ansi
```

### Audio Recording

```bash
node bin/nes-cli.js script game.nes \
  run:600 \
  audio:10s:audio.wav
```

### Sprite Extraction

```bash
node bin/nes-cli.js script game.nes \
  run:300 \
  sprites:./sprites/
```

Outputs:
- `sprites/oam.json` - Live sprite data from OAM
- `sprites/chr_spritesheet.png` - All CHR ROM tiles
- `sprites/chr/*.png` - Individual 8x8 tiles

### Controller Input

```bash
# Press button
node bin/nes-cli.js input A

# Button sequence (macro)
node bin/nes-cli.js input --sequence "START,RIGHT,RIGHT,A" --delay 100

# Hold button
node bin/nes-cli.js input A --hold --duration 500
```

### Debug Dump

```bash
# CPU registers
node bin/nes-cli.js dump cpu

# PPU registers
node bin/nes-cli.js dump ppu

# Sprite memory (OAM)
node bin/nes-cli.js dump oam

# Memory range
node bin/nes-cli.js dump mem --range 0x0000-0x00FF
```

### Interactive REPL Mode

```bash
node bin/nes-cli.js repl

> load game.nes
> run 100
> screenshot
> sprites --format all
> audio --duration 5s
> dump cpu
> exit
```

### Batch Script Execution

Create `script.txt`:
```
load game.nes
run 120
screenshot frame1.png
input START
run 600
record gif 10s gameplay.gif
audio wav 10s music.wav
sprites all ./sprites/
```

Run:
```bash
node bin/nes-cli.js batch script.txt
```

---

## Example: Testing a Homebrew ROM

### RoboRun-NES Example

```bash
# Download from GitHub
git clone https://github.com/jones-hm/roborun-nes.git

# Find the .nes file in the repo
# Usually in: roborun-nes/bin/ or roborun-nes/dist/

# Test with nes-cli
node bin/nes-cli.js script roborun.nes \
  run:600 \
  record:gif:10s:roborun_demo.gif \
  audio:10s:roborun_audio.wav \
  sprites:./roborun_sprites/
```

### Test ROM Example (nestest.nes)

```bash
# Download test ROM
wget https://github.com/christopherpow/nes-test-roms/raw/master/other/nestest.nes

# Run and analyze
node bin/nes-cli.js script nestest.nes \
  run:1000 \
  dump:cpu \
  screenshot:nestest_frame.png
```

---

## Output Formats Reference

| Format | Extension | Use Case | Size Estimate |
|--------|-----------|----------|---------------|
| PNG | `.png` | High quality screenshots | ~7-20 KB each |
| GIF | `.gif` | Animated playback | ~300-500 KB for 10s |
| PNG Sequence | `.png` files | Frame-by-frame analysis | 600 files × ~10 KB |
| ASCII | `.txt` | Terminal display | ~50-100 KB |
| ANSI | `.ansi` | Colored terminal | ~100-200 KB |
| WAV | `.wav` | Audio recording | ~500 KB per 10s |
| JSON | `.json` | Sprite/memory data | ~10-50 KB |

---

## Quick Reference Card

### Frame Timing
| Duration | Frames @ 60fps |
|----------|----------------|
| 1 second | 60 frames |
| 5 seconds | 300 frames |
| 10 seconds | 600 frames |
| 30 seconds | 1800 frames |
| 1 minute | 3600 frames |

### NES Specifications
| Parameter | Value |
|-----------|-------|
| Screen resolution | 256 × 240 pixels |
| Frame rate | 60 fps (NTSC) |
| Color palette | 64 colors |
| Sprites | 64 sprites (max 8 per scanline) |
| Tile size | 8 × 8 pixels |
| CHR ROM | 8 KB per bank |
| Audio | 5 channels (2 square, 1 triangle, 1 noise, 1 DMC) |

---

## Repository Links

- **nes-cli source**: https://github.com/jackbauertv24-droid/nes-cli
- **jsnes engine**: https://github.com/bfirsh/jsnes
- **NES test ROMs**: https://github.com/christopherpow/nes-test-roms
- **NESDev wiki**: https://www.nesdev.org/wiki/Nesdev_Wiki

---

## Legal Disclaimer

This document is for educational purposes only. Always respect copyright laws in your jurisdiction. The nes-cli tool is designed for:

1. Testing homebrew/original NES games
2. Emulator development and debugging
3. Educational study of NES architecture
4. Personal use with legally obtained ROMs

**Do not use for piracy or unauthorized distribution of copyrighted games.**