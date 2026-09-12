// ============================================================================
// 동행복권 회차별 결과 조회 (lt645 신규 SPA API, Playwright 경유 통합본)
// ============================================================================
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const HOST_URL = 'https://dhlottery.co.kr';
const API_BASE = 'https://dhlottery.co.kr';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

let _browserPromise = null;
let _pagePromise = null;

async function _getPage() {
  if (_pagePromise) return _pagePromise;

  _pagePromise = (async () => {
    // 시스템 설치 Chrome 채널을 사용합니다. 환경에 Chrome이 없으면
    // PLAYWRIGHT_CHANNEL로 다른 채널(msedge 등)을 지정할 수 있습니다.
    if (!_browserPromise) {
      _browserPromise = chromium.launch({
        channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
      });
    }
    const browser = await _browserPromise;
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    
    // 페이지 컨텍스트(쿠키/세션) 확보를 위해 결과 페이지에 먼저 진입.
    await page.goto(HOST_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    return page;
  })();

  return _pagePromise;
}

async function closeBrowser() {
  if (_browserPromise) {
    try {
      const browser = await _browserPromise;
      await browser.close();
    } catch (_) {
      // 정리 단계 에러는 무시
    }
    _browserPromise = null;
    _pagePromise = null;
  }
}

// 등수별 상금·인원 + 총계 + 1등 유형(자동/수동/반자동)을 파싱합니다.
function parseExtended(item, round) {
  if (item.rnk1WnNope == null || item.rnk1WnAmt == null) {
    console.warn(`  ⚠️ ${round}회차: 상금/인원 필드 없음 — 기본 4필드만 저장`);
    return {};
  }

  const prizes = [];
  for (let r = 1; r <= 5; r++) {
    const winners = Number(item[`rnk${r}WnNope`]);
    const prizePerWinner = Number(item[`rnk${r}WnAmt`]);

    if (![winners, prizePerWinner].every(Number.isFinite)) {
      throw new Error(`${round}회차 ${r}등 상금/인원 파싱 실패`);
    }
    if (winners < 0 || prizePerWinner < 0) {
      throw new Error(`${round}회차 ${r}등 음수 값: winners=${winners}, prize=${prizePerWinner}`);
    }

    const sumFromSource = Number(item[`rnk${r}SumWnAmt`]);
    if (Number.isFinite(sumFromSource) && winners * prizePerWinner !== sumFromSource) {
      console.warn(
        `  ⚠️ ${round}회차 ${r}등 SumWnAmt 불일치(경고): ${prizePerWinner}×${winners}=` +
          `${winners * prizePerWinner} ≠ 원천 ${sumFromSource}`,
      );
    }
    prizes.push({ rank: r, winners, prizePerWinner });
  }

  const totalWinners = Number(item.sumWnNope);
  const totalSales = Number(item.wholEpsdSumNtslAmt);
  const totalPrize = prizes.reduce((s, p) => s + p.winners * p.prizePerWinner, 0);

  for (const [key, val] of [
    ['totalWinners', totalWinners],
    ['totalSales', totalSales],
  ]) {
    if (!Number.isFinite(val) || val < 0) {
      throw new Error(`${round}회차 ${key} 값 이상: ${val}`);
    }
  }

  const sumWinners = prizes.reduce((s, p) => s + p.winners, 0);
  if (sumWinners !== totalWinners) {
    console.warn(`  ⚠️ ${round}회차 등수별 인원 합(${sumWinners}) ≠ totalWinners(${totalWinners})`);
  }

  const wt0 = Number(item.winType0);
  const auto = Number(item.winType1);
  const manual = Number(item.winType2);
  const semiAuto = Number(item.winType3);
  
  if (![auto, manual, semiAuto].every(Number.isFinite)) {
    throw new Error(`${round}회차 winType 파싱 실패`);
  }
  if (wt0 !== 0) {
    console.warn(`  ⚠️ ${round}회차 winType0=${wt0} (0 아님) — 자동/수동 매핑 전제 확인 필요`);
  }
  if (auto + manual + semiAuto !== prizes[0].winners) {
    console.warn(`  ⚠️ ${round}회차 유형 합(${auto + manual + semiAuto}) ≠ 1등 인원(${prizes[0].winners})`);
  }

  return {
    prizes,
    totalWinners,
    totalPrize,
    totalSales,
    firstWinMethod: { auto, manual, semiAuto },
  };
}

async function crawlDhLottery(round) {
  const url = `${API_BASE}?srchDir=center&srchLtEpsd=${round}`;
  let payload;
  
  try {
    const page = await _getPage();
    payload = await page.evaluate(async u => {
      const r = await fetch(u, { credentials: 'include' });
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
      }
      return await r.json();
    }, url);
  } catch (err) {
    const e = new Error(`${round}회차 데이터 수신 실패: ${err.message}`);
    e.kind = 'network';
    throw e;
  }

  if (!payload || !payload.data || !Array.isArray(payload.data.list)) {
    throw new Error(`${round}회차 응답 구조 이상: ${JSON.stringify(payload).slice(0, 200)}`);
  }

  const item = payload.data.list.find(x => Number(x.ltEpsd) === round);
  if (!item) {
    const got = payload.data.list.map(x => x.ltEpsd).join(',');
    throw new Error(`${round}회차 응답 list에 해당 회차 없음 (반환: ${got})`);
  }

  const numbers = [
    item.tm1WnNo,
    item.tm2WnNo,
    item.tm3WnNo,
    item.tm4WnNo,
    item.tm5WnNo,
    item.tm6WnNo,
  ].map(Number);

  if (numbers.length !== 6 || numbers.some(n => !Number.isFinite(n))) {
    throw new Error(`${round}회차 당첨번호 파싱 실패: ${JSON.stringify(numbers)}`);
  }

  const bonusNo = Number(item.bnsWnNo);
  if (!Number.isFinite(bonusNo)) {
    throw new Error(`${round}회차 보너스번호 파싱 실패: ${item.bnsWnNo}`);
  }

  const ymd = String(item.ltRflYmd);
  if (!/^\d{8}$/.test(ymd)) {
    throw new Error(`${round}회차 추첨일 형식 이상: ${ymd}`);
  }
  const date = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

  const allNumbers = [...numbers, bonusNo];
  if (allNumbers.some(n => n < 1 || n > 45)) {
    throw new Error(`${round}회차 숫자 범위 오류: ${allNumbers}`);
  }

  return {
    round: round,
    date,
    numbers: numbers.sort((a, b) => a - b),
    bonusNo,
    ...parseExtended(item, round),
  };
}

// ============================================================================
// 메인 실행 제어 시스템 (파일 누적 및 동기화 구현부)
// ============================================================================
async function main() {
  const dataDir = path.join(__dirname, '../data');
  const dataPath = path.join(dataDir, 'lotto-history.json');
  
  // 데이터 디렉토리가 없으면 자동 생성
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  let lottoHistory = [];

  // 기존 파일 로드
  if (fs.existsSync(dataPath)) {
    try {
      const fileContent = fs.readFileSync(dataPath, 'utf-8');
      lottoHistory = JSON.parse(fileContent);
      console.log(`📂 기존 로또 데이터 로드 성공 (${lottoHistory.length}개 회차 보존됨)`);
    } catch (e) {
      console.error("⚠️ 기존 데이터 분석 실패. 새로 시작합니다.");
      lottoHistory = [];
    }
  }

  // 마지막 수집 회차 확인 후 시작 지점 설정
  const lastDownloadedRound = lottoHistory.length > 0 ? lottoHistory[lottoHistory.length - 1].round : 0;
  const startRound = lastDownloadedRound + 1;
  const targetEndRound = 1241; // 사용자가 정의한 최신 회차 스펙 범위

  if (startRound > targetEndRound) {
    console.log(`✅ 최신 회차(${targetEndRound}회차)까지 모든 데이터가 이미 최신화되어 있습니다.`);
    await closeBrowser();
    return;
  }

  console.log(`🔄 크롤링 동기화 시작: ${startRound}회차 ➔ ${targetEndRound}회차`);

  for (let round = startRound; round <= targetEndRound; round++) {
    try {
      const data = await crawlDhLottery(round);
      lottoHistory.push(data);
      console.log(`[성공] ${round}회차 데이터 갱신 완료`);
      
      // 연속 수집 시 과부하 및 탐지 방지를 위한 타임아웃 지연 (0.8초)
      await new Promise(resolve => setTimeout(resolve, 800));
    } catch (error) {
      console.error(`\n❌ ${round}회차 수집 중 치명적 오류 발생: ${error.message}`);
      break;
    }
  }

  // 최종 수집 완료 데이터 파일에 저장
  try {
    fs.writeFileSync(dataPath, JSON.stringify(lottoHistory, null, 2), 'utf-8');
    console.log(`\n🎉 모든 데이터가 "${dataPath}"에 완전 저장되었습니다. (총 ${lottoHistory.length}개 회차 보존)`);
  } catch (fsErr) {
    console.error(`❌ 파일 저장 중 에러 발생: ${fsErr.message}`);
  }

  await closeBrowser();
}

process.on('beforeExit', async () => {
  await closeBrowser();
});

// 크롤러 구동
main();
