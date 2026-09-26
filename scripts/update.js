// ============================================================================
// Lotto Data Automatic Update Script
// ============================================================================
//
// 1) Load existing data/lotto-history.json
// 2) Calculate the theoretical latest round at the current time (Based on round 1: 2002-12-07 Sat 20:35 KST)
// 3) Sequentially crawl the Donghang Lottery site for the gap (1-sec interval, reduce server load)
// 4) Add to data/lotto-history.json, sort, and update metadata
// ============================================================================

const { crawlDhLottery, closeBrowser } = require('./crawl-dhlottery');
const { loadHistory, mergeAndSave } = require('./lotto-store');

const FIRST_DRAW_DATE = new Date('2002-12-07T20:35:00+09:00');
const MS_PER_WEEK = 1000 * 60 * 60 * 24 * 7;
const MAX_GAP = 10; // Stop if the gap exceeds 10 weeks at once

function calculateLatestRound(now = new Date()) {
  const diffMs = now.getTime() - FIRST_DRAW_DATE.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / MS_PER_WEEK) + 1;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🔄 Starting lotto data update');

  // 1. Load existing data
  const existing = loadHistory();
  const lastRound = existing.latestRound;
  console.log(`Current latest round: ${lastRound}`);

  // 2. Calculate current round based on time
  const currentRound = calculateLatestRound();
  console.log(`Theoretical current round: ${currentRound}`);

  const gap = currentRound - lastRound;

  // 3. Validate gap
  if (gap === 0) {
    console.log('✅ Already up to date.');
    return;
  }

  if (gap < 0) {
    throw new Error(
      `Existing data (${lastRound}) is greater than the calculated round (${currentRound}). Please check data.`,
    );
  }

  if (gap > MAX_GAP) {
    throw new Error(`Gap is too large (${gap} weeks). Manual check required.`);
  }

  console.log(`📥 Planning to add ${gap} rounds (${lastRound + 1} ~ ${currentRound})`);

  // 4. Sequentially crawl missing rounds
  const newRounds = [];
  for (let round = lastRound + 1; round <= currentRound; round++) {
    console.log(`  Crawling round ${round}...`);
    const data = await crawlDhLottery(round);
    newRounds.push(data);
    console.log(
      `  ✓ Round ${round}: ${data.numbers.join(', ')} + ${data.bonusNo} (${data.date})`,
    );

    // Wait 1 second to reduce server load (exclude last request)
    if (round < currentRound) {
      await sleep(1000);
    }
  }

  // 5. Merge, sort, update metadata, and save (includes dedup, common path)
  mergeAndSave(existing, newRounds, currentRound);
  console.log(`✅ Update complete. Total ${existing.data.length} rounds.`);

  // Explicitly close the browser. If not closed, the Chromium process holds the event loop,
  // preventing beforeExit from firing and the script from exiting.
  await closeBrowser();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Update failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
