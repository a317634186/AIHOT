// Preserve normal process exit behavior while keeping credentials out of diagnostic output.
import { redactSecrets,safeErrorText } from './secrets.ts';
for(const method of ['log','info','warn','error','debug','trace'] as const){const original=console[method].bind(console);console[method]=(...args:unknown[])=>original(...args.map(redactSecrets));}
process.on('uncaughtExceptionMonitor',error=>{error.message=safeErrorText(error);if(error.stack)error.stack=safeErrorText(error.stack);if(error.cause!==undefined)error.cause=redactSecrets(error.cause);});
