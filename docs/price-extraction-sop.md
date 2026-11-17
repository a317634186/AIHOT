# 单个商品的原价与特价提取 SOP

适用对象：Savlume 商品流里的每一条单品 offer（`product_deal` / `coupon_offer` / `cashback_offer` / `freebie`）。
目标：**原文说了原价就必须显示；原文没说就绝不能编。**

---

## 0. 一句话原则

> 显示一个错误的原价，比不显示原价严重得多。

错误的原价会制造不存在的折扣，读者点进去发现不是那个价，信任一次性耗尽。因此**所有拿不准的情况一律返回 null**。

---

## 1. 两个价格的定义

| 字段 | 含义 | 例子 |
|---|---|---|
| `checkoutPriceCents` | 读者**实际要付**的金额（用码后的到手价） | `$67.20` |
| `listedPriceCents` | 源站声明的**原价 / 划线价** | `$160.00` |

只有 `listed > checkout` 且折扣率在 5%–95% 之间，才会显示划线价和 `−N%` 徽标（`offerSavings` 强制）。

---

## 2. 判定流程（按顺序执行）

```
① 找到现价 ──> 没有现价？终止，不提取原价
      │
② 在同一句里找第二个金额
      │
③ 该金额前面/后面必须紧邻"原价线索词"
      │
④ 通过全部黑名单检查
      │
⑤ 写入 listedPriceCents
```

### 第 ③ 步：线索词清单（唯一合法入口）

**金额前面出现**（允许中间夹一个 `price` 或 `of`）：

```
was / reg. / reg. price / regular / regularly / regular price
list price / retail / retails for / MSRP
originally / previously / normally
instead of / down from / compared to / compare at
```

**金额后面出现**（括号形式）：

```
(reg. $55.99)   (regularly $120)   (was $40)   (list $50)
```

**表头形式**：两个金额紧邻，第二个更大且不超过第一个的 8 倍。

```
$67 $160 free shipping     →  $67 是现价，$160 是原价
$45 $75 free shipping      →  同上
```
表头会四舍五入（`$67` 实际是 `$67.20`），因此允许 1% 误差或 1 美元以内。

**跨句形式**：原价在**紧接的下一句**，且带线索词。

```
... down at $209.30 shipped. You're looking at a regularly $299 Sonos speaker ...
```

---

## 3. 黑名单：这些**不是**原价

| 类型 | 反例 | 原因 |
|---|---|---|
| 分期/月供 | `$36 per month`、`$20/mo`、`36 months` | 月供总额 ≠ 商品价 |
| 省钱金额 | `$6 off`、`save $50` | 这是差额不是价格 |
| 门槛 | `orders over $100`、`minimum $50` | 是消费门槛 |
| 运费 | `shipping was $8` | 运费不是商品价 |
| 礼品卡/返现面额 | `$50 gift card`、`$20 cashback` | 不是到手价 |
| 模糊区间 | `over $500`、`about $300`、`up to $500`、`nearly $400` | 原文没给确切数字 |
| 组合价 | `2 for $6.49` 对比单价原价 | 计价单位不一致 |
| 百分比 | `30% off` | 不是金额 |
| 异常倍数 | 原价 > 现价 × 8 | 几乎一定是不同商品或错误 |

**实测教训**：`originally cost over $500` 曾被写成 `$501` —— 这就是必须拒绝模糊区间的真实案例。

---

## 4. 多商品文章的额外约束

原文经常在一段里列多件商品：

```
Nike Air Max DN8s are $85 (instead of $220), and Skechers drop to $19, down from $105.
```

规则：**只取与本品现价同一句内、且紧邻本品的那一对。** 现价 `$19` 只能匹配 `$105`，绝不能配成 `$220`。

---

## 5. 代码位置（规则的真实来源）

| 文件 | 职责 |
|---|---|
| `packages/contracts/src/price-reference.ts` | 确定性提取器，SOP 的可执行版本 |
| `packages/backend/src/shopping/offers.ts` | 入库时接线：模型没给原价时，用原文兜底恢复 |
| `industry/prompts/shopping-extract.md` | 让模型遵守同一套规则 |
| `tests/price-reference.test.ts` | 回归测试，28 个真实样本 |

**为什么要有确定性提取器**：模型会漏（实测漏掉 39 条原文明确写了原价的条目）。代码兜底不依赖模型状态，也不会随时间漂移。

---

## 6. 关键实现细节

**句号陷阱**：`Reg. price $40` 里的 `.` 会被误判为句子结束。必须先屏蔽 `reg.` `vs.` `approx.` `Inc.` 等缩写中的点再分句。

**只信任引文不够**：原有逻辑要求原价必须出现在 `priceEvidence` 引文中。实测这导致大量漏提取——模型的引文往往只截取现价那一句。现在允许从**全文**恢复，但必须通过第 2、3 节的严格判定。

**已结束促销不能把原价当现价**：`shopping.ts` 里曾用 `Math.max(listed, checkout)` 作为"恢复后的现价"，这会把 `$160` 当成今天的售价显示。已修复为保留记录成交价。

---

## 7. 验证清单（每次改动后必跑）

```bash
npm run typecheck
node --test tests/price-reference.test.ts
```

回归测试必须覆盖：

- ✅ 括号形式 `(regularly $24.91)`
- ✅ 表头形式 `$67 $160 free shipping`
- ✅ 跨句形式 `down at $209.30. regularly $299`
- ✅ 千分位 `$1,299 down from $1,899`
- ❌ 月供、省钱、运费、门槛、礼品卡、模糊区间、组合价

---

## 8. 已知限制

1. **原文确实没写原价的，永远补不出来**（实测 150 条缺原价中，约 108 条属于这类）
2. **跨句恢复只读一句**，更远的上下文不读——避免误配
3. **Redis/单日缓存**：写入后页面最多 5 分钟才反映，属正常
4. **模型与正则双轨**：模型给的优先，模型没给的才用正则兜底；两者结论冲突时以更保守的一方为准

---

## 9. 历史数据修复流程

```bash
# 1. 备份
CREATE TABLE _backup_offer_data_YYYYMMDD AS
  SELECT article_id, data FROM shopping_offers WHERE ...;

# 2. 导出缺原价的条目
SELECT json_build_object('id',d.article_id,'cur',(d.data->>'checkoutPriceCents')::int,
       'src',coalesce(a.body_text,a.excerpt,''))::text FROM ...;

# 3. 用 price-reference.ts 跑一遍，人工抽查异常高折扣（>70%）

# 4. 写入
UPDATE shopping_offers SET data = jsonb_set(data,'{listedPriceCents}', to_jsonb($1))
WHERE article_id = $2 AND coalesce(data->>'listedPriceCents','')='';

# 5. 逐条比对 API 返回的 priceDisplay.amountCents 是否仍等于原现价
```

**血的教训**：第一批 39 条写入后，有 23 条因为读层 bug 把原价显示成了现价。修复流程第 5 步不可跳过。