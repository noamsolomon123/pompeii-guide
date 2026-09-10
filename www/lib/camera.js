// www/lib/camera.js
export class Camera {
  constructor(videoEl) { this.video = videoEl; this.stream = null; }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    this.video.srcObject = this.stream; await this.video.play();
  }
  stop() { this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; this.video.srcObject = null; }
  // JPEG data URL, longest side ≤ 1024 px.
  captureFrame() {
    const v = this.video;
    if (!v?.videoWidth) throw new Error('no frame yet');   // camera still warming up → canvas would be blank/0×0
    const max = 1024, k = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  }
}
