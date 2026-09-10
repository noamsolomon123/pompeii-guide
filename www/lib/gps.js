// www/lib/gps.js
export class Gps {
  constructor(onFix) { this.onFix = onFix; this.id = null; this.last = null; }
  start() {
    if (!navigator.geolocation) return;
    this.id = navigator.geolocation.watchPosition(
      (p) => { this.last = { pos: [p.coords.latitude, p.coords.longitude], acc: p.coords.accuracy, t: Date.now() }; this.onFix?.(this.last); },
      () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  }
  stop() { if (this.id !== null) navigator.geolocation.clearWatch(this.id); this.id = null; }
}
