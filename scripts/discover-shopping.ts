// Run one bounded AI discovery batch through the worker's normal receipts and publication pipeline.
import { discoverShopping } from '@aihot/backend/shopping/discovery';
import { recordRun, stopBoss } from '@aihot/backend/jobs/queue';
import { closeDb } from '@aihot/backend/db';
try{console.log(JSON.stringify(await recordRun(process.argv.includes('--reviews')?'shopping.review-discover':'shopping.discover',()=>discoverShopping(undefined,process.argv.includes('--reviews')?'reviews':'deals'))));}finally{await stopBoss();await closeDb();}
