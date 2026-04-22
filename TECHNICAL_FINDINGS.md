# Technical Findings: NES Sprite Extraction

This document summarizes discoveries made while implementing sprite extraction for nes-cli.

## MMC3 Mapper and CHR Bank Switching

**Problem:** Static CHR-ROM reading gives wrong tile data.

**Discovery:** SMB3 uses MMC3 mapper which dynamically swaps CHR banks during gameplay. Tile index 177 at frame 1800 contains different pixel data than tile 177 at frame 300.

**Solution:** Read sprite pixels directly from framebuffer instead of static CHR-ROM.

**Evidence:**
- Frame 1800: Tile 177 showed turtle/enemy sprite data
- Frame 300: Tile 53,55,49,51 showed Mario sprite data
- Tile numbers are meaningless without knowing active CHR bank

**jsnes Issue:** The `ptTile[tileIndex].pix` array is unreliable/unpopulated. Most tiles showed mostly zeros when queried directly.

## NES Palette Design

**Problem:** Sprite extraction appeared as black rectangles.

**Discovery:** NES palette design has both palette[0] (transparent) and palette[3] (sprite outline) as RGB(0,0,0) black. Can't distinguish transparent pixels from sprite outline by RGB color matching.

**Solution:** Keep ALL pixels from framebuffer region (no transparency filtering by RGB).

**Palette Examples from SMB3:**
```
Palette 0: [RGB(0,0,0), RGB(219,43,0), RGB(255,191,179), RGB(0,0,0)]
Palette 1: [RGB(0,0,0), RGB(79,223,75), RGB(255,191,179), RGB(0,0,0)]
Palette 2: [RGB(0,0,0), RGB(255,155,59), RGB(255,255,255), RGB(0,0,0)]
Palette 3: [RGB(0,0,0), RGB(79,223,75), RGB(255,255,255), RGB(0,0,0)]
```

Note: Index 0 and 3 are both black in all palettes.

## NES OAM Y-Offset

**Problem:** Sprite positions were off by 1 pixel vertically.

**Discovery:** NES OAM stores y-1 in the Y coordinate field. Screen position = OAM_y + 1.

**Fix:** Use `screenY = oam_y + 1` for all position calculations.

## 8x16 Sprite Mode

**Discovery:** SMB3 uses 8x16 sprite mode (`f_spriteSize = 1`). Each sprite is 2 tiles stacked vertically.

**Tile Selection Rule:**
- If tile index is EVEN: top tile = tile, bottom tile = tile+1
- If tile index is ODD: top tile = tile-1, bottom tile = tile

**Example:** Sprite with tile=177 (odd):
- Top half: Tile 176
- Bottom half: Tile 177

## Screen Edge Clipping

**Problem:** Extracted sprites appeared cut off or empty.

**Discovery:** SMB3 title screen animation has Mario and Luigi entering from screen edges.

**Evidence:**
- Luigi enters from left (x=0-16 at early frames)
- Mario enters from right (x=240-256 at early frames)
- When sprites cross screen boundary (x>=256), pixels are not rendered

**Best Extraction Frames:**
- Frame 300: Mario at x=117-133 (center, fully visible)
- Frame 210: Luigi at x=42-58 (entering from left, partial)
- Frame 900: Mario with tail power-up, Luigi, and turtle enemy

## iNES Header Parsing

**Discovery:** Correct CHR-ROM offset calculation:

```
chrOffset = 16 (header) + trainerSize (512 if present) + prgSize (header[4] * 16384)
```

**SMB3 Values:**
- PRG ROM: 16 pages = 262,144 bytes
- CHR ROM: 16 pages = 131,072 bytes
- CHR offset: 16 + 262,144 = 262,160

## Sprite Palette Assignment

**Discovery:** Different sprites use different palettes based on game logic, not fixed assignment.

**SMB3 Observations:**
- Palette 0: Often Mario or red-colored sprites
- Palette 1: Often Luigi or green-colored sprites
- Palette 2: Often orange/white sprites (enemies, items)
- Palette 3: Often green/white sprites

**Important:** Palette assignment changes dynamically. Can't assume palette 0 = Mario.

## jsnes Library Issues

**Unreliable Features:**
- `ptTile[index].pix` - mostly zeros, not properly populated
- `ptTile` array doesn't reflect MMC3 CHR bank switching

**Working Features:**
- `frameBuffer` - correct rendered screen pixels
- `getOAM()` - correct sprite positions and attributes
- `getSpritePalette(index)` - correct palette colors
- Audio sample generation

## Recommended Extraction Approach

1. **Don't use CHR-ROM** for runtime sprites (MMC3 bank switching)
2. **Read framebuffer pixels** at sprite positions
3. **Keep all pixels** including black (palette[0] and palette[3] both black)
4. **Filter by screen position** - ignore UI area (y < 150)
5. **Wait for characters in center** before extracting (avoid edge clipping)
6. **Group sprites by proximity** to form composite characters

## Frame Timeline for SMB3 Title Screen

| Frame | Time | Description | Best Extraction |
|-------|------|-------------|-----------------|
| 300 | 5s | Mario in center | Mario (16x32) |
| 210 | 3.5s | Luigi entering left | Luigi partial (16x32) |
| 900 | 15s | Mario with tail, Luigi, turtle | All three characters |
| 1800 | 30s | Two turtles | Enemies only |

## File Format Notes

**PNG:** Use RGBA, alpha=255 for all sprite pixels (no transparency)

**GIF:** Works correctly with jsnes framebuffer colors

**WAV:** 44100Hz mono, jsnes generates audio samples correctly

## Lessons Learned

1. Debug visually - create images showing sprite positions on framebuffer
2. Don't assume tile numbers are stable (MMC3 changes them)
3. NES hardware quirks matter (y-1 offset, 8x16 mode, palette design)
4. User feedback is essential - initial assumptions about "Mario tiles" were wrong
5. Frame timing matters - characters move and enter from edges