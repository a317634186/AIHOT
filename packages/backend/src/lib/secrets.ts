import { credentials } from '../config.ts';
import { redactText,redactValue } from '@aihot/contracts/secrets';
const secretName=/(?:API_?KEY|TOKEN|PASSWORD|SECRET|DATABASE_URL|EGRESS_PROXY_URL)/i;
const activeSecrets=new Set<string>();
export function registerSecret(value:string){if(value.length>=8)activeSecrets.add(value);}
function secretValues():string[]{
 const values:string[]=[...activeSecrets];
 for(const [key,value] of Object.entries(process.env))if(secretName.test(key)&&value&&key!=='INDEXNOW_KEY')values.push(value);
 for(const group of ['models','collectors','integrations','auth'] as const)for(const [key,value] of Object.entries(credentials(group)))if(secretName.test(key)&&key!=='INDEXNOW_KEY')values.push(value);
 return values;
}
export const redactSecrets=(value:unknown)=>redactValue(value,secretValues());
export const safeErrorText=(value:unknown)=>redactText(value instanceof Error?value.message:String(value),secretValues());
