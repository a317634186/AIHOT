import {Form,Link,useSearchParams} from 'react-router';
import type {Route} from './+types/community-submissions';
import {adminGet} from '../../lib/admin.server';
import {AdminPage,Card,Empty} from '../../features/admin/ui';
import {ReviewCard,type Pending} from './community';

type Submissions={items:Pending[];total:number;page:number;status:string};
export async function loader({request}:Route.LoaderArgs){
 const query=new URL(request.url).searchParams;
 const params=new URLSearchParams({status:query.get('status')??'all',page:query.get('page')??'1'});
 return adminGet<Submissions>(request,'/api/admin/community/submissions?'+params);
}
export const meta:Route.MetaFunction=()=>[{title:'User deal submissions · Savlume'}];
export default function CommunitySubmissions({loaderData}:Route.ComponentProps){
 const [query]=useSearchParams();const status=loaderData.status;
 const url=(page:number)=>'?'+new URLSearchParams({status,page:String(page)});
 return <AdminPage title="用户爆料" subtitle="查看用户提交的商品优惠和商家活动，并处理审核结果。">
  <Card title={`爆料列表 · ${loaderData.total}`} right={<Form method="get"><select name="status" defaultValue={query.get('status')??'all'} aria-label="Filter by status" className="rounded border border-line bg-surface p-2 text-sm" onChange={e=>e.currentTarget.form?.requestSubmit()}><option value="all">全部状态</option><option value="pending_ai">等待 AI 审核</option><option value="reviewing">AI 审核中</option><option value="pending_review">等待管理员审核</option><option value="published">已发布</option><option value="rejected">已拒绝</option><option value="removed">已移除</option></select></Form>}>
   <div className="grid gap-3">{loaderData.items.length?loaderData.items.map(post=><ReviewCard key={post.id} post={post}/>):<Empty>暂无符合条件的爆料。</Empty>}</div>
   <div className="mt-4 flex gap-4 text-sm text-accent">{loaderData.page>1&&<Link to={url(loaderData.page-1)}>← 上一页</Link>}{loaderData.page*50<loaderData.total&&<Link to={url(loaderData.page+1)}>下一页 →</Link>}</div>
  </Card>
 </AdminPage>;
}
