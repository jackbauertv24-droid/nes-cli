# NES CLI Emulator

A headless NES emulator for the command line with screen recording, sprite extraction, and audio capture capabilities.

## Features

- **Pure JavaScript** - No native dependencies, runs on any Node.js environment
- **Headless Mode** - Run entirely in-memory without display
- **Screen Recording** - Record gameplay as PNG sequences, GIF, ASCII, or ANSI art
- **Sprite Extraction** - Extract OAM sprites, CHR ROM tiles, and composite metasprites
- **Metasprite Analysis** - Detect composite characters (Mario, enemies) from gameplay
- **Audio Capture** - Record gameplay audio as WAV files
- **Save States** - Save and load emulator states
- **Interactive REPL** - Control emulator interactively
- **Debug Tools** - Dump CPU/PPU registers and memory

## Installation

```bash
npm install
```

## Usage

### Quick Start

```bash
# Auto-load and run a ROM
node bin/nes-cli.js rom.nes

# Run for 1000 frames and take screenshot
node bin/nes-cli.js rom.nes --frames 1000 --screenshot out.png
```

### Commands

#### Load ROM
```bash
node bin/nes-cli.js load rom.nes
node bin/nes-cli.js load rom.nes --frames 1000
```

#### Run/Step
```bash
node bin/nes-cli.js run --frames 60
node bin/nes-cli.js step --frames 1
```

#### Screenshot
```bash
node bin/nes-cli.js screenshot
node bin/nes-cli.js screenshot --output frame.png
node bin/nes-cli.js screenshot --format ascii --output frame.txt
node bin/nes-cli.js screenshot --format ansi --output frame.ansi
```

#### Screen Recording
```bash
# PNG sequence
node bin/nes-cli.js record --format png-sequence --duration 5s --output ./frames/

# GIF
node bin/nes-cli.js record --format gif --duration 10s --output gameplay.gif

# ASCII art
node bin/nes-cli.js record --format ascii --duration 3s --output gameplay.txt

# ANSI colors
node bin/nes-cli.js record --format ansi --duration 3s --output gameplay.ansi
```

#### Controller Input
```bash
# Single button
node bin/nes-cli.js input A
node bin/nes-cli.js input START

# Hold button
node bin/nes-cli.js input A --hold --duration 500

# Sequence
node bin/nes-cli.js input --sequence "U,U,R,A,START" --delay 100
```

#### Sprite Extraction
```bash
# Extract all sprites (CHR + OAM)
node bin/nes-cli.js sprites --format all --output ./sprites/

# CHR ROM tiles (256 tiles from ROM)
node bin/nes-cli.js sprites --format chr --output ./sprites/chr

# OAM sprites (currently visible on screen)
node bin/nes-cli.js sprites --format oam --output ./sprites/oam

# Metasprite extraction (composite characters from gameplay)
node bin/nes-cli.js sprites --format metasprite --output ./metasprites --frames 120

# Animation tracking (sprite sequences over time)
node bin/nes-cli.js sprites --format animation --output ./animations --frames 240

# With individual PNG files
node bin/nes-cli.js sprites --format chr --output ./sprites --individual

# Adjust clustering parameters
node bin/nes-cli.js sprites --format metasprite --frames 180 --max-gap 16 --min-sprites 2
```

**Sprite Formats:**
- `chr` - CHR ROM tiles (256 tiles, 8x8 each) - raw sprite data from ROM
- `oam` - OAM sprites - currently visible sprites on screen at runtime
- `metasprite` - Composite sprites - multiple tiles forming a character (Mario, enemies)
- `animation` - Animation sequences - sprite frames tracked over time

**Metasprite Analysis:**
Metasprites are composite sprites made of multiple 8x8 tiles that form a complete character (like Mario, Goombas, etc). The analyzer clusters nearby sprites and extracts them as single images.

```bash
# Track Mario during gameplay
node bin/nes-cli.js load smb3.nes
node bin/nes-cli.js run 300
node bin/nes-cli.js input START
node bin/nes-cli.js run 180
node bin/nes-cli.js sprites --format metasprite --frames 120 --output ./mario_sprites
```

Output includes:
- `metasprite_XXX.png` - Composite sprite images
- `metasprites.json` - Metadata with dimensions, tile IDs, occurrence counts

#### Audio Recording
```bash
node bin/nes-cli.js audio --format wav --duration 30s --output music.wav
node bin/nes-cli.js audio --format pcm --duration 10s
node bin/nes-cli.js audio --format json --duration 5s
```

#### Save/Load State
```bash
node bin/nes-cli.js save-state --slot 1
node bin/nes-cli.js save-state --output state.json
node bin/nes-cli.js load-state --slot 1
node bin/nes-cli.js load-state --input state.json
```

#### Debug Dumps
```bash
node bin/nes-cli.js dump --cpu
node bin/nes-cli.js dump --ppu
node bin/nes-cli.js dump --memory --range 0x0000-0x00FF
node bin/nes-cli.js dump --oam
```

### REPL Mode

```bash
node bin/nes-cli.js repl
```

Interactive commands:
```
nes-cli> load rom.nes
nes-cli> run 60
nes-cli> screenshot
nes-cli> sprites --format png
nes-cli> audio --format wav --duration 10s
nes-cli> save 1
nes-cli> exit
```

### Batch Mode

Create a script file `script.txt`:
```
load rom.nes
run 120
screenshot frame1.png
input A
run 60
screenshot frame2.png
sprites --format all
audio --format wav --duration 5s
```

Run it:
```bash
node bin/nes-cli.js batch script.txt
```

## Project Structure

```
nes-cli/
├── bin/
│   └── nes-cli.js              # CLI entry point
├── src/
│   ├── core/
│   │   ├── emulator.js         # jsnes wrapper
│   │   └── state.js            # State management
│   ├── commands/
│   │   ├── load.js
│   │   ├── run.js
│   │   ├── screenshot.js
│   │   ├── record.js
│   │   ├── input.js
│   │   ├── sprites.js
│   │   ├── audio.js
│   │   ├── state.js
│   │   └── dump.js
│   ├── formats/
│   │   ├── image/
│   │   │   ├── png.js
│   │   │   ├── ascii.js
│   │   │   ├── spritesheet.js
│   │   │   └── metasprite.js    # Metasprite analysis
│   │   ├── video/
│   │   │   └── gif.js
│   │   ├── audio/
│   │   │   └── wav.js
│   │   └── data/
│   │       └── json-csv.js
│   ├── repl/
│   │   └── shell.js
│   └── utils/
│       └── file.js
└── package.json
```

## License

MIT
