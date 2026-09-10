// jsnes renders scanlines 21..260; screen row 0 is scanline 21.
const VISIBLE_SCANLINE_OFFSET = 21;
const PATTERN_BYTES = 0x2000;

/**
 * Records what the pattern tables held at each point down a frame.
 *
 * Reading `ppu.vramMem` once per frame is not enough for cartridges that swap
 * CHR banks mid-frame, which is common: SMB3 raises an MMC3 IRQ partway down
 * the screen and swaps to its status-bar tiles, so by the time a frame ends the
 * playfield's tiles are gone. Sampling at the frame boundary gets the HUD's
 * banks and every character extracts as blank.
 *
 * So we wrap the mapper's bank-loading entry points and keep a snapshot of the
 * 8KB of pattern memory each time the banks change, tagged with the scanline it
 * took effect on. Extraction then asks for the tiles as they were on the row
 * where a given sprite was actually drawn.
 */
class ChrRecorder {
  constructor(nes) {
    this.nes = nes;
    this.segments = [];
    this.installed = false;
  }

  /** Wrap the mapper. Must be called after a ROM is loaded, so mmap exists. */
  install() {
    if (this.installed || !this.nes.mmap) {
      return this;
    }

    const mmap = this.nes.mmap;
    const recorder = this;

    for (const name of ['loadVromBank', 'load1kVromBank', 'load2kVromBank']) {
      if (typeof mmap[name] !== 'function') continue;

      const original = mmap[name].bind(mmap);
      mmap[name] = function wrapped(bank, address) {
        const result = original(bank, address);
        recorder.record();
        return result;
      };
    }

    this.installed = true;
    return this;
  }

  snapshot() {
    return this.nes.ppu.vramMem.slice(0, PATTERN_BYTES);
  }

  /** Start a new frame's record, seeded with whatever is banked in right now. */
  beginFrame() {
    this.segments = [{ scanline: -Infinity, chr: this.snapshot() }];
  }

  record() {
    const scanline = this.nes.ppu.scanline;
    const last = this.segments[this.segments.length - 1];

    // Several banks are usually swapped back to back on one scanline; only the
    // state after the last of them matters.
    if (last && last.scanline === scanline) {
      last.chr = this.snapshot();
      return;
    }

    this.segments.push({ scanline, chr: this.snapshot() });
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

module.exports = ChrRecorder;
