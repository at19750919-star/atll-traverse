const assert = require('node:assert/strict');
const path = require('node:path');

// Read the serialized XLSX, rather than inspecting the exporter's in-memory styles.
function assertSignalFonts(wb, rounds, config) {
  const signalFaces = new Set(config.suits.flatMap(suit => config.ranks.map(rank => rank + suit)));
  const preview = wb.getWorksheet('預覽');
  const vertical = wb.getWorksheet('直立式牌靴');
  assert(preview); assert(vertical);
  let index = 0, signals = 0;
  rounds.forEach((round, ri) => {
    round.cards.forEach((card, ci) => {
      const signal = signalFaces.has(card.rank + card.suit);
      const redBack = card.back_color === 'R';
      const label = `${card.rank}${card.suit}/${card.back_color}`;
      const cell = preview.getCell(Math.floor(ri / 3) + 1, (ri % 3) * 8 + 2 + ci);
      assert.equal(cell.font.color.argb, signal ? 'FFDC3545' : redBack ? 'FF000000' : 'FFFFFFFF', `預覽字色 ${label}`);
      assert.equal(cell.fill.fgColor.argb, redBack ? 'FFFFFF00' : 'FF00CFCF', `預覽牌背 ${label}`);
      assert.equal(String(cell.value), card.rank === 'A' ? '1' : ['10','J','Q','K'].includes(card.rank) ? '0' : card.rank);
      const cardCell = vertical.getCell(++index, 2);
      assert.equal(cardCell.font.color.argb, signal ? 'FFDC3545' : 'FF000000', `直立式字色 ${label}`);
      assert.equal(cardCell.fill.fgColor.argb, redBack ? 'FFFFFF00' : 'FF00FFFF', `直立式牌背 ${label}`);
      if (signal) signals++;
    });
    if (['莊','閒','和'].includes(round.result)) {
      const result = preview.getCell(Math.floor(ri / 3) + 1, (ri % 3) * 8 + 1);
      assert.equal(result.font.color.argb, { '莊':'FFCC0000', '閒':'FF0033AA', '和':'FF006633' }[round.result]);
    }
  });
  return signals;
}

async function main() {
  const depBase = path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
  let ExcelJS;
  for (const base of [process.env.CODEX_NODE_MODULES, depBase, path.resolve(__dirname, '../../百家3.0/node_modules')].filter(Boolean)) {
    try { ExcelJS = require(path.join(base, 'exceljs')); break; } catch (_) {}
  }
  if (!ExcelJS) ExcelJS = require('exceljs');
  globalThis.ExcelJS = ExcelJS;
  require('../traverse_export.js');
  const E = globalThis.TraverseExport;
  const suits = ['♠','♥','♦','♣'];
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const cards = suits.flatMap(suit => ranks.flatMap(rank => ['R','B'].map(back_color => ({ rank, suit, back_color }))));
  const rounds = E.dealRounds(cards);
  const a2 = { suits, ranks:['A','2'] };
  const cases = [
    ['紅0', { suits:['♥','♦'], ranks:['10','J','Q','K'] }, 16],
    ['A2', a2, 16],
    ['自訂黑桃Q', { suits:['♠'], ranks:['Q'] }, 2],
    ['無訊號牌', { suits:[], ranks:[] }, 0],
    ['未傳設定沿用A2', undefined, 16],
  ];
  for (const [name, config, expected] of cases) {
    const blob = await E.buildWorkbook(rounds, { signalConfig:config });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    assert.equal(assertSignalFonts(wb, rounds, config || a2), expected);
    assert.deepEqual(wb.worksheets.map(s => s.name), ['預覽','原始數據','直立式牌靴','回復分析統計']);
    console.log(`PASS ${name}：${expected} 張訊號牌紅字，其他字色／牌背／結果色保留`);
  }
}

module.exports = { assertSignalFonts };
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
