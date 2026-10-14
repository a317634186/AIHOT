// Bounded, resumable editorial backfill using normal receipts and budgets.
import {closeDb} from '@aihot/backend/db';
import {refreshMissingShoppingRecommendations} from '@aihot/backend/shopping/recommendations';
import {stopBoss,recordRun} from '@aihot/backend/jobs/queue';
try{console.log(await recordRun('shopping.recommendation-refresh',()=>refreshMissingShoppingRecommendations(Number(process.argv[2]??20))));}finally{await stopBoss();await closeDb();}
