const fs = require('fs');
const path = require('path');

class StateManager {
  constructor() {
    this.states = new Map();
  }

  save(state, filePath) {
    const data = JSON.stringify(state, null, 2);
    fs.writeFileSync(filePath, data);
    return filePath;
  }

  load(filePath) {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  }

  quickSave(slot, state) {
    this.states.set(slot, state);
    return slot;
  }

  quickLoad(slot) {
    return this.states.get(slot);
  }
}

module.exports = StateManager;
