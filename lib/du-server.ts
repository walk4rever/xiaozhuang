import { buildDuUserPrompt, DU_SYSTEM_PROMPT, type DuOutput } from '@/data/du-prompt'

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
  payload: DuOutput | null
}

export type DailyRun = {
  id: number
  run_date: string
  passage_id: number
  sent_count: number
}

export type DailyRunWithPassage = DailyRun & {
  passage: Passage
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
    `xz_du_daily_runs?select=id,run_date,passage_id,sent_count,xz_du_passages(id,source_book,source_origin,title,content,difficulty,theme,payload)&run_date=eq.${date}&limit=1`
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
    `xz_du_daily_runs?select=id,run_date,passage_id,sent_count,xz_du_passages(id,source_book,source_origin,title,content,difficulty,theme,payload)&order=run_date.desc&limit=${limit}`
  )

  return runs.map((row) => ({
    id: row.id,
    run_date: row.run_date,
    passage_id: row.passage_id,
    sent_count: row.sent_count,
    passage: row.xz_du_passages,
  }))
}

export const getSentPassages = async (page: number, limit: number): Promise<{ items: DailyRunWithPassage[]; total: number }> => {
  const offset = (page - 1) * limit
  const { data, total } = await supabaseFetchPaged<{
    id: number; run_date: string; passage_id: number; sent_count: number; xz_du_passages: Passage
  }>(
    `xz_du_daily_runs?select=id,run_date,passage_id,sent_count,xz_du_passages(id,source_book,source_origin,title,difficulty,theme)&order=run_date.desc&limit=${limit}&offset=${offset}`
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
  await supabaseFetch(`xz_du_daily_runs?run_date=eq.${runDate}`, { method: 'DELETE' })
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

  const url = `${env.appBaseUrl}/api/llm`
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
// Email
// ---------------------------------------------------------------------------
const buildMailHtml = (runDate: string, passage: Passage, payload: DuOutput): string => {
  const readingUrl = `${env.appBaseUrl}/du/${runDate}`
  const unsubUrl = `${env.appBaseUrl}/api/du/unsubscribe?email={{email}}`
  const keywordHtml = payload.keywords
    .map((k) => `<li><strong>${k.term}</strong>：${k.explanation}</li>`)
    .join('')
  const source = [passage.source_origin, passage.title].filter(Boolean).join(' · ')

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Noto Serif SC',serif;max-width:680px;margin:0 auto;color:#2b2320;line-height:1.9;">
  <p style="color:#6b5f54;margin-bottom:4px;">${runDate} · ${passage.source_book}</p>
  <h2 style="margin:0 0 20px;">${source}</h2>

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

  <h3>析结构</h3>
  <p>${payload.structure}</p>

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

  // Resend batch API — 单次请求发所有订阅者
  const emails = subscribers.map((s) => ({
    from,
    to: [s.email],
    subject,
    html: buildMailHtml(runDate, passage, payload).replace(
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
      html: buildMailHtml(runDate, passage, payload).replace(
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

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const verifyCronSecret = (incoming: string | null): boolean => {
  const expected = env.cronSecret
  if (!expected) return true
  return incoming === expected
}
