// Local replica of the seven gate rows in RULES.txt, run against a built /output directory.
// Usage: node tools/check-gate.mjs --out <dir> --input <snapshot.json>
// It does not grade; it only checks the gate's own shape, so a pass here is what the scorer
// checks before the judge ever sees the entry.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
};
const out = arg('out', 'out');
const inputFile = arg('input', '../kit/token-radar-01-kit/input/snapshot.json');
const snapshot = JSON.parse(readFileSync(inputFile, 'utf8'));
const watchlist = new Set(snapshot.watchlist);
const slugs = new Set(snapshot.protocols.map((p) => p.slug));

const rows = [];
function check(name, ok, detail) {
  rows.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
}

const HTTP = /https?:\/\//;
// dashboard_files
{
  let detail = '';
  let ok = true;
  const files = [];
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (e.name.startsWith('.')) { ok = false; detail = `dashboard/${p} is a dot-directory`; }
        walk(join(dir, e.name), p);
      } else if (e.isFile()) {
        if (!/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(e.name)) { ok = false; detail = `dashboard/${p}: bad name`; }
        files.push({ path: p, size: statSync(join(dir, e.name)).size });
      }
    }
  };
  try {
    walk(join(out, 'dashboard'), '');
    const names = files.map((f) => f.path);
    const hasHtml = names.some((n) => n === 'index.html');
    const hasCss = names.some((n) => n.endsWith('.css'));
    const hasJs = names.some((n) => n.endsWith('.js'));
    const total = files.reduce((a, f) => a + f.size, 0);
    if (!hasHtml || !hasCss || !hasJs) { ok = false; detail = `index.html=${hasHtml} css=${hasCss} js=${hasJs}`; }
    if (files.length > 400 || total > 4_194_304) { ok = false; detail = `${files.length} files, ${total} bytes`; }
    if (ok) {
      for (const f of files) {
        const text = readFileSync(join(out, 'dashboard', f.path), 'utf8');
        if (f.path.endsWith('.html')) {
          const attrs = [...text.matchAll(/(?:href|src|action|poster|cite|data|background)\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1]);
          const bad = attrs.find((a) => HTTP.test(a));
          if (bad) { ok = false; detail = `${f.path}: attribute names ${bad}`; break; }
          const style = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).find((s) => HTTP.test(s));
          if (style) { ok = false; detail = `${f.path}: <style> names a URL`; break; }
        }
        if (f.path.endsWith('.css') && HTTP.test(text)) { ok = false; detail = `${f.path}: CSS names a URL`; break; }
        if (f.path.endsWith('.js')) {
          const bad = text.match(/(?:from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"])/);
          if (bad && HTTP.test(bad[0])) { ok = false; detail = `${f.path}: JS import names a URL`; break; }
        }
      }
    }
    if (ok) detail = `${files.length} files, ${total} bytes, index.html + css + js, no network address`;
  } catch (e) { ok = false; detail = String(e.message); }
  check('dashboard_files', ok, detail);
}

// board_file + sorted_by_value + coverage + farm_steps
let board;
try {
  const raw = readFileSync(join(out, 'board.json'), 'utf8');
  const parsed = JSON.parse(raw);
  board = Array.isArray(parsed) ? parsed : parsed.rows;
  let ok = true;
  let detail = '';
  if (!Array.isArray(board) || board.length < 100 || board.length > 4000) { ok = false; detail = `${board ? board.length : 'no'} rows`; }
  if (ok) {
    const seen = new Set();
    for (const r of board) {
      if (!slugs.has(r.slug)) { ok = false; detail = `invented slug ${r.slug}`; break; }
      if (seen.has(r.slug)) { ok = false; detail = `duplicate slug ${r.slug}`; break; }
      seen.add(r.slug);
      if (typeof r.name !== 'string' || r.name.length === 0) { ok = false; detail = `${r.slug}: empty name`; break; }
      if (!Number.isSafeInteger(r.rank) || r.rank <= 0) { ok = false; detail = `${r.slug}: bad rank`; break; }
      if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) { ok = false; detail = `${r.slug}: bad implied value`; break; }
    }
    if (ok && board.length >= 2 && board[0].implied_value_usd === board[board.length - 1].implied_value_usd) { ok = false; detail = 'all implied values equal'; }
    if (ok) detail = `${board.length} rows`;
  }
  check('board_file', ok, detail);
  // sorted_by_value
  {
    let ok2 = true;
    let detail2 = '';
    const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
    for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) { ok2 = false; detail2 = `rank ${i + 1} is ${ranks[i]}`; break; }
    if (ok2) {
      const byRank = [...board].sort((a, b) => a.rank - b.rank);
      for (let i = 1; i < byRank.length; i++) if (byRank[i].implied_value_usd > byRank[i - 1].implied_value_usd) { ok2 = false; detail2 = `row ${i + 1} outranks row ${i}`; break; }
    }
    if (ok2 && board.length >= 2 && board[0].implied_value_usd === board[board.length - 1].implied_value_usd) { ok2 = false; detail2 = 'all implied values equal'; }
    check('sorted_by_value', ok2, detail2 || 'ranks 1..N, values non-increasing');
  }
  // coverage
  {
    const have = new Set(board.map((r) => r.slug));
    const missing = [...watchlist].filter((s) => !have.has(s));
    check('coverage', missing.length === 0, missing.length === 0 ? `all ${watchlist.size} watchlist slugs covered` : `missing ${missing.slice(0, 5).join(', ')}`);
  }
  // farm_steps
  {
    let ok3 = true;
    let detail3 = '';
    for (const r of board) {
      if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) { ok3 = false; detail3 = `${r.slug}: ${r.farm_steps ? r.farm_steps.length : 0} steps`; break; }
      for (const s of r.farm_steps) {
        const t = s.trim();
        if (t.length < 20 || t.length > 600) { ok3 = false; detail3 = `${r.slug}: step of ${t.length} chars`; break; }
      }
      if (!ok3) break;
    }
    check('farm_steps', ok3, detail3 || `${board.length} rows, 3..12 steps each, 20..600 chars`);
  }
} catch (e) {
  check('board_file', false, String(e.message));
  check('sorted_by_value', false, 'no board');
  check('coverage', false, 'no board');
  check('farm_steps', false, 'no board');
}

// screenshots
{
  let ok = true;
  let detail = '';
  try {
    const dir = join(out, 'screenshots');
    const names = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && !e.name.startsWith('.')).map((e) => e.name).sort();
    if (names.length < 3 || names.length > 4) { ok = false; detail = `${names.length} images`; }
    for (const n of names) {
      const buf = readFileSync(join(dir, n));
      if (buf.length > 524_288) { ok = false; detail = `${n} is ${buf.length} bytes`; break; }
      const isPng = buf[0] === 0x89 && buf[1] === 0x50;
      const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
      if (!isPng && !isJpeg) { ok = false; detail = `${n} is neither PNG nor JPEG`; break; }
      let w = 0, h = 0;
      if (isPng) { w = buf.readUInt32BE(16); h = buf.readUInt32BE(20); }
      if (isJpeg) {
        let off = 2;
        while (off < buf.length - 1) {
          if (buf[off] !== 0xff) break;
          const marker = buf[off + 1];
          const len = buf.readUInt16BE(off + 2);
          if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) { h = buf.readUInt16BE(off + 5); w = buf.readUInt16BE(off + 7); break; }
          off += 2 + len;
        }
      }
      const longSide = Math.max(w, h), shortSide = Math.min(w, h);
      if (longSide > 1440 || shortSide < 800) { ok = false; detail = `${n} is ${w}x${h}`; break; }
    }
    if (ok) detail = `${names.length} images: ${names.join(', ')}`;
  } catch (e) { ok = false; detail = String(e.message); }
  check('screenshots', ok, detail);
}

// dossier_matches
{
  let ok = true;
  let detail = '';
  try {
    const expected = buildDossier(out, { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 }, dashboard: { max_files: 400, max_bytes: 4194304 } });
    const actual = readFileSync(join(out, 'dossier.json'));
    ok = Buffer.compare(Buffer.from(expected), actual) === 0;
    detail = ok ? `${actual.length} bytes, byte-for-byte match` : `dossier.json is ${actual.length} bytes, expected ${expected.length}`;
    if (actual.length > 1_572_864) { ok = false; detail = `dossier.json is ${actual.length} bytes, over 1.5 MiB`; }
  } catch (e) { ok = false; detail = String(e.message); }
  check('dossier_matches', ok, detail);
}

const failed = rows.filter((r) => !r.ok).length;
console.log(failed === 0 ? `GATE: ${rows.length}/7 pass` : `GATE: ${rows.length - failed}/7 pass, ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
