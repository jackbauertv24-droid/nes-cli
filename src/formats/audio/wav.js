const fs = require('fs');

class WAVHandler {
  /**
   * Write 16-bit mono PCM.
   *
   * The sample rate written here must be the rate the emulator actually
   * generated at. They used to differ - samples came out of jsnes at 48000
   * while the header claimed 44100 - which made every capture play about 9%
   * slow and misreported its duration.
   */
  static writeWAV(samples, filePath, sampleRate) {
    if (!sampleRate) {
      throw new Error('writeWAV requires the sample rate the audio was generated at');
    }

    const numChannels = 1;
    const bitsPerSample = 16;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = samples.length * 2;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);

    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * blockAlign, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);

    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const clamped = Math.max(-1, Math.min(1, samples[i]));
      buffer.writeInt16LE(Math.round(clamped * 32767), offset);
      offset += 2;
    }

    fs.writeFileSync(filePath, buffer);
    return filePath;
  }
}

module.exports = WAVHandler;
