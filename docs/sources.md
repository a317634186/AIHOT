# 信源

信源在后台“信源”页管理：新建、试抓一次看看抓到什么、改频率、启停、看失败原因和最近的条目。首次启动时，`industry/sources.json` 里的示范信源会被导入。

## 六种信源

| 类型 | 适合 | 需要 |
|---|---|---|
| `rss` | 有 RSS / Atom 的博客、媒体、Substack、公众号转 RSS 服务 | 无 |
| `web_list` | 没有 RSS 的网页列表（新闻页、博客列表、更新日志） | 写选择器；抓不到时可以经 Jina Reader 渲染（按次计费） |
| `json_list` | 返回 JSON 的接口（GitHub Releases 等） | 写字段路径 |
| `x_search` | X（推特）账号 | SocialData 的 key，按请求计费 |
| `mp_account` | 微信公众号 | 极致了（Dajiala）的 key，按请求计费 |
| `external` | 你自己的脚本推送进来的内容 | `INGEST_TOKEN`，见下文 |

每种信源认哪些配置项写在 `packages/backend/src/sources/config-keys.ts`。填了不认识的配置项，保存会被拒绝、抓取会直接失败并在后台显示原因，不会悄悄退回通用解析。

### 官方购物网站

默认信源包含 Amazon Today’s Deals 和 Woot Sellout Daily Deals：从官方聚合页读取商品卡片，清除临时追踪参数后，按同一套 AI 筛选、商品信息抽取和商家验证流程处理；Woot 单品直接使用官方商品页，Amazon 商品链接附加站点配置的 Associate 标签。聚合文章如果是跨品类清仓活动，则作为活动发布；只有来源提供具体单品链接且零售商页面能匹配商品，才会单独形成单品优惠。

官方零售商页面只证明商品和促销信息由商家发布，不能证明它是全网最低价。AI 会根据来源里的商品和价格证据、Savlume 实际记录的价格历史筛选优惠；商品详情也会列出站内已采集到的同型号跨店报价。目前没有覆盖全网的价格数据接口，因此不会把判断表述成“全网最低”或历史最低。Walmart Deals 当前对服务器请求返回机器人验证页，没有绕过验证；接入 Walmart 需要可授权使用的官方或联盟商品数据 feed/API。

已增加 9to5Mac Deals RSS（每 30 分钟检查、每日最多 20 条）和 The Krazy Coupon Lady 的公开优惠列表（同样每 30 分钟、每日最多 20 条）。KCL 的 CJ 联盟跳转会先解析其 URL 参数中的零售商目标；仅能确认到已配置官方商家的具体商品/活动链接才可用于购买，缺少直接目标的商品由现有 AI 补链任务检查，仍未确认的优惠不会展示购买入口。首次导入每个来源最多 5 条。

本轮没有启用 TechBargains（服务器返回 Cloudflare 验证页）、Brad’s Deals（抓取到的优惠详情没有公开可提取的商家链接）或 Dealsea（优惠详情页未暴露静态商品链接）。Keepa、CamelCamelCamel、Google Shopping、PriceGrabber、Shopzilla、Honey 和 Capital One Shopping 属于价格/扩展/API 数据服务，不是可直接接入的公开 RSS；需要相应的授权 API/feed 才能把它们用于可追溯的价格比较。

### rss

```json
{ "feedUrl": "https://example.com/feed.xml" }
```

可选：`summaryIsBody`（订阅里的摘要就是全文）、`allowCategories` / `denyCategories`（按订阅里的分类过滤）。

### web_list

```json
{
  "url": "https://example.com/news",
  "itemSelector": "article",
  "linkSelector": "a",
  "titleSelector": "h2",
  "publishedAtSelector": "time"
}
```

- `parseMode`：`html`（默认，用选择器）、`markdown`（经 Jina 渲染后按 Markdown 读）、`docusaurus_changelog`。
- `detail`：列表缺日期、标题或摘要时抓详情页补齐（`publishedAtSelector`、`titleSelector`、`summarySelector` 等）。
- `allowUrlPrefixes` / `denyUrlPrefixes`：只收某些路径下的文章。
- `stripQueryParams`：从条目链接去除指定的追踪参数，避免同一内容因动态参数反复入库。

### x_search

```json
{ "query": "from:SomeAccount -filter:replies" }
```

普通账号会被自动合并成一次搜索（每次最多二十几个账号），省请求数。

### mp_account

```json
{ "ghid": "gh_xxxxxxxx", "nickname": "公众号名称" }
```

每个公众号按它的抓取间隔检查一次（查列表按次计费），新文章的正文一并取回。

## 分级、参与方式与全文

- **分级** `tier`：`T1` 官方一手（官网、官方博客、机构）、`T1_5` 官方账号与准官方创作者、`T2` 媒体与个人、`EXCLUDE_MP` 不参与精选。入选门槛按分级不同（`industry/selection.ts`）。
- **参与方式** `participation_mode`：`editorial` 进精选和全部动态；`hot_signal` 不单独展示，只作为“大家在讨论什么”的热度证据；`isolated` 不进任何公开页面。
- **一手** `first_party`：来源是当事方自己。事件页会优先展示一手报道。
- **全文**：`site_fulltext` 决定站内能不能显示全文，`syndicate_fulltext` 决定全文 RSS 能不能带正文。两者**默认都关**，只显示摘要和原文链接；来源明确允许时再打开。公众号、付费墙内容不会因为技术上抓得到就获得全文展示。

## 抓取频率

每个信源有自己的抓取间隔。每天 04:20 会按近 7 天的产出自动调整：产出多的抓得勤，最短 15 分钟；免费信源最长 60 分钟，按次计费的信源最长 120–180 分钟。

抓取失败不推进位置，下次从同一处继续；连续失败的信源在后台标红，每周一会在运营群发一份信源周报（配置了飞书内部群时）。

## 规则：旧文不刷屏

首次发现时原文已经发布超过 48 小时的资料、新信源第一次导入的存量条目、标记为回灌的推送，都按原文时间归档：不进入“今天”，也不推送。这条规则所有入口共用，防止一次性导入历史内容刷屏。

## 外部推送接口

自己写脚本抓的内容，可以推进站里，走和普通采集一样的判重、精选和归组。

```
POST /api/ingest/items
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json

{
  "sourceId": "my-crawler",
  "sourceName": "我的抓取脚本",
  "items": [
    { "title": "必填", "url": "必填", "publishedAt": "2026-10-01T08:00:00+08:00", "author": "可选" }
  ]
}
```

- `INGEST_TOKEN` 在 `.env` 里设置，至少 16 位；不设置时接口一律返回 401。
- 每次最多 50 条；每个客户端每分钟最多 10 次。
- `items` 中每条必须是 JSON 对象；包含 `null`、数组或其他非对象值时返回 400，且不会创建或更新信源，也不会写入条目。
- 返回 `{"ok": true, "created": <新建条数>}`。缺标题或网址的条目会被跳过，同一请求里重复的网址只取第一条。
- `sourceId` 不存在时会自动建一个 `external` 信源，默认不进公开页面：到后台把它的参与方式改成 `editorial` 才会出现在站上。
- 在后台暂停信源后，推送接口返回 409，不再接收新文章；恢复信源后可以继续推送。
- 条目的 `raw._aihot.backfill` 为 `true` 时按历史回灌处理（不进入“今天”、不推送）。
