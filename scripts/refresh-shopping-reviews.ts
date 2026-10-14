// Bounded editorial refresh using the normal model receipt and budget path. Run in the worker.
import {sql,closeDb} from '@aihot/backend/db';
import {extractShopping} from '@aihot/backend/shopping/offers';
import {stopBoss,recordRun} from '@aihot/backend/jobs/queue';
const ids=process.argv.slice(2);if(!ids.length||ids.length>10)throw new Error('Supply 1–10 public review item IDs');
try{await recordRun('shopping.review-refresh',async()=>{for(const id of ids){const [row]=await sql`SELECT d.article_id FROM shopping_offers d JOIN publications p ON p.article_id=d.article_id WHERE d.article_id=${id} AND d.data->>'kind'='buying_guide' AND p.visibility='public' AND p.eligible`;if(!row)continue;await extractShopping(id,{refreshReview:true});console.log('Refreshed review:',id);}return {requested:ids.length};});}finally{await stopBoss();await closeDb();}
