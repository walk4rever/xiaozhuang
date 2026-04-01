# 小庄

> 借古人的话，说今天的心。

小庄是一个面向现代表达与情绪场景的中文 AI 产品，以中国古典诗词、古文与周易为底，帮你找到一句最贴切的话，或写出心里想说的。

**在线体验**：[https://xz.air7.fun](https://xz.air7.fun)

---

## 功能模块

### 寻章

描述你看到的、感受到的，或直接上传一张照片，小庄从千年诗文中找到最贴切的那句话。

- 支持纯文字描述，也支持照片上传
- 返回原句、出处、白话解读、以及为什么它契合此刻
- 支持生成分享图

### 问心

以周易为镜，照见内心困惑。当你想不清楚、拿不定主意时，起一卦，结合卦辞、爻辞与 AI 解读，给出有意味的回应。

- 随机起卦（模拟蓍草法）
- 展示本卦、变卦卦象
- AI 结合卦辞与爻辞进行现代解读
- 支持生成分享图

### 述怀

借古人的笔意，把你心里的话写出来。从楚辞、道家、史传、词、禅语、唐宋古文、骈文、心学八种传统中随机取法，指定人物语感，写成古典短章。

- 输入你想表达的现代心念
- 随机抽取文体与历史人物语感
- 生成 4–8 句古典短章
- 支持生成分享图

### 慢读

每日一封《经史百家杂钞》节选来信，订阅后每天送达邮箱。不求一下读完，只求慢慢读懂：一点原文，一点解释，一点照见今天的意味。

- 每日定时推送，邮件订阅制
- 包含原文、一句话大意、白话直译、关键词注释、结构拆解、现实启发
- 每篇可在线阅读，支持生成分享图

---

## 技术栈

- [Next.js](https://nextjs.org) App Router
- [Supabase](https://supabase.com)（慢读订阅数据库）
- [Resend](https://resend.com)（邮件发送）
- OpenAI-compatible API（文本生成、视觉理解）

---

## 本地开发

```bash
npm install
npm run dev
```

新建 `.env.local`：

```bash
AI_API_KEY=your-api-key
AI_API_BASE_URL=https://your-provider.example.com/v1
AI_PRIMARY_MODEL=your-text-model
AI_VISION_MODEL=your-vision-model

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

RESEND_API_KEY=your-resend-api-key
DU_FROM_EMAIL=慢读 <du@example.com>

CRON_SECRET=your-cron-secret
APP_BASE_URL=https://your-domain.com
```

| 变量 | 说明 |
|------|------|
| `AI_PRIMARY_MODEL` | 主文本模型，用于寻章、问心、述怀 |
| `AI_VISION_MODEL` | 视觉模型，用于寻章照片输入；未配置则回退到主模型 |
| `SUPABASE_*` | 慢读订阅、退订与每日发送记录 |
| `RESEND_API_KEY` | 每日慢读邮件发送 |
| `CRON_SECRET` | 保护定时任务入口 |
| `APP_BASE_URL` | 确认邮件链接的域名（生产环境） |

```bash
npm run lint
npm run build
npm run start
```

---

## 部署

推荐部署至 [Vercel](https://vercel.com)。慢读每日准备任务通过 GitHub Actions 触发，发送任务通过 Vercel Cron 执行。
