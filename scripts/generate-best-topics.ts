import { closeDb } from '@aihot/backend/db';
import { generateBestTopic, generateNextBestTopic } from '@aihot/backend/best/generate';

const requested=process.argv[2];
try{
  console.log(JSON.stringify(requested?await generateBestTopic(requested):await generateNextBestTopic()));
}catch(error){console.error(JSON.stringify({slug:requested??null,error:error instanceof Error?error.message:'Generation failed'}));process.exitCode=1;}
await closeDb();
