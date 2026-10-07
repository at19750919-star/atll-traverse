// 穿越排牌批次生成：照 traverse_builder.html「開始排牌 → 導出」同一套流程，在背景連跑 N 副。
// 用法：node scripts/batch-traverse.mjs --count 3 [--side-limit 8] [--no-side] [--no-nine]
//       [--max-leftover 0] [--no-triple] [--no-signal] [--out C:\Users\at197\Downloads\穿越] [--no-upload]
// 預設值與排牌頁相同：三條、A.2、末張9、莊閒（差距上限 8）開啟，剩 0 張重跑。
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ExcelJS：本專案沒裝就借用百家3.0 的（兩個專案同一版 4.4.0）
function loadExcelJS() {
  for (const p of ['exceljs', path.join(ROOT, '..', '百家3.0', 'node_modules', 'exceljs')]) {
    try { return require(p); } catch (e) { /* 試下一個 */ }
  }
  throw new Error('找不到 exceljs（請在本專案或百家3.0 執行 npm install exceljs）');
}
globalThis.ExcelJS = loadExcelJS();
require(path.join(ROOT, 'traverse_builder.js'));
require(path.join(ROOT, 'traverse_export.js'));
const B = globalThis.TraverseBuilder;
const E = globalThis.TraverseExport;

// ===== 參數 =====
function parseArgs(argv) {
  const o = {
    count: 1, sideRule: true, sideLimit: 8, endingNine: true, maxLeftover: 0,
    tripleTie: true, signalRule: true, upload: true,
    idleLimit: 1000, computeTries: 20000, chainAttempts: 20,
    out: path.join(os.homedir(), 'Downloads', '穿越'),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--count') { o.count = Math.max(1, Math.min(99, parseInt(v, 10) || 1)); i++; }
    else if (a === '--side-limit') { o.sideLimit = Math.max(0, parseInt(v, 10) || 0); i++; }
    else if (a === '--no-side') o.sideRule = false;
    else if (a === '--no-nine') o.endingNine = false;
    else if (a === '--max-leftover') { o.maxLeftover = v === '' ? null : Math.max(0, parseInt(v, 10) || 0); i++; }
    else if (a === '--no-triple') o.tripleTie = false;
    else if (a === '--no-signal') o.signalRule = false;
    else if (a === '--no-upload') o.upload = false;
    else if (a === '--out') { o.out = v; i++; }
  }
  return o;
}
const opt = parseArgs(process.argv.slice(2));
const say = (s) => process.stdout.write(s + '\n');

// ===== 違規判定（與 traverse_builder.html 相同）=====
function violationOf(round) {
  if (!round.hand) return null;
  const sw = E.swappedTotals(round);
  if (!sw || sw.size !== round.hand.size) return 'noSwap';
  if (sw.result === round.hand.result && sw.result !== '和') return 'same';
  return null;
}
function roundPairs(rounds) {
  const pairs = [];
  for (let k = 0; k + 1 < rounds.length; k++) if (rounds[k].hand && rounds[k + 1].hand) pairs.push([k, k + 1]);
  let last = rounds.length - 1;
  while (last > 0 && !rounds[last].hand) last--;
  if (last > 0 && rounds[0].hand) pairs.push([last, 0]);
  return pairs;
}
function tripleViolations(rounds) {
  const out = [];
  if (!opt.tripleTie) return out;
  for (const [i, j] of roundPairs(rounds)) {
    const trip = B.isTriple(rounds[i].cards.map((c) => c.point));
    if (trip !== (rounds[j].result === '和')) out.push(j + 1);
  }
  return out;
}
function signalViolations(rounds) {
  const out = [];
  if (!opt.signalRule) return out;
  for (const [i, j] of roundPairs(rounds)) {
    if (j === 0) continue;
    const a = rounds[i], b = rounds[j];
    const pts = a.cards.map((c) => c.point);
    if (opt.tripleTie && B.isTriple(pts)) continue;
    const need = B.isSignalHand(pts) ? '莊' : '閒';
    if (b.result !== '和' && b.result !== need) out.push(j + 1);
    else if (b.result === '和' && !opt.tripleTie) out.push(j + 1);
  }
  return out;
}
const COLOR_OK = new Set(B.COLOR_PATTERNS.map((p) => p.join('')));
function colorViolations(rounds) {
  const out = [];
  rounds.forEach((r, i) => {
    if (r.hand && !COLOR_OK.has(r.cards.slice(0, 4).map((c) => c.back_color).join(''))) out.push(i + 1);
  });
  return out;
}
function collectViolations(rounds) {
  const g = { noSwap: [], same: [], triple: tripleViolations(rounds), signal: signalViolations(rounds), color: colorViolations(rounds) };
  rounds.forEach((r, i) => { const v = violationOf(r); if (v) g[v].push(i + 1); });
  return g;
}
function cutLastViolation(base, c, withColor = false) {
  const rounds = E.dealRounds(E.cutDeck(base, c));
  const g = collectViolations(rounds);
  const trav = (n) => rounds[n - 1] && rounds[n - 1].segment === 'A';
  let last = rounds.length;
  while (last > 1 && !rounds[last - 1].hand) last--;
  const prevNo = (n) => (n === 1 ? last : n - 1);
  const fixable = (n) => {
    const r = rounds[n - 1], p = rounds[prevNo(n) - 1];
    const need = B.neededAfter(p.cards.map((x) => x.point));
    if (r.result === need) return true;
    const sw = E.swappedTotals(r);
    return !!sw && sw.size === r.hand.size && sw.result === need;
  };
  const bad = g.noSwap.concat(g.same, withColor ? g.color : []).filter(trav)
    .concat(g.triple.concat(g.signal).filter((n) => trav(n) && trav(prevNo(n)) && !fixable(n)));
  return bad.length ? Math.max(...bad) : 0;
}
function prepareBase(result) {
  const base = result.cards.map((c) => ({ ...c, traverse: false }));
  result.chains.forEach((ch) => {
    for (let k = ch.start - 1; k < ch.start - 1 + ch.length; k++) base[k].traverse = true;
  });
  return base;
}
function findEndingNineCut(base) {
  const cands = [];
  for (const r of E.dealRounds(base)) {
    if (!r.hand || r.cards[r.cards.length - 1].rank !== '9') continue;
    const c = (r.start + r.cards.length) % 416;
    if (cutLastViolation(base, c) === 0) cands.push(c);
  }
  return cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
}
function sideDiffOf(cards, cut) {
  const rounds = E.dealRounds(E.cutDeck(cards, cut)).filter((r) => r.hand);
  const banker = rounds.filter((r) => r.result === '莊').length;
  return Math.abs(banker - (rounds.length - banker));
}

// ===== 一副：照排牌頁的重跑條件 =====
async function buildOne(tagNo) {
  let reruns = 0;
  let lastLog = 0;
  for (;;) {
    const buildOpts = {
      idleLimit: opt.idleLimit, computeTries: opt.computeTries, chainAttempts: opt.chainAttempts,
      tripleTie: opt.tripleTie, signalRule: opt.signalRule, strong: false,
      onProgress: () => {}, isCancelled: () => false,
    };
    if (opt.maxLeftover !== null) buildOpts.rejectAbove = opt.maxLeftover;
    const res = await B.build(buildOpts);
    if (Date.now() - lastLog > 10000) { lastLog = Date.now(); say(`${tagNo} 排牌中…已重跑 ${reruns} 次`); }
    if (res.rejected) { reruns++; continue; }
    const tooMany = opt.maxLeftover !== null && res.leftoverCount > opt.maxLeftover;
    const signalBad = res.signal && !res.signal.ok;
    if (tooMany || signalBad || !res.colorOk) { reruns++; continue; }
    const base = prepareBase(res);
    let cut = 0;
    if (opt.endingNine) {
      const c = findEndingNineCut(base);
      if (c === null) { reruns++; continue; }
      cut = c;
    }
    if (opt.sideRule && sideDiffOf(res.cards, cut) > opt.sideLimit) { reruns++; continue; }
    return { res, base, cut, reruns };
  }
}

// ===== 雲端（同排牌頁：百家3.0 的 Apps Script，存「穿越牌」資料夾，TR 編號）=====
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbypt3_PnEL5TgdDPaBwg1M5bWAjQMR9dD5Jslicn3eZCtuNSTtqO35RafhQpuX-l9_m/exec';
const DRIVE_FOLDER_ID = '17RvOVNDc0a_JEem1SnRPsTEvm8otkJdx';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchFolderFiles() {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?folderId=${DRIVE_FOLDER_ID}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.success && Array.isArray(data.files)) return data.files;
      throw new Error((data && data.error) || '檔案清單格式錯誤');
    } catch (e) {
      lastError = e;
      if (attempt < 4) await wait(2000 * attempt);
    }
  }
  throw new Error(`讀取雲端「穿越牌」清單失敗：${lastError && lastError.message}`);
}
function maxTrNumber(names) {
  let max = 0;
  names.forEach((n) => { const m = String(n || '').match(/^TR(\d+)\.xlsx$/i); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return max;
}
async function uploadToDrive(buf, filename, knownFiles) {
  const body = JSON.stringify({ filename, base64Data: Buffer.from(buf).toString('base64'), folderId: DRIVE_FOLDER_ID });
  const before = knownFiles.filter((f) => f.name === filename).length;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (attempt > 1 && (await fetchFolderFiles()).filter((f) => f.name === filename).length > before) return {};
      const res = await fetch(GOOGLE_APPS_SCRIPT_URL, { method: 'POST', body });
      const data = await res.json();
      if (data && data.success) return data;
      throw new Error((data && data.error) || '上傳失敗');
    } catch (e) {
      lastError = e;
      if (attempt < 3) await wait(2000 * attempt);
    }
  }
  throw new Error(`Google Drive上傳失敗：${lastError && (lastError.message || lastError)}`);
}

// ===== 主流程 =====
async function main() {
  say(`穿越排牌批次：${opt.count} 副｜三條 ${opt.tripleTie ? '開' : '關'}｜A.2 ${opt.signalRule ? '開' : '關'}｜末張9 ${opt.endingNine ? '開' : '關'}｜莊閒 ${opt.sideRule ? `開（上限 ${opt.sideLimit}）` : '關'}｜剩 ${opt.maxLeftover ?? '不限'} 張重跑`);
  await fs.mkdir(opt.out, { recursive: true });
  for (let n = 1; n <= opt.count; n++) {
    const tagNo = `[${n}/${opt.count}]`;
    const t0 = Date.now();
    const { res, base, cut, reruns } = await buildOne(tagNo);
    const rounds = E.dealRounds(E.cutDeck(base, cut));
    const done = rounds.filter((r) => r.hand);
    const banker = done.filter((r) => r.result === '莊').length;
    const player = done.filter((r) => r.result === '閒').length;
    const tie = done.length - banker - player;
    say(`${tagNo} 排好：${done.length} 局（莊 ${banker}／閒 ${player}／和 ${tie}）｜切牌 ${cut} 張｜重跑 ${reruns} 次｜${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
    const g = collectViolations(rounds);
    const vio = [['無法對調', g.noSwap], ['對調後結果不變', g.same], ['三條規則', g.triple], ['訊號牌規則', g.signal], ['卡色', g.color]]
      .filter(([, l]) => l.length).map(([k, l]) => `${k} 第${l.join('、')}局`);
    if (vio.length) say(`${tagNo} 注意：牌表上有違規（${vio.join('；')}）`);

    // 編號：雲端與本機資料夾取最大 TR 號 +1，避免重號
    let cloud = [];
    if (opt.upload) cloud = await fetchFolderFiles();
    const local = await fs.readdir(opt.out).catch(() => []);
    const filename = `TR${String(Math.max(maxTrNumber(cloud.map((f) => f.name)), maxTrNumber(local)) + 1).padStart(3, '0')}.xlsx`;
    const blob = await E.buildWorkbook(rounds);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const outputPath = path.join(opt.out, filename);
    await fs.writeFile(outputPath, buf);
    // 驗證：讀回檔案確認四張工作表都在
    const check = new globalThis.ExcelJS.Workbook();
    await check.xlsx.readFile(outputPath);
    const sheets = check.worksheets.map((w) => w.name);
    if (sheets.length < 4) throw new Error(`${filename} 工作表不完整：${sheets.join('、')}`);
    say(`${tagNo} 已導出並驗證 ${outputPath}`);
    if (opt.upload) {
      const r = await uploadToDrive(buf, filename, cloud);
      say(`${tagNo} 已上傳Google Drive ${r.fileUrl || filename}`);
    }
  }
  say(`完成：${opt.count} 副`);
}

main().catch((e) => { say(`失敗：${e.message || e}`); process.exit(1); });
