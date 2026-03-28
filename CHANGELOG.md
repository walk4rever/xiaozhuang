# Changelog

## v0.5.6 - 2026-03-28
- 修复流式解读时用户先看到原始 JSON 再格式化的问题：JSON 在完整可解析前保持显示"解读生成中..."
- 将 Vercel API 函数切换至 Edge Runtime，解决 Hobby 计划下 Serverless 函数 10 秒硬限制导致的 504 超时问题（Edge Runtime 上限 30 秒）
- 调整 fetch AbortSignal.timeout 为 25 秒，确保在函数超时前优先触发，避免冷硬断连

> **技术备忘：Vite + Vercel Hobby 计划超时陷阱**
> 普通 Vite 项目的 `api/*.ts` 为 Serverless 函数，Hobby 计划硬限 10 秒，`vercel.json` 里的 `maxDuration` 会被忽略。
> Next.js App Router 路由使用 `export const maxDuration` 语法，Vercel 对其有特殊处理，实际可突破 Hobby 的 10 秒限制。
> 解决方案：在 `api/llm.ts` 顶部加 `export const config = { runtime: 'edge' }`，切换为 Edge Runtime，Hobby 上限升至 30 秒，且原生支持 SSE 流式输出。

## v0.5.5 - 2026-03-28
- LLM 接口路径统一改为中性命名 `/api/llm`
- 删除供应商特定命名与默认供应商网关地址，运行时必须通过 `AI_*` 环境变量提供模型服务配置
- 解读提示词补充本卦与变卦的完整爻辞、动爻变化说明，并要求模型输出结构化 JSON
- 当用户未说明所问事项时，默认按学业、工作、事业、财富、爱情、家庭、亲戚、朋友等维度择要分析
- Nginx 与 README 改为根路径部署说明，线上地址更新为 `https://bugua.air7.fun`

## v0.5.1 - 2026-03-27
- 模型配置统一为 `AI_*` 环境变量
- 本地 Vite 代理与 Vercel Serverless 代理统一补全 `/chat/completions`
- 前端解读请求默认模型改为通过 `AI_MODEL` 配置

## v0.2.0 - 2026-02-25
- 接入兼容 OpenAI Chat Completions 的模型接口，支持通过环境变量配置模型与 Base URL
- 解读内容支持Markdown分段展示，结构更清晰
- 解读提示词增强，输出更丰富并包含建议与注意事项
- 优化模型名透传逻辑，避免请求参数不兼容
