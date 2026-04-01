'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  buildXieYangmingUserPrompt,
  pickRandomStyleAndAuthor,
  XIE_YANGMING_SYSTEM_PROMPT,
} from '@/data/xie-yangming'

type XieOutput = {
  styleUsed: string
  authorUsed: string
  text: string
  plain: string
  coreIdea: string
}

const extractJsonBlock = (text: string) => {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return trimmed.slice(start, end + 1)
}

const parseXieOutput = (raw: string): XieOutput | null => {
  const candidate = extractJsonBlock(raw)
  if (!candidate) return null
  try {
    const parsed = JSON.parse(candidate) as XieOutput
    if (!parsed.styleUsed || !parsed.authorUsed || !parsed.text || !parsed.plain || !parsed.coreIdea) return null
    return parsed
  } catch {
    return null
  }
}

const requestXie = async (
  intent: string,
  style: string,
  author: string,
  onChunk?: (text: string) => void
) => {
  const userPrompt = buildXieYangmingUserPrompt({ intent, style, author })

  const response = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: XIE_YANGMING_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.55,
      max_tokens: 640,
    }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? `${response.status} 请求失败`)
  }

  if (!response.body) throw new Error('stream_unavailable')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let content = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    content += chunk
    onChunk?.(content)
  }

  if (!content.trim()) throw new Error('模型返回空结果，请稍后再试。')
  return content
}

export default function XieClient() {
  const [intent, setIntent] = useState('')
  const [rawOutput, setRawOutput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = rawOutput ? parseXieOutput(rawOutput) : null

  const handleSubmit = async () => {
    if (!intent.trim() || isLoading) return
    setError(null)
    setIsLoading(true)
    setRawOutput('')

    const { style, author } = pickRandomStyleAndAuthor()

    try {
      const final = await requestXie(intent.trim(), style, author, (partial) => {
        setRawOutput(partial)
      })
      setRawOutput(final)
    } catch (err) {
      setError(err instanceof Error ? err.message : '仿写失败，请稍后重试。')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="app xie-app">
      <header className="hero xie-hero">
        <div className="xie-mist-layer" aria-hidden="true" />
        <div className="xie-mountain-layer" aria-hidden="true" />
        <div className="seal">写</div>
        <div className="hero-text xie-hero-text">
          <Link href="/" className="back-link">← 小庄</Link>
          <p className="subtitle">立诚 · 明心 · 见行</p>
          <h1>仿写</h1>
          <p className="description">
            从楚辞、道家、史传、词、禅语、唐宋古文、骈文、心学八种传统中随机取法，指定人物语感，写成古典短章。
          </p>
        </div>
      </header>

      <section className="panel xie-input-panel">
        <label className="xie-label" htmlFor="intent">你想表达什么（必填）</label>
        <textarea
          id="intent"
          className="xie-textarea"
          placeholder="例如：明知该行动，却总在犹豫拖延。"
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
        />

        <button className="xie-submit" onClick={handleSubmit} disabled={isLoading || !intent.trim()}>
          {isLoading ? '仿写中…' : '随机取法，生成古典短章'}
        </button>
      </section>

      {error ? (
        <section className="panel xie-result">
          <p className="xie-error">{error}</p>
        </section>
      ) : null}

      {isLoading && !parsed ? (
        <section className="panel xie-result">
          <p className="xie-streaming">正在磨句炼意，请稍候…</p>
        </section>
      ) : null}

      {parsed ? (
        <section className="panel xie-result">
          <div className="section">
            <h4>文体 · 人物</h4>
            <p>{parsed.styleUsed} · {parsed.authorUsed}</p>
          </div>

          <div className="section">
            <h4>章句</h4>
            <p className="xie-main-text">{parsed.text}</p>
          </div>

          <div className="section">
            <h4>义理释义</h4>
            <p>【义理核心】{parsed.coreIdea}</p>
            <p>{parsed.plain}</p>
          </div>
        </section>
      ) : null}
    </div>
  )
}
