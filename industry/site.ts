// 站点身份和读者看得到的文案。换成你的行业时，先改这个文件。
// 网页和后端都读它；改完重新构建（docker compose up --build）即可生效。
// 域名不在这里：部署时用环境变量 SITE_URL 设置。

export const SITE = {
  /** 站名：导航、页面标题、分享图、RSS、MCP、后台都用它。 */
  name: "Savlume",
  /**
   * 行业词：拼进默认说法里，比如“AI 日报”“AI 动态”。
   * 改成“法律”“HR”“黄金”之类，页面上就会变成“法律日报”“法律动态”。
   */
  subject: "Shopping",
  /** 首页的完整标题（浏览器标签、搜索结果）。 */
  homeTitle: "Savlume | US Shopping Deals, Coupon Codes & Price Comparisons",
  /** 一句话介绍：搜索引擎、分享卡片、RSS、llms.txt 会用。 */
  description: "Discover US shopping deals, coupon codes, retailer offers and shopping news. Compare recorded prices and check buying conditions with Savlume.",
  /** 首页左上角和侧边栏下面的一行小字。 */
  tagline: "AI Picks. Better Deals.",
  /** 界面语言（HTML lang、og:locale）。 */
  locale: "en-US",
  /** 默认域名，只在没设置 SITE_URL 时使用。 */
  defaultUrl: "http://localhost:3000",
  /**
   * MCP 工具名的前缀（小写字母、数字、下划线），工具会叫 myhot_get_latest、myhot_search……
   * 已经有人接入后就不要再改。
   */
  mcpPrefix: "dealbrief",
  /** 对外联系邮箱（选填）：使用规则、llms.txt、响应头里会写。 */
  contactEmail: null as string | null,
  /** 页脚的一行小字（选填）。 */
  footerNote: "Independent shopping briefs for US consumers.",
  /** 中国大陆网站的 ICP 备案号（选填），填了就显示在页脚并链接到工信部备案系统。 */
  icp: null as string | null,
  /** 结构化数据里的网站运营者（搜索引擎用）。 */
  organization: {
    name: "Savlume",
    /** 创始人（选填）：{ name, url, description }。 */
    founder: null as null | { name: string; url?: string; description?: string },
  },
  /** 抓取信源时报上的名字（User-Agent 里用），不要冒用别的站。 */
  crawlerName: "SavlumeBot",
} as const;

/** 关于页的文案。数字（信源数、收录数、精选数、日报期数）来自站内实时统计，不用写在这里。 */
export const ABOUT = {
  kicker: "About Savlume",
  headline: ["A lower price is only", "part of the story."] as [string, string],
  lead: "We monitor {sources} sources for US shopping offers and consumer news. We explain the price, the conditions, and what remains unverified.",
  steps: {
    collect: "Public feeds surface leads. Merchant and brand pages provide primary evidence.",
    store: "Different sizes, sellers, conditions, and eligibility remain separate offers.",
    select: "Value, evidence, US availability, reliability, and usefulness guide selection. Commission does not affect ranking.",
    publish: "Read AI Picks, Best Deals, shopping news and Reviews & Picks, plus an 8 a.m. Eastern briefing. Prices can change; confirm the final total at the merchant.",
  },
  maker: null as null | { name: string; greeting: string[]; avatarSourceId?: string | null; wechat?: {title:string;note:string}; feishu?: {title:string;note:string} },
  copyright: "We publish original summaries and links. Images and original reporting belong to their respective owners. For corrections or removal requests, use our",
} as const;

/** “AI 日报”这类说法：行业词和名词之间，英文词加空格，中文词不加。 */
export function withSubject(noun: string): string {
  return /[A-Za-z0-9]$/.test(SITE.subject) ? `${SITE.subject} ${noun}` : `${SITE.subject}${noun}`;
}
