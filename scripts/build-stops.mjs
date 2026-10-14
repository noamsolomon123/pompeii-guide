#!/usr/bin/env node
// scripts/build-stops.mjs
// Builds www/stops.json from content/stops/*.json, applying optional GPS/name
// overrides and validating the result against the P2 content schema.
//
// Usage:
//   node scripts/build-stops.mjs [--src content/stops] [--out www/stops.json]
//     [--overrides content/gps-overrides.json] [--names content/names.json] [--check]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversineM } from '../www/lib/geo.js';
import { stripTags, findTags, tagProblems } from '../www/lib/tts-tags.js';

export { haversineM };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

export const REQUIRED_KEYS = [
  'id', 'order', 'optional', 'name_he', 'name_en', 'regio',
  'gps', 'gps_quality', 'hours', 'status', 'cues', 'open30', 'deep',
  'look_for', 'next_nav', 'faq', 'sources',
];
export const ALLOWED_EXTRA_KEYS = ['anecdotes', 'notes', 'tts_style'];
// Fields the guide speaks aloud; only these may carry Gemini 3.8 inline tags (see docs/superpowers/specs/tts-tags-guide.md).
export const SPOKEN_FIELDS = ['open30', 'deep', 'look_for', 'next_nav'];
const MAX_TAGS = { open30: 3, deep: 6, look_for: 1, next_nav: 0 };
export const OUTPUT_KEYS = [
  'id', 'order', 'optional', 'name_he', 'name_en', 'regio',
  'gps', 'gps_quality', 'hours', 'status', 'cues', 'open30', 'deep',
  'look_for', 'next_nav', 'faq', 'anecdotes', 'sources',
];

const BBOX = { latMin: 40.745, latMax: 40.757, lngMin: 14.474, lngMax: 14.500 }; // lngMin covers Villa dei Misteri (extra moenia)
const NON_OPTIONAL_ORDER_SET = Array.from({ length: 24 }, (_, i) => i + 1);
const REPLACEMENT_CHAR = '�';
const NIQQUD_RE = /[ְ-ׇ]/;
const LATIN_RE = /[A-Za-z]/;
const DIGIT_RE = /[0-9]/;
const PAREN_RE = /[()]/;
const GPS_MIN_SEPARATION_M = 60;
const MAX_CONSECUTIVE_ROUTE_GAP_M = 500;

// --- pure helpers -----------------------------------------------------

export function wordCount(text) {
  if (typeof text !== 'string') return 0;
  const t = text.trim();
  if (t === '') return 0;
  return t.split(/\s+/).length;
}

export function applyOverrides(stops, overrides, names) {
  return stops.map((stop) => {
    let next = stop;
    if (overrides && typeof overrides === 'object') {
      for (const key of Object.keys(overrides)) {
        if (key.startsWith('_')) continue;
        if (key !== stop.id) continue;
        const ov = overrides[key];
        if (!ov || typeof ov !== 'object') continue;
        next = { ...next };
        if ('gps' in ov) next.gps = ov.gps;
        if ('gps_quality' in ov) next.gps_quality = ov.gps_quality;
      }
    }
    if (names && typeof names === 'object' && Object.prototype.hasOwnProperty.call(names, stop.id)) {
      next = { ...next, name_he: names[stop.id] };
    }
    return next;
  });
}

function collectFfffdPaths(value, pathStr, out) {
  if (typeof value === 'string') {
    if (value.includes(REPLACEMENT_CHAR)) out.push(pathStr);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectFfffdPaths(v, `${pathStr}[${i}]`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) collectFfffdPaths(value[k], pathStr ? `${pathStr}.${k}` : k, out);
  }
}

export function validateStops(stops) {
  const errors = [];
  const warnings = [];
  const err = (id, field, problem) => errors.push(`${id}: ${field}: ${problem}`);

  const idsSeen = new Map(); // id -> count
  const nonOptionalOrders = [];
  const nonOptionalOrderIds = new Map(); // order -> [ids]

  for (const stop of stops) {
    const id = stop && typeof stop.id === 'string' ? stop.id : '(unknown id)';

    // required keys
    for (const key of REQUIRED_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(stop, key)) {
        err(id, key, 'missing required key');
      }
    }
    // extra keys
    for (const key of Object.keys(stop)) {
      if (!REQUIRED_KEYS.includes(key) && !ALLOWED_EXTRA_KEYS.includes(key)) {
        err(id, key, 'unexpected extra key (only anecdotes, notes, tts_style allowed)');
      }
    }

    // id
    if (typeof stop.id !== 'string' || stop.id === '') {
      err(id, 'id', 'must be a non-empty string');
    } else {
      idsSeen.set(stop.id, (idsSeen.get(stop.id) || 0) + 1);
      if (stop.__filenameId && stop.__filenameId !== stop.id) {
        err(id, 'id', `does not match filename ${stop.__filenameId}.json`);
      }
    }

    // order
    if (typeof stop.order !== 'number' || Number.isNaN(stop.order)) {
      err(id, 'order', 'must be numeric');
    } else if (stop.optional !== true) {
      nonOptionalOrders.push(stop.order);
      if (!nonOptionalOrderIds.has(stop.order)) nonOptionalOrderIds.set(stop.order, []);
      nonOptionalOrderIds.get(stop.order).push(id);
    }

    // optional
    if (typeof stop.optional !== 'boolean') {
      err(id, 'optional', 'must be a boolean');
    } else if (stop.optional !== true && typeof stop.order === 'number' && !NON_OPTIONAL_ORDER_SET.includes(stop.order)) {
      err(id, 'optional', `order ${stop.order} is outside 1..24, stop must be marked optional: true`);
    }

    // name_he
    if (typeof stop.name_he !== 'string' || stop.name_he === '') {
      err(id, 'name_he', 'must be a non-empty string');
    } else {
      if (PAREN_RE.test(stop.name_he)) err(id, 'name_he', 'contains parentheses');
      if (DIGIT_RE.test(stop.name_he)) err(id, 'name_he', 'contains digits');
      if (LATIN_RE.test(stop.name_he)) err(id, 'name_he', 'contains Latin letters');
      if (NIQQUD_RE.test(stop.name_he)) err(id, 'name_he', 'contains Hebrew niqqud');
    }

    // gps / gps_quality
    if (stop.gps !== null) {
      if (!Array.isArray(stop.gps) || stop.gps.length !== 2 || stop.gps.some((n) => typeof n !== 'number' || Number.isNaN(n))) {
        err(id, 'gps', 'must be null or [lat, lng]');
      } else {
        const [lat, lng] = stop.gps;
        if (lat < BBOX.latMin || lat > BBOX.latMax || lng < BBOX.lngMin || lng > BBOX.lngMax) {
          err(id, 'gps', `out of Pompeii bbox: [${lat}, ${lng}]`);
        }
      }
    }
    if (!(stop.gps_quality === 'exact' || stop.gps_quality === 'approx' || stop.gps_quality === null)) {
      err(id, 'gps_quality', 'must be "exact", "approx", or null');
    }

    // Gemini 3.8 inline tags: valid syntax in spoken fields, none anywhere else
    for (const field of SPOKEN_FIELDS) {
      if (typeof stop[field] !== 'string') continue;
      for (const p of tagProblems(stop[field])) err(id, field, p);
      const spoken = stripTags(stop[field]);
      if (LATIN_RE.test(spoken)) err(id, field, 'contains Latin letters (spoken aloud; name_en is on screen)');
      if (PAREN_RE.test(spoken)) err(id, field, 'contains parentheses (spoken aloud)');
      const n = findTags(stop[field]).length;
      if (n > MAX_TAGS[field]) warnings.push(`${id}: ${field}: ${n} tags, guide max ${MAX_TAGS[field]}`);
    }
    for (const field of ['name_he', 'cues', 'faq', 'anecdotes']) {
      const vals = Array.isArray(stop[field]) ? stop[field] : [stop[field]];
      if (vals.some((v) => typeof v === 'string' && /[<>]/.test(v))) err(id, field, 'tags are only allowed in spoken fields');
    }
    if ('tts_style' in stop && (typeof stop.tts_style !== 'string' || stop.tts_style.trim() === '' || /[<>]/.test(stop.tts_style))) {
      err(id, 'tts_style', 'must be a non-empty plain string');
    }

    if (typeof stop.open30 === 'string' && /שאעמיק/.test(stop.open30)) {
      err(id, 'open30', 'ends with a depth offer; the app speaks "רוצים שאעמיק?" itself');
    }

    // word counts (tags are not words)
    const open30Count = wordCount(stripTags(stop.open30));
    if (typeof stop.open30 !== 'string' || open30Count < 60 || open30Count > 110) {
      err(id, 'open30', `word count ${open30Count} outside 60-110`);
    }
    const deepCount = wordCount(stripTags(stop.deep));
    const deepEmpty = typeof stop.deep === 'string' && stop.deep.trim() === '';
    if (typeof stop.deep !== 'string') {
      err(id, 'deep', 'must be a string');
    } else if (deepEmpty) {
      if (stop.optional !== true) err(id, 'deep', 'is empty, only allowed for optional stops');
    } else if (deepCount < 200 || deepCount > 320) {
      err(id, 'deep', `word count ${deepCount} outside 200-320`);
    }

    // next_nav
    if (typeof stop.next_nav !== 'string' || stop.next_nav.trim() === '') {
      err(id, 'next_nav', 'must be non-empty');
    } else if (!stripTags(stop.next_nav).endsWith('.')) {
      err(id, 'next_nav', 'must end with "."');
    }

    // cues
    if (!Array.isArray(stop.cues) || stop.cues.length < 3 || stop.cues.length > 10 || stop.cues.some((c) => typeof c !== 'string')) {
      err(id, 'cues', 'must be an array of 3-10 strings');
    }

    // faq
    if (!Array.isArray(stop.faq) || stop.faq.length > 8 || stop.faq.some((f) => typeof f !== 'string')) {
      err(id, 'faq', 'must be an array of 0-8 strings');
    }

    // sources
    if (!Array.isArray(stop.sources) || stop.sources.length < 1) {
      err(id, 'sources', 'must have at least 1 source');
    }

    // U+FFFD anywhere in this stop
    const badPaths = [];
    collectFfffdPaths(stop, '', badPaths);
    for (const p of badPaths) err(id, p || '(root)', 'contains U+FFFD replacement character');
  }

  // duplicate ids
  for (const [dupId, count] of idsSeen) {
    if (count > 1) err(dupId, 'id', `duplicate id used by ${count} stops`);
  }

  // duplicate order among non-optional stops
  for (const [order, ids] of nonOptionalOrderIds) {
    if (ids.length > 1) {
      for (const dupIdEntry of ids) {
        err(dupIdEntry, 'order', `duplicate order ${order}, shared with ${ids.filter((i) => i !== dupIdEntry).join(', ')}`);
      }
    }
  }

  // non-optional order set must be exactly 1..24
  const sortedNonOptional = [...nonOptionalOrders].sort((a, b) => a - b);
  const expected = NON_OPTIONAL_ORDER_SET;
  const setsMatch = sortedNonOptional.length === expected.length
    && sortedNonOptional.every((v, i) => v === expected[i]);
  if (!setsMatch) {
    err('(all)', 'order', `non-optional orders must be exactly 1..24, got [${sortedNonOptional.join(', ')}]`);
  }

  // warnings: gps too close (non-optional stops)
  const withGps = stops.filter((s) => s.optional !== true && Array.isArray(s.gps) && s.gps.length === 2);
  for (let i = 0; i < withGps.length; i++) {
    for (let j = i + 1; j < withGps.length; j++) {
      const d = haversineM(withGps[i].gps, withGps[j].gps);
      if (d < GPS_MIN_SEPARATION_M) {
        warnings.push(`${withGps[i].id}/${withGps[j].id}: gps: ${d.toFixed(1)}m apart, below ${GPS_MIN_SEPARATION_M}m`);
      }
    }
  }

  // warnings: consecutive route stops farther than 500m (sorted by order, all stops with gps)
  const sortedByOrder = [...stops]
    .filter((s) => typeof s.order === 'number' && Array.isArray(s.gps) && s.gps.length === 2)
    .sort((a, b) => a.order - b.order);
  for (let i = 0; i < sortedByOrder.length - 1; i++) {
    const a = sortedByOrder[i];
    const b = sortedByOrder[i + 1];
    const d = haversineM(a.gps, b.gps);
    if (d > MAX_CONSECUTIVE_ROUTE_GAP_M) {
      warnings.push(`${a.id}/${b.id}: gps: ${d.toFixed(0)}m apart in route order, above ${MAX_CONSECUTIVE_ROUTE_GAP_M}m`);
    }
  }

  // warnings: approx gps quality
  for (const stop of stops) {
    if (stop.gps_quality === 'approx') {
      warnings.push(`${stop.id}: gps_quality: approx`);
    }
  }

  return { errors, warnings };
}

// --- IO -----------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    src: 'content/stops',
    out: 'www/stops.json',
    overrides: 'content/gps-overrides.json',
    names: 'content/names.json',
    check: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') args.check = true;
    else if (a === '--src') args.src = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--overrides') args.overrides = argv[++i];
    else if (a === '--names') args.names = argv[++i];
  }
  return args;
}

function readStopsDir(srcDir) {
  const abs = path.resolve(process.cwd(), srcDir);
  const files = fs.readdirSync(abs).filter((f) => f.endsWith('.json')).sort();
  const stops = [];
  const parseErrors = [];
  for (const file of files) {
    const filenameId = file.slice(0, -'.json'.length);
    const full = path.join(abs, file);
    const raw = fs.readFileSync(full, 'utf8');
    try {
      const json = JSON.parse(raw);
      Object.defineProperty(json, '__filenameId', { value: filenameId, enumerable: false });
      stops.push(json);
    } catch (e) {
      parseErrors.push(`${filenameId}: (file)parse: invalid JSON: ${e.message}`);
    }
  }
  return { stops, parseErrors };
}

function readJsonIfExists(p) {
  const abs = path.resolve(process.cwd(), p);
  if (!fs.existsSync(abs)) return null;
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

// The app gets clean text: tags are for the MP3 render only (it reads content/stops directly).
export function toOutputStop(stop) {
  const out = {};
  for (const key of OUTPUT_KEYS) {
    if (key === 'anecdotes') {
      if (Object.prototype.hasOwnProperty.call(stop, 'anecdotes')) out.anecdotes = stop.anecdotes;
      continue;
    }
    out[key] = SPOKEN_FIELDS.includes(key) && typeof stop[key] === 'string' ? stripTags(stop[key]) : stop[key];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { stops: rawStops, parseErrors } = readStopsDir(args.src);

  const overrides = readJsonIfExists(args.overrides);
  const names = readJsonIfExists(args.names);
  const stops = applyOverrides(rawStops, overrides, names);

  const { errors, warnings } = validateStops(stops);
  const allErrors = [...parseErrors, ...errors];

  if (allErrors.length > 0) {
    console.error('Errors:');
    for (const e of allErrors) console.error(`  ${e}`);
  }
  if (warnings.length > 0) {
    console.warn('Warnings:');
    for (const w of warnings) console.warn(`  ${w}`);
  }

  const nonOptionalCount = stops.filter((s) => s.optional !== true).length;
  const withGpsCount = stops.filter((s) => Array.isArray(s.gps)).length;
  console.log(`${stops.length} stops, ${nonOptionalCount} non-optional, ${withGpsCount} with gps`);

  if (allErrors.length > 0) {
    process.exit(1);
  }

  if (args.check) {
    return;
  }

  const sorted = [...stops].sort((a, b) => a.order - b.order);
  const output = sorted.map(toOutputStop);
  const json = JSON.stringify(output, null, 2) + '\n';
  const outAbs = path.resolve(process.cwd(), args.out);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  // write UTF-8 without BOM
  fs.writeFileSync(outAbs, json, { encoding: 'utf8' });
  console.log(`wrote ${args.out}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
