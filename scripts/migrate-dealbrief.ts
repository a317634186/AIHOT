// Idempotent deployment transition: archive the original AI examples without deleting their data.
import { readFileSync } from 'node:fs';
import { sql,closeDb } from '@aihot/backend/db';
const ids=JSON.parse(readFileSync(new URL('../industry/sources.json',import.meta.url),'utf8')).sources.map((s:{id:string})=>s.id);
await sql.begin(async tx=>{
 await tx`UPDATE sources SET enabled=false,participation_mode='isolated' WHERE NOT (id=ANY(${ids}::text[])) AND id NOT LIKE 'shopping-%' AND id <> 'ai_deal_hunter'`;
 await tx`UPDATE sources SET enabled=true,participation_mode='editorial',kind='external',name='AI Deal Hunter' WHERE id='ai_deal_hunter'`;
 await tx`INSERT INTO editorial_overrides(article_id,visibility,reason,updated_by) SELECT a.id,'withdrawn','Archived pre-shopping sample; original data retained.','deployment:dealbrief' FROM articles a JOIN sources s ON s.id=a.source_id WHERE s.participation_mode='isolated' AND s.id NOT LIKE 'shopping-%' ON CONFLICT(article_id) DO NOTHING`;
 await tx`UPDATE publications p SET visibility='withdrawn',eligible=false,selected=false,indexable=false,updated_at=now() FROM sources s WHERE p.source_id=s.id AND s.participation_mode='isolated' AND s.id NOT LIKE 'shopping-%'`;
});
console.log('Archived legacy example sources and publications; original data retained.');
await closeDb();
