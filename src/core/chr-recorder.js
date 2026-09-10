// jsnes renders scanlines 21..260; screen row 0 is scanline 21.
const VISIBLE_SCANLINE_OFFSET = 21;
const PATTERN_BYTES = 0x2000;

/**
 * Records what the pattern tables held at each point down a frame.
 *
 * Reading `ppu.vramMem` once per frame is not enough, because tile data changes
 * *during* a frame in two different ways:
 *
 *   - A mapper swaps CHR banks. SMB3 raises an MMC3 IRQ partway down the screen
 *     and swaps to its status-bar tiles, so by the time a frame ends the
 *     playfield's tiles are gone and every character extracts as blank.
 *   - A CHR-RAM game writes new tile data through $2007. Cartridges with no
 *     CHR-ROM at all - UNROM ones like Castlevania - animate by rewriting tiles
 *     in place, and never call the mapper's bank routines.
 *
 * Both are intercepted here and both are treated the same way: whenever tile
 * memory is about to change, note the scanline. Extraction then asks for the
 * tiles as they were on the row where a given sprite was actually drawn.
 *
 * Snapshots are taken lazily, one per scanline that saw changes rather than one
 * per change. A CHR-RAM upload is thousands of consecutive byte writes; copying
 * 8KB for each of them would cost tens of megabytes a frame. Instead the copy
 * happens on the first change of the *next* affected scanline, at which point
 * the current contents are exactly the finished state of the previous one.
 */
class ChrRecorder {
  constructor(nes) {
    this.nes = nes;
    this.segments = [];
    this.dirtyScanline = null;
    this.installed = false;
  }

  /** Wrap the mapper and the PPU. Call once a ROM is loaded, so mmap exists. */
  install() {
    if (this.installed || !this.nes.mmap) {
      return this;
    }

    const recorder = this;
    const mmap = this.nes.mmap;

    for (const name of ['loadVromBank', 'load1kVromBank', 'load2kVromBank']) {
      if (typeof mmap[name] !== 'function') continue;

      const original = mmap[name].bind(mmap);
      mmap[name] = function wrapped(bank, address) {
        recorder.noteChange();
        return original(bank, address);
      };
    }

    // CHR-RAM: every write below $2000 is tile data.
    const ppu = this.nes.ppu;
    const originalWrite = ppu.writeMem.bind(ppu);
    ppu.writeMem = function wrapped(address, value) {
      if (address < PATTERN_BYTES) {
        recorder.noteChange();
      }
      return originalWrite(address, value);
    };

    this.installed = true;
    return this;
  }

  snapshot() {
    return this.nes.ppu.vramMem.slice(0, PATTERN_BYTES);
  }

  /** Start a new frame's record, seeded with whatever is in place right now. */
  beginFrame() {
    this.segments = [{ scanline: -Infinity, chr: this.snapshot() }];
    this.dirtyScanline = null;
  }

  /**
   * Called immediately *before* tile memory changes.
   *
   * If the previous run of changes was on an earlier scanline, the current
   * contents are that run's finished state, so this is the moment to keep it.
   */
  noteChange() {
    const scanline = this.nes.ppu.scanline;

    if (this.dirtyScanline !== null && this.dirtyScanline !== scanline) {
      this.segments.push({ scanline: this.dirtyScanline, chr: this.snapshot() });
    }

    this.dirtyScanline = scanline;
  }

  /** Keep the last run of changes, which nothing else will flush. */
  endFrame() {
    if (this.dirtyScanline === null) {
      return;
    }

    this.segments.push({ scanline: this.dirtyScanline, chr: this.snapshot() });
    this.dirtyScanline = null;
  }

  /** Pattern memory as it stood while `screenY` was being drawn. */
  chrForScreenRow(screenY) {
    if (this.segments.length === 0) {
      return null;
    }

    const scanline = screenY + VISIBLE_SCANLINE_OFFSET;
    let chosen = this.segments[0].chr;

    for (const segment of this.segments) {
      if (segment.scanline > scanline) break;
      chosen = segment.chr;
    }

    return chosen;
  }
}

ChrRecorder.VISIBLE_SCANLINE_OFFSET = VISIBLE_SCANLINE_OFFSET;
ChrRecorder.PATTERN_BYTES = PATTERN_BYTES;

module.exports = ChrRecorder;
