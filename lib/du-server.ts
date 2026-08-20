import {
  buildDuUserPrompt,
  DU_SYSTEM_PROMPT,
  AUTHOR_DESCRIPTION_PROMPT,
  ARTICLE_BACKGROUND_PROMPT,
  type DuOutput,
} from '@/data/du-prompt'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type Subscriber = {
  id: number
  email: string
}

export type Passage = {
  id: number
  source_book: string
  source_origin: string | null
  title: string | null
  content: string
  difficulty: number
  theme: string | null
  volume?: number | null
  payload: DuOutput | null
}

export type PassageFull = Passage & {
  volume: number | null
  enabled: boolean
  payload_generated_at: string | null
  last_sent_at: string | null
}

export type PassageUpdate = Partial<{
  content: string
  title: string
  source_origin: string
  difficulty: number
  theme: string
  enabled: boolean
}>

export type DailyRun = {
  id: number
  run_date: string
  passage_id: number
  sent_count: number
}

export type DailyRunWithPassage = DailyRun & {
  passage: Passage
}

export type Author = {
  source_origin: string
  description: string
  updated_at: string
}

export type Article = {
  source_origin: string
  base_title: string
  background: string
  updated_at: string
}

export type PassageContext = {
  baseTitle: string
  segmentNumber: number | null
  currentIndex: number
  totalSegments: number
  segmentIds: number[]
  prevId: number | null
  nextId: number | null
  contextLine: string
}

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
const env = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  resendApiKey: process.env.RESEND_API_KEY,
  appBaseUrl:
    process.env.APP_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000'),
  duFromEmail: process.env.DU_FROM_EMAIL,
  duAdminEmail: process.env.DU_ADMIN_EMAIL,
  cronSecret: process.env.CRON_SECRET,
  // 慢读 payload/作者简介生成統一走 relay（与寻章/问心/述怀三个客户端模块同一个上游），
  // 不再自调用本应用的 /api/llm —— 该路由已删除，见 CLAUDE.md「LLM access」一节。
  duLlmUrl: process.env.NEXT_PUBLIC_LLM_URL,
}

const required = (value: string | undefined, name: string): string => {
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

// ---------------------------------------------------------------------------
// Supabase REST client
// ---------------------------------------------------------------------------
const supabaseFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const supabaseUrl = required(env.supabaseUrl, 'SUPABASE_URL')
  const serviceRoleKey = required(env.supabaseServiceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY')

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Supabase request failed: ${response.status} ${text}`)
  }

  if (response.status === 204) return null as T
  const text = await response.text()
  if (!text) return null as T
  return JSON.parse(text) as T
}

const supabaseFetchPaged = async <T>(path: string): Promise<{ data: T[]; total: number }> => {
  const supabaseUrl = required(env.supabaseUrl, 'SUPABASE_URL')
  const serviceRoleKey = required(env.supabaseServiceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY')

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'count=exact',
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Supabase request failed: ${response.status} ${text}`)
  }

  const total = parseInt(response.headers.get('content-range')?.split('/')[1] ?? '0', 10)
  const data = (await response.json()) as T[]
  return { data, total }
}

// ---------------------------------------------------------------------------
// Subscribers
// ---------------------------------------------------------------------------
const generateToken = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

export const subscribeEmail = async (email: string): Promise<{ token: string; alreadyActive: boolean }> => {
  // 检查是否已经是 active 订阅者
  const existing = await supabaseFetch<{ status: string }[]>(
    `xz_du_subscribers?email=eq.${encodeURIComponent(email)}&select=status`
  )
  if (existing.length > 0 && existing[0].status === 'active') {
    return { token: '', alreadyActive: true }
  }

  const token = generateToken()
  await supabaseFetch('xz_du_subscribers?on_conflict=email', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      email,
      status: 'pending',
      confirm_token: token,
      unsubscribed_at: null,
    }]),
  })
  return { token, alreadyActive: false }
}

export const confirmSubscription = async (token: string): Promise<boolean> => {
  const rows = await supabaseFetch<{ id: number }[]>(
    `xz_du_subscribers?confirm_token=eq.${token}&status=eq.pending&select=id`
  )
  if (!rows.length) return false
  await supabaseFetch(`xz_du_subscribers?confirm_token=eq.${token}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'active', confirm_token: null }),
  })
  return true
}

export const unsubscribeEmail = async (email: string): Promise<void> => {
  await supabaseFetch(`xz_du_subscribers?email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() }),
  })
}

export const getActiveSubscribers = async (): Promise<Subscriber[]> => {
  return supabaseFetch<Subscriber[]>(
    'xz_du_subscribers?select=id,email&status=eq.active&order=id.asc'
  )
}

export const sendConfirmEmail = async (email: string, token: string): Promise<void> => {
  const resendApiKey = required(env.resendApiKey, 'RESEND_API_KEY')
  const from = required(env.duFromEmail, 'DU_FROM_EMAIL')
  const baseUrl = env.appBaseUrl
  const confirmUrl = `${baseUrl}/api/du/confirm?token=${token}`

  const html = `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2a2520;line-height:1.8;">
  <p style="font-size:1.1rem;">你好，</p>
  <p>感谢订阅<strong>小庄·慢读</strong>。请点击下方链接确认订阅：</p>
  <p style="margin:2rem 0;">
    <a href="${confirmUrl}"
       style="background:#5f7c77;color:#fbf8f1;padding:0.75rem 1.5rem;border-radius:999px;text-decoration:none;font-size:1rem;">
      确认订阅
    </a>
  </p>
  <p style="color:#96836e;font-size:0.9rem;">链接 24 小时内有效。如非本人操作，忽略此邮件即可。</p>
</div>`.trim()

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [email], subject: '确认订阅｜小庄·慢读', html }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Resend confirm email failed: ${response.status} ${text}`)
  }
}

// ---------------------------------------------------------------------------
// Passage selection  —  从未发送过的里随机选，库存耗尽则报错
// ---------------------------------------------------------------------------
export const pickTodayPassage = async (): Promise<Passage> => {
  const unsent = await supabaseFetch<Passage[]>(
    'xz_du_passages?select=id,source_book,source_origin,title,content,difficulty,theme,payload' +
      '&enabled=eq.true&last_sent_at=is.null&payload=not.is.null&limit=500'
  )

  if (!unsent.length) throw new Error('All passages have been sent. Please seed more content.')
  return unsent[Math.floor(Math.random() * unsent.length)]
}

export const getPassageById = async (id: number): Promise<Passage | null> => {
  const rows = await supabaseFetch<Passage[]>(
    `xz_du_passages?select=id,source_book,source_origin,title,content,difficulty,theme,volume,payload&id=eq.${id}&limit=1`
  )
  return rows[0] ?? null
}

export const getPassageByIdFull = async (id: number): Promise<PassageFull | null> => {
  const rows = await supabaseFetch<PassageFull[]>(
    `xz_du_passages?select=id,source_book,source_origin,title,content,difficulty,theme,volume,enabled,payload,payload_generated_at,last_sent_at&id=eq.${id}&limit=1`
  )
  return rows[0] ?? null
}

export const updatePassage = async (id: number, fields: PassageUpdate): Promise<void> => {
  if (Object.keys(fields).length === 0) return
  await supabaseFetch(`xz_du_passages?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  })
}

export function parseSegment(title: string): { base: string; segment: number | null } {
  const m = title.match(/^(.+?)（(\d+)）$/)
  if (m) return { base: m[1], segment: parseInt(m[2], 10) }
  return { base: title, segment: null }
}

export const getPassageContext = async (
  passageId: number,
  sourceOrigin: string,
  title: string
): Promise<PassageContext> => {
  const { base, segment } = parseSegment(title)

  const siblings = await supabaseFetch<{ id: number }[]>(
    `xz_du_passages?select=id&source_origin=eq.${encodeURIComponent(sourceOrigin)}&title=like.${encodeURIComponent(base + '%')}&enabled=eq.true&order=id.asc`
  )

  const ids = siblings.map((s) => s.id)
  const idx = ids.indexOf(passageId)
  const totalSegments = ids.length
  const currentIndex = idx >= 0 ? idx + 1 : 1
  const prevId = idx > 0 ? ids[idx - 1] : null
  const nextId = idx < ids.length - 1 ? ids[idx + 1] : null

  let contextLine = `节选自《${sourceOrigin}》· ${base}`
  if (segment !== null && totalSegments > 1) {
    contextLine += `｜第 ${segment} 段，共 ${totalSegments} 段`
  }

  return {
    baseTitle: base,
    segmentNumber: segment,
    currentIndex,
    totalSegments,
    segmentIds: ids,
    prevId,
    nextId,
    contextLine,
  }
}

export type ArticleView = {
  baseTitle: string
  sourceOrigin: string
  sourceBook: string
  volume: number | null
  theme: string | null
  segments: Passage[]
  author: Author | null
  article: Article | null
}

// Resolves the full article (all segments, in order) that a given passage
// belongs to, keyed by source_origin + base title (segments share a title
// like "篇名（1）", "篇名（2）"). Accepts any segment's id as the anchor.
export const getArticleView = async (passageId: number): Promise<ArticleView | null> => {
  const anchor = await getPassageById(passageId)
  if (!anchor || !anchor.source_origin || !anchor.title) return null

  const { base } = parseSegment(anchor.title)
  const sourceOrigin = anchor.source_origin

  const [segments, author, article] = await Promise.all([
    supabaseFetch<Passage[]>(
      `xz_du_passages?select=id,source_book,source_origin,title,content,difficulty,theme,volume,payload&source_origin=eq.${encodeURIComponent(sourceOrigin)}&title=like.${encodeURIComponent(base + '%')}&enabled=eq.true&order=id.asc`
    ),
    getAuthor(sourceOrigin).catch(() => null),
    getArticle(sourceOrigin, base).catch(() => null),
  ])

  return {
    baseTitle: base,
    sourceOrigin,
    sourceBook: anchor.source_book,
    volume: anchor.volume ?? null,
    theme: anchor.theme,
    segments,
    author,
    article,
  }
}

// ---------------------------------------------------------------------------
// Daily runs
// ---------------------------------------------------------------------------
export const getRunByDate = async (date: string): Promise<DailyRunWithPassage | null> => {
  const runs = await supabaseFetch<
    Array<{
      id: number
      run_date: string
      passage_id: number
      sent_count: number
      xz_du_passages: Passage
    }>
  >(
    `xz_du_daily_runs?select=id,run_date,passage_id,sent_count,xz_du_passages(id,source_book,source_origin,title,content,difficulty,theme,volume,payload)&run_date=eq.${date}&limit=1`
  )

  if (!runs[0]) return null

  const row = runs[0]
  return {
    id: row.id,
    run_date: row.run_date,
    passage_id: row.passage_id,
    sent_count: row.sent_count,
    passage: row.xz_du_passages,
  }
}

export const getRecentRuns = async (limit = 7): Promise<DailyRunWithPassage[]> => {
  const runs = await supabaseFetch<
    Array<{
      id: number
      run_date: string
      passage_id: number
      sent_count: number
      xz_du_passages: Passage
    }>
  >(
    `xz_du_daily_runs?select=id,run_date,passage_id,sent_count,xz_du_passages(id,source_book,source_origin,title,content,difficulty,theme,volume,payload)&order=run_date.desc&limit=${limit}`
  )

  return runs.map((row) => ({
    id: row.id,
    run_date: row.run_date,
    passage_id: row.passage_id,
    sent_count: row.sent_count,
    passage: row.xz_du_passages,
  }))
}

export const getRecentRunsPaged = async (page: number, limit: number): Promise<{ items: DailyRunWithPassage[]; total: number }> => {
  const offset = (Math.max(1, page) - 1) * limit
  const { data, total } = await supabaseFetchPaged<{
    id: number
    run_date: string
    passage_id: number
    sent_count: number
    xz_du_passages: Passage
  }>(
    `xz_du_daily_runs?select=id,run_date,passage_id,sent_count,xz_du_passages(id,source_book,source_origin,title,content,difficulty,theme,volume,payload)&order=run_date.desc&limit=${limit}&offset=${offset}`
  )

  return {
    items: data.map((row) => ({
      id: row.id,
      run_date: row.run_date,
      passage_id: row.passage_id,
      sent_count: row.sent_count,
      passage: row.xz_du_passages,
    })),
    total,
  }
}

export const getSentPassages = async (page: number, limit: number): Promise<{ items: DailyRunWithPassage[]; total: number }> => {
  const offset = (page - 1) * limit
  const { data, total } = await supabaseFetchPaged<{
    id: number; run_date: string; passage_id: number; sent_count: number; xz_du_passages: Passage
  }>(
    `xz_du_daily_runs?select=id,run_date,passage_id,sent_count,xz_du_passages(id,source_origin,title,difficulty,theme)&order=run_date.desc&limit=${limit}&offset=${offset}`
  )
  return {
    items: data.map((row) => ({ id: row.id, run_date: row.run_date, passage_id: row.passage_id, sent_count: row.sent_count, passage: row.xz_du_passages })),
    total,
  }
}

export const getUnsentPassages = async (page: number, limit: number): Promise<{ items: Passage[]; total: number }> => {
  const offset = (page - 1) * limit
  const { data, total } = await supabaseFetchPaged<Passage>(
    `xz_du_passages?select=id,source_origin,title,difficulty,theme&enabled=eq.true&last_sent_at=is.null&payload=not.is.null&order=id.asc&limit=${limit}&offset=${offset}`
  )
  return { items: data, total }
}

export const saveDailyRun = async (runDate: string, passageId: number): Promise<void> => {
  await supabaseFetch('xz_du_daily_runs', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{ run_date: runDate, passage_id: passageId, sent_count: 0 }]),
  })
}

export const deleteDailyRun = async (runDate: string): Promise<void> => {
  const runs = await supabaseFetch<{ passage_id: number }[]>(
    `xz_du_daily_runs?run_date=eq.${runDate}&select=passage_id`
  )
  await supabaseFetch(`xz_du_daily_runs?run_date=eq.${runDate}`, { method: 'DELETE' })
  if (runs[0]) {
    await supabaseFetch(`xz_du_passages?id=eq.${runs[0].passage_id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ last_sent_at: null }),
    })
  }
}

export const updateSentCount = async (runDate: string, sentCount: number): Promise<void> => {
  await supabaseFetch(`xz_du_daily_runs?run_date=eq.${runDate}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ sent_count: sentCount }),
  })
}

// ---------------------------------------------------------------------------
// Passage payload (AI 解读)
// ---------------------------------------------------------------------------
export const savePassagePayload = async (passageId: number, payload: DuOutput): Promise<void> => {
  await supabaseFetch(`xz_du_passages?id=eq.${passageId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      payload,
      payload_generated_at: new Date().toISOString(),
    }),
  })
}

export const updatePassageLastSentAt = async (passageId: number): Promise<void> => {
  await supabaseFetch(`xz_du_passages?id=eq.${passageId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ last_sent_at: new Date().toISOString() }),
  })
}

// ---------------------------------------------------------------------------
// AI generation
// ---------------------------------------------------------------------------
const timeoutFetch = async (url: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

const extractJsonBlock = (text: string): string | null => {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return trimmed.slice(start, end + 1)
}

export const parseDuOutput = (raw: string): DuOutput => {
  const candidate = extractJsonBlock(raw)
  if (!candidate) throw new Error('Invalid JSON response from LLM')
  const parsed = JSON.parse(candidate) as DuOutput
  if (!parsed.summary || !parsed.translation || !parsed.structure || !parsed.insight) {
    throw new Error('Missing required fields in LLM output')
  }
  if (!Array.isArray(parsed.keywords) || parsed.keywords.length === 0) {
    throw new Error('keywords is required')
  }
  return parsed
}

export const generateDuPayload = async (passage: Passage): Promise<DuOutput> => {
  const userPrompt = buildDuUserPrompt({
    sourceOrigin: passage.source_origin ?? undefined,
    title: passage.title ?? undefined,
    content: passage.content,
  })

  const url = required(env.duLlmUrl, 'NEXT_PUBLIC_LLM_URL')
  const body = JSON.stringify({
    messages: [
      { role: 'system', content: DU_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.45,
    max_tokens: 900,
  })

  let lastError: Error | null = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await timeoutFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }, 25000)

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`LLM request failed: ${response.status} ${text}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('LLM stream unavailable')
      const decoder = new TextDecoder()
      let content = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        content += decoder.decode(value, { stream: true })
      }
      return parseDuOutput(content)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown LLM error')
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 900))
    }
  }

  throw lastError ?? new Error('LLM generation failed')
}

// ---------------------------------------------------------------------------
// Authors & Articles
// ---------------------------------------------------------------------------
export const getAuthor = async (sourceOrigin: string): Promise<Author | null> => {
  const rows = await supabaseFetch<Author[]>(
    `xz_du_authors?source_origin=eq.${encodeURIComponent(sourceOrigin)}&limit=1`
  )
  return rows[0] ?? null
}

export const upsertAuthor = async (sourceOrigin: string, description: string): Promise<void> => {
  await supabaseFetch('xz_du_authors', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ source_origin: sourceOrigin, description, updated_at: new Date().toISOString() }),
  })
}

export const getArticle = async (sourceOrigin: string, baseTitle: string): Promise<Article | null> => {
  const rows = await supabaseFetch<Article[]>(
    `xz_du_articles?source_origin=eq.${encodeURIComponent(sourceOrigin)}&base_title=eq.${encodeURIComponent(baseTitle)}&limit=1`
  )
  return rows[0] ?? null
}

export const upsertArticle = async (sourceOrigin: string, baseTitle: string, background: string): Promise<void> => {
  await supabaseFetch('xz_du_articles', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ source_origin: sourceOrigin, base_title: baseTitle, background, updated_at: new Date().toISOString() }),
  })
}

const generateTextWithLLM = async (systemPrompt: string, userContent: string): Promise<string> => {
  const url = required(env.duLlmUrl, 'NEXT_PUBLIC_LLM_URL')
  const body = JSON.stringify({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.4,
    max_tokens: 200,
  })

  let lastError: Error | null = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await timeoutFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }, 20000)

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`LLM request failed: ${response.status} ${text}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('LLM stream unavailable')
      const decoder = new TextDecoder()
      let content = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        content += decoder.decode(value, { stream: true })
      }
      return content.trim()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown LLM error')
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 900))
    }
  }

  throw lastError ?? new Error('LLM generation failed')
}

export const enrichPassageMeta = async (passage: Passage): Promise<void> => {
  const sourceOrigin = passage.source_origin
  if (!sourceOrigin) return

  const { base: baseTitle } = parseSegment(passage.title ?? '')

  const [existingAuthor, existingArticle] = await Promise.all([
    getAuthor(sourceOrigin),
    baseTitle ? getArticle(sourceOrigin, baseTitle) : Promise.resolve(null),
  ])

  const tasks: Promise<void>[] = []

  if (!existingAuthor) {
    tasks.push(
      generateTextWithLLM(AUTHOR_DESCRIPTION_PROMPT, sourceOrigin)
        .then((description) => upsertAuthor(sourceOrigin, description))
    )
  }

  if (!existingArticle && baseTitle) {
    const userContent = `作者：${sourceOrigin}\n文章：${baseTitle}`
    tasks.push(
      generateTextWithLLM(ARTICLE_BACKGROUND_PROMPT, userContent)
        .then((background) => upsertArticle(sourceOrigin, baseTitle, background))
    )
  }

  await Promise.all(tasks)
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------
const buildMailHtml = (
  runDate: string,
  passage: Passage,
  payload: DuOutput,
  contextLine?: string,
  author?: Author | null,
  article?: Article | null
): string => {
  const readingUrl = `${env.appBaseUrl}/du/${runDate}`
  const unsubUrl = `${env.appBaseUrl}/api/du/unsubscribe?email={{email}}`
  const keywordHtml = payload.keywords
    .map((k) => `<li><strong>${k.term}</strong>：${k.explanation}</li>`)
    .join('')
  const source = [passage.source_origin, passage.title].filter(Boolean).join(' · ')

  const authorHtml = author?.description ? `
  <h3>${passage.source_origin ?? '作者'}</h3>
  <p style="color:#4a3f36;">${author.description}</p>
` : ''

  const articleHtml = article?.background ? `
  <h3>${article.base_title}</h3>
  <p style="color:#4a3f36;">${article.background}</p>
` : ''

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Noto Serif SC',serif;max-width:680px;margin:0 auto;color:#2b2320;line-height:1.9;">
  <p style="color:#6b5f54;margin-bottom:4px;">${runDate} · ${passage.source_book}</p>
  <h2 style="margin:0 0 8px;">${source}</h2>
  ${contextLine ? `<p style="color:#8a7d71;font-size:0.88rem;margin:0 0 20px;">${contextLine}</p>` : ''}
  ${authorHtml}${articleHtml}
  <h3>原文</h3>
  <p style="background:#faf7f2;padding:16px;border-radius:8px;border-left:3px solid #c8b49a;">
    ${passage.content.replace(/\n/g, '<br/>')}
  </p>

  <h3>一句话</h3>
  <p>${payload.summary}</p>

  <h3>慢慢读</h3>
  <p>${payload.translation}</p>

  <h3>关键词</h3>
  <ul>${keywordHtml}</ul>

  <h3>启示</h3>
  <p>${payload.insight}</p>

  <div style="margin:28px 0;text-align:center;">
    <a href="${readingUrl}" style="display:inline-block;padding:10px 28px;background:#5f7c77;color:#fbf8f1;border-radius:999px;text-decoration:none;font-size:14px;letter-spacing:0.06em;">
      在线阅读 &amp; 分享
    </a>
  </div>

  <hr style="margin:24px 0;border:0;border-top:1px solid #e7dfd2;"/>
  <p style="font-size:12px;color:#8a7d71;">
    你收到这封邮件，因为你订阅了小庄·慢读。<br/>
    <a href="${unsubUrl}" style="color:#8a7d71;">退订</a>
  </p>
</div>`.trim()
}

export const sendDuEmails = async (
  runDate: string,
  passage: Passage,
  payload: DuOutput,
  subscribers: Subscriber[]
): Promise<number> => {
  const resendApiKey = required(env.resendApiKey, 'RESEND_API_KEY')
  const from = required(env.duFromEmail, 'DU_FROM_EMAIL')
  const source = [passage.source_origin, passage.title].filter(Boolean).join(' · ')
  const subject = `今日慢读｜${source}`

  const { base: baseTitle } = parseSegment(passage.title ?? '')
  const [ctx, author, article] = await Promise.all([
    passage.source_origin && passage.title
      ? getPassageContext(passage.id, passage.source_origin, passage.title).catch(() => null)
      : Promise.resolve(null),
    passage.source_origin ? getAuthor(passage.source_origin).catch(() => null) : Promise.resolve(null),
    passage.source_origin && baseTitle
      ? getArticle(passage.source_origin, baseTitle).catch(() => null)
      : Promise.resolve(null),
  ])

  // Resend batch API — 单次请求发所有订阅者
  const emails = subscribers.map((s) => ({
    from,
    to: [s.email],
    subject,
    html: buildMailHtml(runDate, passage, payload, ctx?.contextLine, author, article).replace(
      /\{\{email\}\}/g,
      encodeURIComponent(s.email)
    ),
  }))

  const response = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emails),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Resend batch failed: ${response.status} ${text}`)
  }

  return subscribers.length
}

export const sendTestEmail = async (
  runDate: string,
  passage: Passage,
  payload: DuOutput
): Promise<void> => {
  const resendApiKey = required(env.resendApiKey, 'RESEND_API_KEY')
  const from = required(env.duFromEmail, 'DU_FROM_EMAIL')
  const adminEmail = required(env.duAdminEmail, 'DU_ADMIN_EMAIL')
  const source = [passage.source_origin, passage.title].filter(Boolean).join(' · ')

  const { base: baseTitle } = parseSegment(passage.title ?? '')
  const [ctx, author, article] = await Promise.all([
    passage.source_origin && passage.title
      ? getPassageContext(passage.id, passage.source_origin, passage.title).catch(() => null)
      : Promise.resolve(null),
    passage.source_origin ? getAuthor(passage.source_origin).catch(() => null) : Promise.resolve(null),
    passage.source_origin && baseTitle
      ? getArticle(passage.source_origin, baseTitle).catch(() => null)
      : Promise.resolve(null),
  ])

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [adminEmail],
      subject: `[测试] 今日慢读｜${source}`,
      html: buildMailHtml(runDate, passage, payload, ctx?.contextLine, author, article).replace(
        /\{\{email\}\}/g,
        encodeURIComponent(adminEmail)
      ),
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Resend test email failed: ${response.status} ${text}`)
  }
}

export const sendCronAlertEmail = async (job: string, error: string): Promise<void> => {
  const resendApiKey = env.resendApiKey
  const from = env.duFromEmail
  const adminEmail = env.duAdminEmail
  if (!resendApiKey || !from || !adminEmail) return

  const time = new Date().toISOString()
  const html = `
<div style="font-family:monospace;max-width:560px;margin:0 auto;color:#2a2520;line-height:1.6;">
  <p><strong>❌ Cron 任务失败</strong></p>
  <p>任务：<code>${job}</code></p>
  <p>时间：<code>${time}</code></p>
  <p>错误：</p>
  <pre style="background:#f5f0e8;padding:1rem;border-radius:4px;white-space:pre-wrap;">${error}</pre>
</div>`.trim()

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [adminEmail], subject: `[小庄·告警] ${job} 失败`, html }),
  })
}

// ---------------------------------------------------------------------------
// Library — volume index & passage list
// ---------------------------------------------------------------------------
export type VolumeInfo = {
  volume: number
  theme: string
  source_book: string
  count: number
}

export type ArticleEntry = {
  source_origin: string
  base_title: string
  first_id: number
  segment_count: number
}

export type SegmentEntry = {
  id: number
  title: string
  has_payload: boolean
}

export type ArticleEntryAdmin = {
  source_origin: string
  base_title: string
  segments: SegmentEntry[]
}

export type StarMapAuthor = {
  name: string
  dynasty: string
  year: number
  article_count: number
  total_chars: number
}

export type AuthorProfile = {
  source_origin: string
  description: string | null
  dynasty: string | null
  approx_year: number | null
  article_count: number | null
  total_chars: number | null
  updated_at: string
}

export type AuthorArticleEntry = {
  base_title: string
  first_id: number
  segment_count: number
  theme: string | null
}

export type AuthorArticleTitle = {
  base_title: string
}

const parseBaseTitle = (title: string): string => title.replace(/（\d+）$/, '')

export const getLibraryVolumes = async (): Promise<VolumeInfo[]> => {
  const supabaseUrl = required(env.supabaseUrl, 'SUPABASE_URL')
  const serviceRoleKey = required(env.supabaseServiceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY')

  const PAGE = 1000
  const map = new Map<number, VolumeInfo>()
  let offset = 0

  while (true) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/xz_du_passages?select=volume,theme,source_book&enabled=eq.true&volume=not.is.null&order=volume.asc`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Range: `${offset}-${offset + PAGE - 1}`,
          'Range-Unit': 'items',
        },
      }
    )
    if (!response.ok) throw new Error(`Supabase ${response.status}`)
    const rows = await response.json() as { volume: number; theme: string; source_book: string }[]
    for (const row of rows) {
      if (!map.has(row.volume)) {
        map.set(row.volume, { volume: row.volume, theme: row.theme ?? '', source_book: row.source_book, count: 0 })
      }
      map.get(row.volume)!.count++
    }
    if (rows.length < PAGE) break
    offset += PAGE
  }

  return Array.from(map.values()).sort((a, b) => a.volume - b.volume)
}

export const getVolumePassages = async (volume: number): Promise<ArticleEntry[]> => {
  const rows = await supabaseFetch<{ id: number; source_origin: string | null; title: string | null }[]>(
    `xz_du_passages?select=id,source_origin,title&enabled=eq.true&volume=eq.${volume}&order=id.asc&limit=9999`
  )

  const map = new Map<string, ArticleEntry>()
  for (const row of rows) {
    const base = parseBaseTitle(row.title ?? '')
    const origin = row.source_origin ?? ''
    const key = `${origin}||${base}`
    if (!map.has(key)) {
      map.set(key, { source_origin: origin, base_title: base, first_id: row.id, segment_count: 0 })
    }
    map.get(key)!.segment_count++
  }

  return Array.from(map.values())
}

export const getVolumePassagesAdmin = async (volume: number): Promise<ArticleEntryAdmin[]> => {
  const rows = await supabaseFetch<{
    id: number
    source_origin: string | null
    title: string | null
    payload_generated_at: string | null
  }[]>(
    `xz_du_passages?select=id,source_origin,title,payload_generated_at&enabled=eq.true&volume=eq.${volume}&order=id.asc`
  )

  const map = new Map<string, ArticleEntryAdmin>()
  for (const row of rows) {
    const base = parseBaseTitle(row.title ?? '')
    const origin = row.source_origin ?? ''
    const key = `${origin}||${base}`
    if (!map.has(key)) {
      map.set(key, { source_origin: origin, base_title: base, segments: [] })
    }
    map.get(key)!.segments.push({
      id: row.id,
      title: row.title ?? base,
      has_payload: row.payload_generated_at !== null,
    })
  }

  return Array.from(map.values())
}

// ---------------------------------------------------------------------------
// Library — star map data
// ---------------------------------------------------------------------------
const normalizeDynasty = (dynasty: string, year: number): string => {
  const cleaned = dynasty.trim()
  const aliasMap: Record<string, string> = {
    唐: '隋唐',
    秦汉: '汉',
    魏晋南北朝: '南北朝',
  }
  const aliased = aliasMap[cleaned] ?? cleaned
  const allowed = new Set(['先秦', '秦', '汉', '魏晋', '南北朝', '隋唐', '宋', '元', '明', '清'])
  if (allowed.has(aliased)) return aliased

  if (year <= -221) return '先秦'
  if (year <= -206) return '秦'
  if (year <= 220) return '汉'
  if (year <= 420) return '魏晋'
  if (year <= 589) return '南北朝'
  if (year <= 960) return '隋唐'
  if (year <= 1279) return '宋'
  if (year <= 1368) return '元'
  if (year <= 1644) return '明'
  return '清'
}

export const getStarMapAuthors = async (): Promise<StarMapAuthor[]> => {
  const rows = await supabaseFetch<Array<{
    source_origin: string
    dynasty: string | null
    approx_year: number | null
    article_count: number | null
    total_chars: number | null
  }>>(
    'xz_du_authors?select=source_origin,dynasty,approx_year,article_count,total_chars&order=approx_year.asc&limit=9999'
  )

  return rows
    .filter((row) => row.dynasty !== null && row.approx_year !== null)
    .map((row) => ({
      name: row.source_origin,
      dynasty: normalizeDynasty(row.dynasty!, row.approx_year!),
      year: row.approx_year!,
      article_count: row.article_count ?? 0,
      total_chars: row.total_chars ?? 0,
    }))
}

export const getAuthorProfile = async (sourceOrigin: string): Promise<AuthorProfile | null> => {
  const rows = await supabaseFetch<AuthorProfile[]>(
    `xz_du_authors?select=source_origin,description,dynasty,approx_year,article_count,total_chars,updated_at&source_origin=eq.${encodeURIComponent(sourceOrigin)}&limit=1`
  )
  return rows[0] ?? null
}

export const getAuthorArticles = async (sourceOrigin: string): Promise<AuthorArticleEntry[]> => {
  const rows = await supabaseFetch<{ id: number; title: string | null; theme: string | null }[]>(
    `xz_du_passages?select=id,title,theme&enabled=eq.true&source_origin=eq.${encodeURIComponent(sourceOrigin)}&order=id.asc&limit=9999`
  )

  const map = new Map<string, AuthorArticleEntry>()
  for (const row of rows) {
    const base = parseBaseTitle(row.title ?? '')
    if (!map.has(base)) {
      map.set(base, { base_title: base, first_id: row.id, segment_count: 0, theme: row.theme ?? null })
    }
    const item = map.get(base)!
    item.segment_count += 1
    if (!item.theme && row.theme) item.theme = row.theme
  }

  return Array.from(map.values())
}

export const getAuthorArticleTitles = async (sourceOrigin: string): Promise<AuthorArticleTitle[]> => {
  const rows = await supabaseFetch<{ base_title: string | null }[]>(
    `xz_du_articles?select=base_title&source_origin=eq.${encodeURIComponent(sourceOrigin)}&order=base_title.asc&limit=9999`
  )
  const seen = new Set<string>()
  const result: AuthorArticleTitle[] = []
  for (const row of rows) {
    const base = (row.base_title ?? '').trim()
    if (!base || seen.has(base)) continue
    seen.add(base)
    result.push({ base_title: base })
  }
  return result
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const verifyCronSecret = (incoming: string | null): boolean => {
  const cronSecret = env.cronSecret
  const vercelCronSecret = process.env.VERCEL_CRON_SECRET
  if (!cronSecret && !vercelCronSecret) return true
  if (cronSecret && incoming === cronSecret) return true
  if (vercelCronSecret && incoming === vercelCronSecret) return true
  return false
}
