# 慢读·书库入库进度

记录各书目的入库情况，包括已入卷、待入卷及脚本对应关系。

---

## 经史百家杂钞

- **性质**：选本，收录先秦至清代各家名篇，按文体分卷
- **编者**：曾国藩
- **总卷数**：26 卷（含序例）
- **原文件**：`data/经史百家杂钞.txt`
- **解析脚本**：`scripts/parse-jingshi.ts`
- **入库脚本**：`scripts/seed-jingshi.ts`
- **卷回填脚本**：`scripts/backfill-jingshi-volume.ts`
- **去重脚本**：`scripts/dedupe-du-passages.ts`
- **AI 解读脚本**：`scripts/generate-payloads.ts --volume=2`

### 入库进度

| 卷 | 文体 | 状态 | 入库条数 |
|---|---|---|---|
| 卷一 | 论著之属一 | ✅ 已入库 | 255 |
| 卷二 | 论著之属二 | ✅ 已入库 | 241 |
| 卷三 | 词赋之属上编一 | ✅ 已入库 | 211 |
| 卷四 | 词赋之属上编二 | ✅ 已入库 | 208 |
| 卷五 | 词赋之属上编三 | ✅ 已入库 | 193 |
| 卷六 | 词赋之属下编一 | ✅ 已入库 | 149 |
| 卷七 | 词赋之属下编二 | ✅ 已入库 | 149 |
| 卷八 | 序跋之属一 | ⬜ 未入库 | — |
| 卷九 | 序跋之属二 | ⬜ 未入库 | — |
| 卷十 | 诏令之属 | ✅ 已入库 | 210 |
| 卷十一 | 奏议之属一 | ⬜ 未入库 | — |
| 卷十二 | 奏议之属二 | ⬜ 未入库 | — |
| 卷十三 | 奏议之属三 | ⬜ 未入库 | — |
| 卷十四 | 书牍之属一 | ✅ 已入库 | 173 |
| 卷十五 | 书牍之属二 | ✅ 已入库 | 169 |
| 卷十六 | 哀祭之属 | ✅ 已入库 | 211 |
| 卷十七 | 传志之属上编一 | ⬜ 未入库 | — |
| 卷十八 | 传志之属上编二 | ⬜ 未入库 | — |
| 卷十九 | 传志之属上编三 | ⬜ 未入库 | — |
| 卷二十 | 传志之属下编一 | ⬜ 未入库 | — |
| 卷二十一 | 传志之属下编二 | ⬜ 未入库 | — |
| 卷二十二 | 叙记之属一 | ⬜ 未入库 | — |
| 卷二十三 | 叙事之属二 | ⬜ 未入库 | — |
| 卷二十四 | 典志之属一 | ⬜ 未入库 | — |
| 卷二十五 | 典志之属二 | ⬜ 未入库 | — |
| 卷二十六 | 杂记之属 | ✅ 已入库 | 265 |

> **AI 解读状态**：卷一、卷二、卷三、卷四、卷五、卷六、卷七、卷十、卷十四、卷十五、卷十六、卷二十六共 2434 条，payload 全部生成完毕（卷七：2026-05-03）。

### 入库命令

**推荐：一键入库（入库 + payload + author bio + article background）**

```bash
npx tsx scripts/seed-volume.ts --volume=3
```

单独步骤（调试用）：

```bash
# 只入库
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-jingshi.ts --volume=3

# 只生成 payload
npx tsx scripts/generate-payloads.ts --volume=3

# 只补 author bio / article background（全局检测缺口，幂等）
npx tsx scripts/backfill-authors-articles.ts
```

首次建库维护顺序：

```bash
# 1) 新库先跑 migration
# 2) 老库补 volume
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-jingshi-volume.ts

# 3) 检查并清理重复
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/dedupe-du-passages.ts --dry-run
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/dedupe-du-passages.ts

# 4) 之后按卷用一键命令
npx tsx scripts/seed-volume.ts --volume=2
```

---

## 待规划书目

| 书目 | 性质 | 状态 |
|---|---|---|
| 王阳明文集 | 作者全集（对话录/奏章/诗） | ⬜ 规划中 |
