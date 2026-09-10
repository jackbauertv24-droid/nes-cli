const fs = require('fs');

/**
 * Save states are plain JSON of jsnes's own serialisation.
 *
 * There is deliberately no in-memory "slot" store: every CLI subcommand is a
 * separate process, so a Map held in memory was always empty by the time
 * anything tried to read from it.
 */
class StateManager {
  static save(state, filePath) {
    fs.writeFileSync(filePath, JSON.stringify(state));
    return filePath;
  }

  static load(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
}

module.exports = StateManager;
