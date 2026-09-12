const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const HOST_URL = 'https://www.dhlottery.co.kr/lt645/result';
const API_BASE = 'https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

let _browserPromise = null;
let _pagePromise = null;

async function _getPage() {
  if (_pagePromise) return _pagePromise;

  _pagePromise = (async () => {
    if (!_browserPromise) {
      _browserPromise = chromium.launch({
        channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
      });
    }
    const browser = await _browserPromise;
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    await page.goto(HOST_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
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
    } catch (_) {}
    _browserPromise = null;
    _pagePromise = null;
  }
}

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
    prizes.push({ rank: r, winners, prizePerWinner });
  }

  const totalWinners = Number(item.sumWnNope);
  const totalSales = Number(item.wholEpsdSumNtslAmt);
  const totalPrize = prizes.reduce((s, p) => s + p.winners * p.prizePerWinner, 0);

  const auto = Number(item.winType1);
  const manual = Number(item.winType2);
  const semiAuto = Number(item.winType3);

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
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    }, url);
  } catch (err) {
    const e = new Error(`${round}회차 데이터 수신 실패: ${err.message}`);
    e.kind = 'network';
    throw e;
  }

  if (!payload || !payload.data || !Array.isArray(payload.data.list)) {
    throw new Error(`${round}회차 응답 구조 이상`);
  }

  const item = payload.data.list.find(x => Number(x.ltEpsd) === round);
  if (!item) {
    throw new Error(`${round}회차 응답 데이터 없음`);
  }

  const numbers = [
    item.tm1WnNo, item.tm2WnNo, item.tm3WnNo,
    item.tm4WnNo, item.tm5WnNo, item.tm6WnNo
  ].map(Number);

  const bonusNo = Number(item.bnsWnNo);
  const ymd = String(item.ltRflYmd);
  const date = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

  return {
    round: round,
    date,
    numbers: numbers.sort((a, b) => a - b),
    bonusNo,
    ...parseExtended(item, round),
  };
}

// ==========================================
// 메인 동기화 스크립트 실행 제어부
// ==========================================
async function main() {
  const dataPath = path.join(__dirname, '../data/lotto-history.json');
  let lottoHistory = [];

  if (fs.existsSync(dataPath)) {
    try {
      lottoHistory = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    } catch (e) {
      lottoHistory = [];
    }
  }

  const lastDownloadedRound = lottoHistory.length > 0 ? lottoHistory[lottoHistory.length - 1].round : 0;
  const startRound = lastDownloadedRound + 1;
  const targetEndRound = 1241; // 목표로 하시는 최신 회차 스펙

  if (startRound > targetEndRound) {
    console.log(`✅ 최신 회차(${targetEndRound}회)까지 이미 데이터가 동기화되어 있습니다.`);
    await closeBrowser();
    return;
  }

  console.log(`🔄 크롤링 시작: ${startRound}회차부터 ${targetEndRound}회차까지`);

  for (let round = startRound; round <= targetEndRound; round++) {
    try {
      const data = await crawlDhLottery(round);
      lottoHistory.push(data);
      console.log(`[성공] ${round}회차 완료`);
      
      // 안정적인 크롤링을 위한 짧은 딜레이
      await new Promise(resolve => setTimeout(resolve, 800));
    } catch (error) {
      console.error(`[실패] ${round}회차 오류: ${error.message}`);
      break;
    }
  }

  try {
    fs.writeFileSync(dataPath, JSON.stringify(lottoHistory, null, 2), 'utf-8');
    console.log(`\n🎉 모든 데이터가 통합 저장되었습니다! (최종: ${lottoHistory.length}개 회차 보존)`);
  } catch (fsErr) {
    console.error(`파일 저장 실패: ${fsErr.message}`);
  }

  await closeBrowser();
}

process.on('beforeExit', async () => {
  await closeBrowser();
});

main();
