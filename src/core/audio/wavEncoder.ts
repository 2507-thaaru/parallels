/**
 * Encodes audio channel data (Float32Array per channel) into a 16-bit linear PCM WAV ArrayBuffer.
 *
 * @param channels - Array of Float32Array channel data (e.g. [left, right])
 * @param sampleRate - Sample rate in Hz
 * @returns ArrayBuffer containing the full WAV file binary data
 */
export function encodeWavArrayBuffer(
  channels: Float32Array[],
  sampleRate: number
): ArrayBuffer {
  const numChannels = channels.length;
  if (numChannels === 0) {
    throw new Error('encodeWav requires at least one audio channel');
  }

  const numSamples = channels[0].length;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  // Helper to write ASCII string to DataView
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // ChunkSize
  writeString(8, 'WAVE');

  // "fmt " sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample (16-bit)

  // "data" sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true); // SubChunk2Size

  // Interleave channels and convert float32 to int16 PCM
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      // Clamp between -1.0 and 1.0
      let sample = channels[ch][i];
      if (sample > 1.0) sample = 1.0;
      else if (sample < -1.0) sample = -1.0;

      // Scale to 16-bit signed integer [-32768, 32767]
      const intSample = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, Math.round(intSample), true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

/**
 * Encodes an AudioBuffer into a standard 16-bit PCM WAV Blob.
 */
export function encodeAudioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const channels: Float32Array[] = [];

  for (let i = 0; i < numChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  const arrayBuffer = encodeWavArrayBuffer(channels, audioBuffer.sampleRate);
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
