// Pure redaction shared by servers; this module never reads environment variables or credential files.
export const REDACTED='[REDACTED]';
const sensitiveField=/^(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-csrf-token|api[_-]?key|(?:access|refresh|id)[_-]?token|token|password|passwd|secret|client[_-]?secret|private[_-]?key)$/i;
export function redactText(text:string,values:readonly string[]=[]):string {
 let clean=text;
 for(const value of [...new Set(values)].filter(v=>v.length>=8).sort((a,b)=>b.length-a.length)){
  for(const encoded of new Set([value,encodeURIComponent(value),JSON.stringify(value).slice(1,-1)]))clean=clean.split(encoded).join(REDACTED);
 }
 return clean
  .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,'Bearer '+REDACTED)
  .replace(/\bsk-[A-Za-z0-9_-]{12,}/g,REDACTED)
  .replace(/((?:https?|postgres(?:ql)?|rediss?):\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi,'$1'+REDACTED+'@')
  .replace(/([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|key|password|secret|code)=)[^&#\s]*/gi,'$1'+REDACTED)
  .replace(/((?:"|')?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|client[_-]?secret|secret)(?:"|')?\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^,\s&;]+)/gi,(_match,prefix:string,value:string)=>prefix+(value.startsWith('"')?'"'+REDACTED+'"':value.startsWith("'")?"'"+REDACTED+"'":REDACTED));
}
export function redactValue(value:unknown,values:readonly string[]=[]):unknown {
 const seen=new WeakSet<object>();
 const walk=(input:unknown):unknown=>{
  if(typeof input==='string')return redactText(input,values);
  if(!input||typeof input!=='object')return input;
  if(seen.has(input))return '[Circular]';seen.add(input);
  if(input instanceof Date)return input;
  if(input instanceof Error){const error:Record<string,unknown>={type:input.name,message:walk(input.message),stack:walk(input.stack)};for(const [key,v] of Object.entries(input))error[key]=sensitiveField.test(key)?REDACTED:walk(v);if(input.cause!==undefined)error.cause=walk(input.cause);return error;}
  if(Array.isArray(input))return input.map(walk);
  const output:Record<string,unknown>={};for(const [key,v] of Object.entries(input))Object.defineProperty(output,key,{value:sensitiveField.test(key)?REDACTED:walk(v),enumerable:true,configurable:true,writable:true});return output;
 };
 return walk(value);
}
