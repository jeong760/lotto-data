// ============================================================================
// lotto-history.json 병합·저장 (update.js / 백필 공용)
// ============================================================================
//
// 회차 객체를 기존 데이터셋에 병합(중복 제거)·정렬하고 메타데이터를 갱신해
// 저장한다. 주간 갱신(update.js)과 대량 백필이 이 단일 경로를 재사용해
// 저장 규칙(dedup·정렬·메타 형식)이 드리프트하지 않도록 한다.
// ============================================================================

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/lotto-history.json');

function loadHistory() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
}

// 순수 병합: newRounds를 existing.data에 중복 없이 넣고 drawNo 오름차순 정렬.
// 파일 쓰기·메타 갱신은 하지 않는다(테스트·조합 용이).
function mergeRounds(existing, newRounds) {
  for (const r of newRounds) {
    if (existing.data.find(d => d.drawNo === r.drawNo)) {
      console.warn(`  ⚠️ ${r.drawNo}회차 이미 존재, 스킵`);
      continue;
    }
    existing.data.push(r);
  }
  existing.data.sort((a, b) => a.drawNo - b.drawNo);
  return existing;
}

// 병합 + 메타 갱신 + 파일 저장. latestRound 미지정 시 data 마지막 drawNo 사용.
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
