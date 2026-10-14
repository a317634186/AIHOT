import {BudgetExceededError} from '../providers/receipts.ts';
import {z} from 'zod';
import {randomBytes} from 'node:crypto';
import {draftGateway,gatewayMetadata,type RuntimeGateway} from '../providers/model-gateway.ts';
import {chatJson,markReceiptsCompleted} from '../providers/llm.ts';
import {audit} from './auth.ts';
const attempts=new Map<string,number[]>();
export async function testGateway(input:unknown,selected:unknown,actor:string){
 if(!['default','primary','secondary'].includes(String(selected)))throw Object.assign(Error('Select a model to test.'),{statusCode:400});
 const recent=(attempts.get(actor)??[]).filter(t=>Date.now()-t<60000);
 if(recent.length>=3)throw Object.assign(Error('Please wait before testing again.'),{statusCode:400});
 attempts.set(actor,[...recent,Date.now()]);
 const gateway=await draftGateway(input);
 const preset=selected==='primary'?'gemini-3.8-flash-high':selected==='secondary'?'gpt-6-luna':'default';
 const started=Date.now();
 try{
  const result=await chatJson({model:preset,gatewayDraft:gateway,purpose:'gateway_connection_test',subject:'admin:'+actor+':'+randomBytes(12).toString('hex'),promptVersion:'gateway-test@1',system:'Return only JSON: {"ok":true}. This is an API connectivity check.',user:'Reply with {"ok":true}.',schema:z.object({ok:z.literal(true)}),temperature:0,maxTokens:512,timeoutMs:25000});
  await markReceiptsCompleted([result.receiptId]);
  await record(gateway,actor,String(selected),true);
  return {ok:true,latencyMs:Date.now()-started,modelId:selected==='primary'?gateway.primaryModelId:selected==='secondary'?gateway.secondaryModelId:gateway.defaultModelId,message:'Connection successful. This checks chat completion only; web-search support depends on the provider.'};
 }catch(error){
  await record(gateway,actor,String(selected),false);
  // Never echo provider diagnostics or draft credentials, including with an unrecognized key format.
  const message=error instanceof BudgetExceededError?'Model budget reached. Check the backend usage limits.':'Connection failed. Check the API address, API Key, model ID and provider support.';
  return {ok:false,latencyMs:Date.now()-started,message};
 }
}
async function record(gateway:RuntimeGateway,actor:string,selected:string,ok:boolean){await audit(actor,'models.gateway-test','ai.gateway','Administrator requested one connectivity check',null,{...gatewayMetadata(gateway),selected,ok});}
