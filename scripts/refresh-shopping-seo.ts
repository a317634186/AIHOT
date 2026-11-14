// Bounded, resumable SEO title/description backfill using normal receipts and budgets.
// Titles are only generated when a record has none, so repeated runs never rotate existing values.
import {closeDb} from '@aihot/backend/db';
import {refreshMissingShoppingSeoDescriptions} from '@aihot/backend/shopping/seo-descriptions';
import {refreshMissingShoppingHubSeoTitles} from '@aihot/backend/shopping/hub-seo-titles';
import {stopBoss,recordRun} from '@aihot/backend/jobs/queue';
try{
 const items=Number(process.argv[2]??60);
 const hubs=Number(process.argv[3]??8);
 console.log('items:',await recordRun('shopping.seo-description-refresh',()=>refreshMissingShoppingSeoDescriptions(items)));
 console.log('hubs:',await recordRun('shopping.hub-seo-title-refresh',()=>refreshMissingShoppingHubSeoTitles(hubs)));
}finally{await stopBoss();await closeDb();}