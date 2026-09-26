// ============================================================================
// 로또 데이터 자동 갱신 스크립트
// ============================================================================
//
// 1) 기존 data/lotto-history.json 로드
// 2) 현재 시점의 이론상 최신 회차 계산 (1회차 2002-12-07 토 20:35 KST 기준)
// 3) 갭만큼 동행복권 사이트 순차 크롤링 (1초 간격, 서버 부담 완화)
// 4) data/lotto-history.json에 추가, 정렬, 메타데이터 갱신
// ============================================================================

const { crawlDhLottery, closeBrowser } = require('./crawl-dhlottery');
const { loadHistory, mergeAndSave } = require('./lotto-store');

const FIRST_DRAW_DATE = new Date('2002-12-07T20:35:00+09:00');
const MS_PER_WEEK = 1000 * 60 * 60 * 24 * 7;
const MAX_GAP = 10; // 한 번에 10주 이상 갭 시 중단

function calculateLatestRound(now = new Date()) {
  const diffMs = now.getTime() - FIRST_DRAW_DATE.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / MS_PER_WEEK) + 1;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🔄 로또 데이터 갱신 시작');

  // 1. 기존 데이터 로드
  const existing = loadHistory();
  const lastRound = existing.latestRound;
  console.log(`현재 최신 회차: ${lastRound}`);

  // 2. 현재 시점 회차 계산
  const currentRound = calculateLatestRound();
  console.log(`이론상 현재 회차: ${currentRound}`);

  const gap = currentRound - lastRound;

  // 3. 갭 검증
  if (gap === 0) {
    console.log('✅ 이미 최신입니다.');
    return;
  }

  if (gap < 0) {
    throw new Error(
      `기존 데이터(${lastRound})가 계산된 회차(${currentRound})보다 큽니다. 데이터 확인 필요.`,
    );
  }

  if (gap > MAX_GAP) {
    throw new Error(`갭이 너무 큽니다 (${gap}주). 수동 확인 필요.`);
  }

  console.log(`📥 ${gap}개 회차 추가 예정 (${lastRound + 1} ~ ${currentRound})`);

  // 4. 누락된 회차 순차 크롤링
  const newRounds = [];
  for (let round = lastRound + 1; round <= currentRound; round++) {
    console.log(`  ${round}회차 크롤링 중...`);
    const data = await crawlDhLottery(round);
    newRounds.push(data);
    console.log(
      `  ✓ ${round}회차: ${data.numbers.join(', ')} + ${data.bonusNo} (${data.date})`,
    );

    // 서버 부담 줄이기 위해 1초 대기 (마지막 요청 제외)
    if (round < currentRound) {
      await sleep(1000);
    }
  }

  // 5. 병합·정렬·메타 갱신·저장 (dedup 포함, 공용 경로)
  mergeAndSave(existing, newRounds, currentRound);
  console.log(`✅ 갱신 완료. 총 ${existing.data.length}개 회차.`);

  // 브라우저를 명시적으로 닫는다. 닫지 않으면 Chromium 프로세스가 이벤트 루프를
  // 붙잡아 beforeExit가 발화하지 않고 스크립트가 종료되지 않는다.
  await closeBrowser();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ 갱신 실패:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
