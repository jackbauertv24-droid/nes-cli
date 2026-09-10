const Emulator = require('../core/emulator');

/**
 * Parse a capture length into a frame count.
 *
 * Accepts seconds ("10s", "1.5s"), milliseconds ("500ms"), minutes ("2m"),
 * an explicit frame count ("900f"), or a bare number read as frames. The
 * previous parser only matched whole seconds or milliseconds and silently
 * fell back to its default for anything else, so "1.5s" quietly became 5s.
 */
function parseDurationFrames(duration, fallbackFrames) {
  if (typeof duration === 'number' && Number.isFinite(duration)) {
    return Math.max(1, Math.round(duration));
  }

  const text = String(duration == null ? '' : duration).trim().toLowerCase();
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|f)?$/);
  if (!match) {
    throw new Error(
      `Cannot parse duration "${duration}". Use e.g. 10s, 1.5s, 500ms, 2m, or 900f.`
    );
  }

  const value = parseFloat(match[1]);
  const unit = match[2] || 'f';

  switch (unit) {
    case 'ms':
      return Math.max(1, Math.round((value / 1000) * Emulator.NTSC_FPS));
    case 's':
      return Math.max(1, Math.round(value * Emulator.NTSC_FPS));
    case 'm':
      return Math.max(1, Math.round(value * 60 * Emulator.NTSC_FPS));
    default:
      return Math.max(1, Math.round(value));
  }
}

/** Frames -> seconds of emulated time, for reporting. */
function framesToSeconds(frames) {
  return frames / Emulator.NTSC_FPS;
}

module.exports = { parseDurationFrames, framesToSeconds };
