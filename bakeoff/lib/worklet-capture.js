// bakeoff/lib/worklet-capture.js
// Runs on the audio thread. Posts Float32 mono frames (128 samples each) to main thread.
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
