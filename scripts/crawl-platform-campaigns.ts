// Run AI-powered platform promotion ingestion and campaign synthesis
import { crawlAndSynthesizePlatformCampaigns } from '../packages/backend/src/shopping/platform-campaigns.ts';
import { closeDb } from '../packages/backend/src/db.ts';

async function main() {
  console.log('Starting AI platform campaign crawling & synthesis...');
  const results = await crawlAndSynthesizePlatformCampaigns();
  console.log('Platform campaigns updated:');
  console.log(JSON.stringify(results, null, 2));
  await closeDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error crawling platform campaigns:', err);
  await closeDb();
  process.exit(1);
});
