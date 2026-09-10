// scripts/sim/adb.mjs — thin adb / emulator helpers for the P4 simulation harness.
import { spawn, execFileSync } from 'node:child_process';

const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || `${process.env.LOCALAPPDATA}\\Android\\Sdk`;
export const ADB = `${SDK}\\platform-tools\\adb.exe`;
export const EMU = `${SDK}\\emulator\\emulator.exe`;

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Synchronous adb call; throws on non-zero exit (stderr included in the error message).
export const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, maxBuffer: 64 * 1024 * 1024 }).trim();

// Boot the AVD detached so the harness can outlive / be independent of it. Returns the child (pid used for cleanup).
export function bootEmulator(avd, { headless = true } = {}) {
  const args = ['-avd', avd, '-no-snapshot', '-no-boot-anim', '-gpu', 'swiftshader_indirect', '-camera-back', 'virtualscene'];
  if (headless) args.push('-no-window');
  const child = spawn(EMU, args, { stdio: 'ignore', detached: true, windowsHide: true });
  child.unref();
  return child;
}

export async function waitForBoot(timeoutMs = 300000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { if (adb('shell', 'getprop', 'sys.boot_completed') === '1') return Date.now() - t0; } catch {}
    await sleep(3000);
  }
  throw new Error(`emulator did not boot within ${timeoutMs / 1000}s`);
}

// NOTE: the emulator console wants LONGITUDE first, then latitude.
export const geoFix = (lat, lng) => adb('emu', 'geo', 'fix', String(lng), String(lat));

export function grantAll(pkg) {
  for (const p of ['CAMERA', 'RECORD_AUDIO', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) {
    try { adb('shell', 'pm', 'grant', pkg, `android.permission.${p}`); } catch (e) { console.warn(`grant ${p} failed: ${e.message.split('\n')[0]}`); }
  }
}
export const install = (apk) => adb('install', '-r', '-g', apk);
export const launch = (pkg) => adb('shell', 'am', 'start', '-W', '-n', `${pkg}/.MainActivity`);
export const stop = (pkg) => adb('shell', 'am', 'force-stop', pkg);

export function findWebViewSocket(pkg) {
  const pid = adb('shell', 'pidof', pkg).split(/\s+/)[0];
  if (!pid) throw new Error(`${pkg} is not running`);
  const lines = adb('shell', 'cat', '/proc/net/unix').split('\n');
  const hit = lines.find(l => l.includes(`webview_devtools_remote_${pid}`));
  if (!hit) throw new Error(`no webview devtools socket for pid ${pid}; is webContentsDebuggingEnabled?`);
  return `webview_devtools_remote_${pid}`;
}
export const forward = (port, socket) => adb('forward', `tcp:${port}`, `localabstract:${socket}`);
export const unforward = (port) => { try { adb('forward', '--remove', `tcp:${port}`); } catch {} };

export const setNetwork = (on) => { adb('shell', 'svc', 'wifi', on ? 'enable' : 'disable'); adb('shell', 'svc', 'data', on ? 'enable' : 'disable'); };
export const logcat = (pattern, last = 40) => {
  const out = adb('logcat', '-d', '-t', '4000');
  const re = new RegExp(pattern);
  return out.split('\n').filter(l => re.test(l)).slice(-last);
};
export function killEmulator(child) {
  try { adb('emu', 'kill'); } catch {}
  if (child?.pid) { try { process.kill(child.pid); } catch {} }
}
