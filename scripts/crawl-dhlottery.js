// ============================================================================
// Donghang Lottery Round Results Inquiry (lt645 new SPA API, via Playwright integrated)
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
    // Use the system-installed Chrome channel. If Chrome is not available,
    // PLAYWRIGHT_CHANNEL can be used to specify other channels (e.g., msedge).
    if (!_browserPromise) {
      _browserPromise = chromium.launch({
        channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
      });
    }
    const browser = await _browserPromise;
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    
    // First navigate to the results page to secure the page context (cookies/session).
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
      // Ignore errors during the cleanup phase
    }
    _browserPromise = null;
    _pagePromise = null;
  }
}

// Parse prizes and winners per rank + totals + 1st place type (auto/manual/semi-auto).
function parseExtended(item, round) {
  if (item.rnk1WnNope == null || item.rnk1WnAmt == null) {
    console.warn(`  ⚠️ Round ${round}: No prize/winner fields — saving basic 4 fields only`);
    return {};
  }

  const prizes = [];
  for (let r = 1; r <= 5; r++) {
    const winners = Number(item[`rnk${r}WnNope`]);
    const prizePerWinner = Number(item[`rnk${r}WnAmt`]);

    if (![winners, prizePerWinner].every(Number.isFinite)) {
      throw new Error(`Round ${round} rank ${r} prize/winner parsing failed`);
    }
    if (winners < 0 || prizePerWinner < 0) {
      throw new Error(`Round ${round} rank ${r} negative value: winners=${winners}, prize=${prizePerWinner}`);
    }

    const sumFromSource = Number(item[`rnk${r}SumWnAmt`]);
    if (Number.isFinite(sumFromSource) && winners * prizePerWinner !== sumFromSource) {
      console.warn(
        `  ⚠️ Round ${round} rank ${r} SumWnAmt mismatch (warning): ${prizePerWinner}×${winners}=` +
          `${winners * prizePerWinner} ≠ source ${sumFromSource}`,
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
      throw new Error(`Round ${round} ${key} value invalid: ${val}`);
    }
  }

  const sumWinners = prizes.reduce((s, p) => s + p.winners, 0);
  if (sumWinners !== totalWinners) {
    console.warn(`  ⚠️ Round ${round} sum of winners per rank (${sumWinners}) ≠ totalWinners (${totalWinners})`);
  }

  const wt0 = Number(item.winType0);
  const auto = Number(item.winType1);
  const manual = Number(item.winType2);
  const semiAuto = Number(item.winType3);
  
  if (![auto, manual, semiAuto].every(Number.isFinite)) {
    throw new Error(`Round ${round} winType parsing failed`);
  }
  if (wt0 !== 0) {
    console.warn(`  ⚠️ Round ${round} winType0=${wt0} (not 0) — verify auto/manual mapping assumption`);
  }
  if (auto + manual + semiAuto !== prizes[0].winners) {
    console.warn(`  ⚠️ Round ${round} type sum (${auto + manual + semiAuto}) ≠ 1st place winners (${prizes[0].winners})`);
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
    const e = new Error(`Round ${round} data fetch failed: ${err.message}`);
    e.kind = 'network';
    throw e;
  }

  if (!payload || !payload.data || !Array.isArray(payload.data.list)) {
    throw new Error(`Round ${round} response structure invalid: ${JSON.stringify(payload).slice(0, 200)}`);
  }

  const item = payload.data.list.find(x => Number(x.ltEpsd) === round);
  if (!item) {
    const got = payload.data.list.map(x => x.ltEpsd).join(',');
    throw new Error(`Round ${round} response list does not contain this round (returned: ${got})`);
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
    throw new Error(`Round ${round} winning numbers parsing failed: ${JSON.stringify(numbers)}`);
  }

  const bonusNo = Number(item.bnsWnNo);
  if (!Number.isFinite(bonusNo)) {
    throw new Error(`Round ${round} bonus number parsing failed: ${item.bnsWnNo}`);
  }

  const ymd = String(item.ltRflYmd);
  if (!/^\d{8}$/.test(ymd)) {
    throw new Error(`Round ${round} draw date format invalid: ${ymd}`);
  }
  const date = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

  const allNumbers = [...numbers, bonusNo];
  if (allNumbers.some(n => n < 1 || n > 45)) {
    throw new Error(`Round ${round} number range error: ${allNumbers}`);
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
// Main Execution Control System (File accumulation & synchronization implementation)
// ============================================================================
async function main() {
  const dataDir = path.join(__dirname, '../data');
  const dataPath = path.join(dataDir, 'lotto-history.json');
  
  // Automatically create data directory if it does not exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  let lottoHistory = [];

  // Load existing file
  if (fs.existsSync(dataPath)) {
    try {
      const fileContent = fs.readFileSync(dataPath, 'utf-8');
      lottoHistory = JSON.parse(fileContent);
      console.log(`📂 Existing lotto data loaded successfully (${lottoHistory.length} rounds preserved)`);
    } catch (e) {
      console.error("⚠️ Failed to parse existing data. Starting fresh.");
      lottoHistory = [];
    }
  }

  // Check the last collected round and set the starting point
  const lastDownloadedRound = lottoHistory.length > 0 ? lottoHistory[lottoHistory.length - 1].round : 0;
  const startRound = lastDownloadedRound + 1;
  const targetEndRound = 1241; // Target latest round scope defined by user

  if (startRound > targetEndRound) {
    console.log(`✅ All data up to the latest round (${targetEndRound}) is already up to date.`);
    await closeBrowser();
    return;
  }

  console.log(`🔄 Crawling synchronization started: Round ${startRound} ➔ Round ${targetEndRound}`);

  for (let round = startRound; round <= targetEndRound; round++) {
    try {
      const data = await crawlDhLottery(round);
      lottoHistory.push(data);
      console.log(`[Success] Round ${round} data updated`);
      
      // Timeout delay (0.8s) to prevent overload and bot detection during consecutive requests
      await new Promise(resolve => setTimeout(resolve, 800));
    } catch (error) {
      console.error(`\n❌ Fatal error while collecting round ${round}: ${error.message}`);
      break;
    }
  }

  // Save the fully collected data to file
  try {
    fs.writeFileSync(dataPath, JSON.stringify(lottoHistory, null, 2), 'utf-8');
    console.log(`\n🎉 All data completely saved to "${dataPath}". (Total ${lottoHistory.length} rounds preserved)`);
  } catch (fsErr) {
    console.error(`❌ Error occurred while saving file: ${fsErr.message}`);
  }

  await closeBrowser();
}

process.on('beforeExit', async () => {
  await closeBrowser();
});

// Run main() only when executed directly via terminal or node
if (require.main === module) {
  main();
}

// 📌 Export settings so functions can be required in workflow diagnostics, etc.
module.exports = {
  crawlDhLottery,
  closeBrowser,
};
