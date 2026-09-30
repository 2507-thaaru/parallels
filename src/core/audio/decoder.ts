let sharedContext: AudioContext | null = null;

function getSharedAudioContext(): AudioContext {
  if (!sharedContext || sharedContext.state === 'closed') {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedContext = new AudioContextClass();
  }
  return sharedContext;
}

/**
 * Decodes an audio ArrayBuffer (MP3, WAV, AAC, etc.) into an AudioBuffer.
 *
 * @param arrayBuffer - Raw audio file ArrayBuffer
 * @param context - Optional BaseAudioContext to use for decoding
 * @returns Promise resolving to the decoded AudioBuffer
 */
export async function decodeAudioData(
  arrayBuffer: ArrayBuffer,
  context?: BaseAudioContext
): Promise<AudioBuffer> {
  const ctx = context || getSharedAudioContext();
  
  // Note: slice(0) avoids detaching the original buffer in WebKit
  const bufferCopy = arrayBuffer.slice(0);
  
  return new Promise((resolve, reject) => {
    ctx.decodeAudioData(
      bufferCopy,
      (decoded) => resolve(decoded),
      (err) => reject(err || new Error('Failed to decode audio data'))
    );
  });
}

/**
 * Decodes a File or Blob into an AudioBuffer.
 */
export async function decodeAudioBlob(blob: Blob, context?: BaseAudioContext): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  return decodeAudioData(arrayBuffer, context);
}
