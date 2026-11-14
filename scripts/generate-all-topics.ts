import { closeDb } from '@aihot/backend/db';
import { generateBestTopic } from '@aihot/backend/best/generate';
import { BEST_TOPICS } from '@aihot/industry/best-topics';

async function main() {
  console.log(`Starting generation for all ${BEST_TOPICS.length} topics...`);
  const queue = [...BEST_TOPICS];
  const CONCURRENCY = 3;
  let completed = 0;
  let failed = 0;

  async function worker(workerId: number) {
    while (queue.length > 0) {
      const topic = queue.shift();
      if (!topic) break;
      console.log(`[Worker ${workerId}] Generating ${topic.slug} (${completed + failed + 1}/${BEST_TOPICS.length})...`);
      try {
        const res = await generateBestTopic(topic.slug, true);
        if (res.status === 'generated') {
          completed++;
          console.log(`[Worker ${workerId}] ✓ Generated ${topic.slug}: ${res.products} products, ${res.articles} articles`);
        } else {
          failed++;
          console.log(`[Worker ${workerId}] ⚠ Skipped ${topic.slug}: ${res.reason}`);
        }
      } catch (err) {
        failed++;
        console.error(`[Worker ${workerId}] ✗ Failed ${topic.slug}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workers);
  console.log(`All done! Completed: ${completed}, Failed: ${failed}`);
}

main()
  .catch(err => {
    console.error('Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
