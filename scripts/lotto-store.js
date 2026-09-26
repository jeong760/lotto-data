// ============================================================================
// lotto-history.json Merge & Save (Common path for update.js / backfill)
// ============================================================================
//
// Merges round objects into the existing dataset (with deduplication),
// sorts them, and updates metadata before saving. Both the weekly update (update.js)
// and bulk backfills reuse this single path to prevent storage rule drift
// (deduplication, sorting, metadata formatting).
// ============================================================================

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/lotto-history.json');

function loadHistory() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
}

// Pure merge: Inserts newRounds into existing.data without duplicates, sorted by drawNo ascending.
// Does not perform file writing or metadata updates (useful for testing and combination).
function mergeRounds(existing, newRounds) {
  for (const r of newRounds) {
    if (existing.data.find(d => d.drawNo === r.drawNo)) {
      console.warn(`  ⚠️ Round ${r.drawNo} already exists, skipping`);
      continue;
    }
    existing.data.push(r);
  }
  existing.data.sort((a, b) => a.drawNo - b.drawNo);
  return existing;
}

// Merge + Update metadata + Save file. Uses the last drawNo in data if latestRound is not specified.
function mergeAndSave(existing, newRounds, latestRound) {
  mergeRounds(existing, newRounds);
  existing.latestRound =
    latestRound != null
      ? latestRound
      : existing.data[existing.data.length - 1].drawNo;
  existing.updatedAt = new Date().toISOString();
  fs.writeFileSync(DATA_PATH, JSON.stringify(existing, null, 2) + '\n');
  return existing;
}

module.exports = { DATA_PATH, loadHistory, mergeRounds, mergeAndSave };
