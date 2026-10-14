// Read-only audit. Reports credential names and paths, never values, response bodies or environment dumps.
import {readFile,readdir,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const env={...parseEnv(await readFile(path.join(root,'.env'),'utf8').catch(()=>'')),...process.env};
const values=new Map<string,string>();
const collect=(source:Record<string,string|undefined>)=>{for(const [name,value] of Object.entries(source))if(/API_?KEY|PASSWORD|SECRET|TOKEN|DATABASE_URL/i.test(name)&&name!=='INDEXNOW_KEY'&&value&&value.length>=8)values.set(name,value);};
if(env.AIHOT_CREDENTIALS_DIR)for(const group of ['models','collectors','integrations','auth'])collect({...parseEnv(await readFile(path.join(env.AIHOT_CREDENTIALS_DIR,group+'.env'),'utf8').catch(()=>'')),...env});
collect(env);
if(!values.size)throw Error('No configured credentials found; provide .env or credential environment variables for the audit.');
const matches:Array<{path:string;names:string[]}>=[];
function check(where:string,data:Buffer|string){const text=typeof data==='string'?data:data.toString('utf8');const names=[...values].filter(([,value])=>[value,encodeURIComponent(value),JSON.stringify(value).slice(1,-1)].some(v=>text.includes(v))).map(([name])=>name);if(names.length)matches.push({path:where,names});}
const files=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root}).toString().split('\0').filter(Boolean);
for(const file of new Set(files)){const name=path.join(root,file);const info=await stat(name).catch(()=>null);if(info?.isFile()&&info.size<=8_000_000)check(file,await readFile(name));}
let assets=0;
async function walk(dir:string){for(const entry of await readdir(dir,{withFileTypes:true}).catch(()=>[])){const name=path.join(dir,entry.name);if(entry.isDirectory())await walk(name);else{assets++;check(path.relative(root,name),await readFile(name));}}}
await walk(path.join(root,'apps/web/build/client'));
const baseIndex=process.argv.indexOf('--base');const endpoints:Array<{path:string;status:number}>=[];
if(baseIndex!==-1){const base=new URL(process.argv[baseIndex+1]!);for(const endpoint of ['/','/flash','/news','/reviews','/api/shopping?view=recommended&limit=100','/api/v1/items?mode=all&limit=100','/feed/all.xml','/llms.txt','/api/health']){const response=await fetch(new URL(endpoint,base),{signal:AbortSignal.timeout(15000)});check(endpoint,await response.text());endpoints.push({path:endpoint,status:response.status});if(response.status!==200)matches.push({path:endpoint,names:['unexpected HTTP status']});}
 for(const endpoint of ['/.env','/.env.production','/.git/config','/credentials/models.env','/docker-compose.yml','/packages/backend/src/config.ts','/backup.sql','/assets/private.map','/api/admin/models']){const response=await fetch(new URL(endpoint,base),{redirect:'manual',signal:AbortSignal.timeout(15000)});check(endpoint,await response.text());endpoints.push({path:endpoint,status:response.status});if(![401,403,404].includes(response.status))matches.push({path:endpoint,names:['private path accessible']});}
}
console.log(JSON.stringify({credentialNames:[...values.keys()],sourceFiles:files.length,clientAssets:assets,secretMatches:matches,endpoints},null,2));
if(matches.length)process.exitCode=1;
