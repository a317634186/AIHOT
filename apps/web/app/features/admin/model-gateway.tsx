import {useRef,useState} from 'react';
import type {GatewayInput,GatewayOverview,GatewaySlot} from '@aihot/contracts/model-gateway';
import {useAdminAction} from './action';
import {Badge,Button,Card,Field,Input,ReasonDialog,Select} from './ui';

export function ModelGatewaySettings({gateway:g}:{gateway:GatewayOverview}){
 const {run,busy,pending}=useAdminAction();
 const form=useRef<HTMLFormElement>(null);const keyInput=useRef<HTMLInputElement>(null);
 const [testSlot,setTestSlot]=useState<GatewaySlot>('primary');
 const [result,setResult]=useState<{ok:boolean;message:string;latencyMs:number}|null>(null);
 const [reset,setReset]=useState(false);
 function configuration(test=false):GatewayInput{
  const data=new FormData(form.current!);
  return {baseUrl:String(data.get('baseUrl')??''),defaultModelId:String(data.get('defaultModelId')??''),primaryModelId:String(data.get('primaryModelId')??''),secondaryModelId:String(data.get('secondaryModelId')??''),apiKey:keyInput.current?.value??'',revision:g.revision,reason:String(data.get('reason')??'')||(test?'Connection test':''),jsonMode:data.get('jsonMode')==='on',searchSlot:String(data.get('searchSlot')) as GatewaySlot,searchFallbackSlot:String(data.get('searchFallbackSlot')) as GatewaySlot,reviewSearchSlot:String(data.get('reviewSearchSlot')) as GatewaySlot,reviewFallbackSlot:String(data.get('reviewFallbackSlot')) as GatewaySlot};
 }
 return <Card title="AI 接口配置" right={<Badge tone={g.source==='admin'?'accent':'muted'}>{g.source==='admin'?'后台配置':'服务器配置'}</Badge>}>
  <p className="mb-4 text-[13px] text-ink-3">填写 OpenAI 兼容接口地址、模型 ID 和 API Key。保存后用于后续任务，无需重启。主模型、辅助模型都可填写其他提供商的模型 ID；在下方为各项任务选择要使用的模型。</p>
  <form ref={form} autoComplete="off" onSubmit={async e=>{e.preventDefault();setResult(null);const saved=await run('PUT','/api/admin/models/gateway',configuration(),{label:'gateway-save',success:'AI 接口配置已保存，后续调用立即生效'});if(saved&&keyInput.current)keyInput.current.value='';}}>
   <div className="grid gap-4 md:grid-cols-2">
    <Field label="接口地址 / Base URL" hint="填写 API 根路径，如 https://provider.example/v1"><Input name="baseUrl" type="url" required maxLength={1000} defaultValue={g.baseUrl} placeholder="https://provider.example/v1" spellCheck={false}/></Field>
    <Field label="API Key" hint={g.apiKeyConfigured?'已设置密钥，留空保留当前密钥。保存后加密存储，不回显。':'尚未设置密钥，请填写后保存。'}><Input ref={keyInput} name="apiKey" type="password" autoComplete="new-password" required={!g.apiKeyConfigured} maxLength={4096} placeholder={g.apiKeyConfigured?'留空保留当前密钥':'填写 API Key'} spellCheck={false}/></Field>
    <Field label="主模型 ID（写作 / 推荐 / 搜索）"><Input name="primaryModelId" required maxLength={200} defaultValue={g.primaryModelId} spellCheck={false}/></Field>
    <Field label="辅助模型 ID（筛选 / 分析 / 抽取）"><Input name="secondaryModelId" required maxLength={200} defaultValue={g.secondaryModelId} spellCheck={false}/></Field>
    <Field label="默认模型 ID" hint="下方任务选择 default 时使用这个模型。"><Input name="defaultModelId" required maxLength={200} defaultValue={g.defaultModelId} spellCheck={false}/></Field>
    <Field label="修改原因"><Input name="reason" required maxLength={500} placeholder="例如：更换 API 提供商或轮换密钥"/></Field>
   </div>
   <details className="mt-4 text-[13px]">
    <summary className="cursor-pointer text-ink-2">高级设置：搜索模型和 JSON 支持</summary>
    <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[['searchSlot','优惠搜索',g.searchSlot],['searchFallbackSlot','优惠搜索备用',g.searchFallbackSlot],['reviewSearchSlot','评测搜索',g.reviewSearchSlot],['reviewFallbackSlot','评测搜索备用',g.reviewFallbackSlot]].map(([name,label,value])=><Field key={name} label={label}><Select name={name} defaultValue={value}><option value="primary">主模型</option><option value="secondary">辅助模型</option><option value="default">默认模型</option></Select></Field>)}</div>
    <label className="mt-3 flex items-center gap-2"><input name="jsonMode" type="checkbox" defaultChecked={g.jsonMode}/>接口支持 JSON Object 输出</label>
    <p className="mt-2 text-[12px] text-ink-4">搜索需要提供商支持 Responses API 和 web_search 工具。连接测试检查文本生成；不代表已验证联网搜索。</p>
   </details>
   <div className="mt-5 flex flex-wrap items-center gap-3"><Button type="submit" tone="primary" disabled={busy} busy={pending==='gateway-save'}>保存 AI 配置</Button><Select aria-label="测试模型" value={testSlot} onChange={e=>setTestSlot(e.target.value as GatewaySlot)} className="max-w-40"><option value="primary">测试主模型</option><option value="secondary">测试辅助模型</option><option value="default">测试默认模型</option></Select><Button disabled={busy} busy={pending==='gateway-test'} onClick={async()=>{setResult(null);const checked=await run<{ok:boolean;message:string;latencyMs:number}>('POST','/api/admin/models/gateway/test',{configuration:configuration(true),slot:testSlot},{label:'gateway-test',revalidate:false});if(checked)setResult({...checked,message:checked.ok?'连接成功。可保存配置；联网搜索能力需由提供商支持。':'连接失败，请检查接口地址、密钥、模型 ID 或后台调用预算。'});}}>测试连接（调用一次）</Button>{g.source==='admin'&&<Button tone="ghost" disabled={busy} onClick={()=>setReset(true)}>恢复服务器配置</Button>}</div>
  </form>
  {result&&<p role="status" className={'mt-3 text-[13px] '+(result.ok?'text-ok':'text-hot')}>{result.message}（{(result.latencyMs/1000).toFixed(1)} 秒）</p>}
  <ReasonDialog open={reset} title="恢复服务器 AI 配置" description="后续任务将使用服务器原来的接口和密钥。" confirmLabel="恢复" busy={pending==='gateway-reset'} onClose={()=>setReset(false)} onSubmit={async reason=>(await run('DELETE','/api/admin/models/gateway',{revision:g.revision,reason},{label:'gateway-reset',success:'已恢复服务器 AI 配置'}))!==null}/>
 </Card>;
}
