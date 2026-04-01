'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  buildXieYangmingUserPrompt,
  getKnowledgeBit,
  pickRandomStyleAndAuthor,
  XIE_YANGMING_SYSTEM_PROMPT,
} from '@/data/xie-yangming'
import { drawShareFooter, SHARE_MARGIN, SHARE_QR_SIZE, SHARE_WIDTH } from '@/lib/share-card'

type XieOutput = {
  styleUsed: string
  authorUsed: string
  text: string
}

const SHARE_ICON_PATH =
  'M15 8a3 3 0 1 0-2.83-4H12a3 3 0 0 0 .17 1l-5.1 2.9a3 3 0 0 0-4.24 2.8 3 3 0 0 0 .06.6l5.05 2.87A3 3 0 0 0 8 15a3 3 0 1 0 .17-1l-5.1-2.9a3 3 0 0 0 0-1.2l5.1-2.9A3 3 0 1 0 15 8Z'

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
    if (!parsed.styleUsed || !parsed.authorUsed || !parsed.text) return null
    return parsed
  } catch {
    return null
  }
}


const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('图片生成失败，请重试。'))
      },
      'image/jpeg',
      quality
    )
  })

const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
) => {
  const chars = Array.from(text)
  const lines: string[] = []
  let current = ''

  for (const char of chars) {
    const next = current + char
    if (ctx.measureText(next).width <= maxWidth) {
      current = next
      continue
    }
    if (current) lines.push(current)
    current = char
    if (lines.length >= maxLines) break
  }

  if (lines.length < maxLines && current) lines.push(current)

  if (lines.length > maxLines) return lines.slice(0, maxLines)

  if (lines.length === maxLines && chars.join('') !== lines.join('')) {
    const last = lines[maxLines - 1] ?? ''
    lines[maxLines - 1] = last.slice(0, Math.max(0, last.length - 1)) + '…'
  }

  return lines
}

// Measure how many lines a knowledge entry will occupy (mirrors drawKnowledgeEntry logic).
const measureKnowledgeEntry = (
  ctx: CanvasRenderingContext2D,
  name: string,
  bio: string,
  maxW: number,
  fontSize: number
): number => {
  const nameWithSpace = name + '\u3000'
  ctx.font = `700 ${fontSize}px "Noto Serif SC", serif`
  const nameW = Math.ceil(ctx.measureText(nameWithSpace).width)
  ctx.font = `400 ${fontSize}px "Noto Serif SC", serif`
  const chars = Array.from(bio)
  let lineCount = 1
  let current = ''
  let availW = maxW - nameW
  for (const char of chars) {
    const next = current + char
    if (ctx.measureText(next).width <= availW) {
      current = next
    } else {
      if (current) lineCount++
      current = char
      availW = maxW
    }
  }
  return lineCount
}

// Draw "Name bio text" inline: name is bold, bio wraps with indent after first line.
// Returns the y position after the last drawn line (i.e. next available y).
const drawKnowledgeEntry = (
  ctx: CanvasRenderingContext2D,
  name: string,
  bio: string,
  x: number,
  y: number,
  maxW: number,
  fontSize: number,
  lineH: number
): number => {
  const nameWithSpace = name + '\u3000'
  ctx.font = `700 ${fontSize}px "Noto Serif SC", serif`
  const nameW = Math.ceil(ctx.measureText(nameWithSpace).width)

  // Wrap bio: first line has less room (nameW taken by name)
  ctx.font = `400 ${fontSize}px "Noto Serif SC", serif`
  const chars = Array.from(bio)
  const lines: string[] = []
  let current = ''
  let availW = maxW - nameW

  for (const char of chars) {
    const next = current + char
    if (ctx.measureText(next).width <= availW) {
      current = next
    } else {
      if (current) lines.push(current)
      current = char
      availW = maxW
    }
  }
  if (current) lines.push(current)

  // Name (bold) + first bio line on same row
  ctx.fillStyle = '#3a3028'
  ctx.font = `700 ${fontSize}px "Noto Serif SC", serif`
  ctx.fillText(nameWithSpace, x, y)

  ctx.fillStyle = '#5c5044'
  ctx.font = `400 ${fontSize}px "Noto Serif SC", serif`
  if (lines.length > 0) ctx.fillText(lines[0], x + nameW, y)

  // Remaining bio lines at full left margin
  for (let i = 1; i < lines.length; i++) {
    y += lineH
    ctx.fillText(lines[i], x, y)
  }

  return y + lineH
}

const generateXieShareCard = async (
  text: string,
  styleUsed: string,
  authorUsed: string,
  styleBio: string,
  authorBio: string
) => {
  const w = SHARE_WIDTH
  const margin = SHARE_MARGIN
  const maxW = w - margin * 2

  // Type scale — larger for comfortable mobile reading
  const labelSize = 28
  const labelColor = '#96836e'
  const labelGap = 20
  const sectionGap = 72
  const headerSize = 38
  const quoteSize = 46
  const quoteLineH = quoteSize + 34   // generous line height
  const bioNameSize = 30
  const bioLineH = bioNameSize + 24

  // ── Measurement pass (no draw) ──────────────────────────
  const tmpCanvas = document.createElement('canvas')
  tmpCanvas.width = w
  tmpCanvas.height = 100
  const mCtx = tmpCanvas.getContext('2d')
  if (!mCtx) throw new Error('分享图生成失败，请重试。')

  mCtx.font = `400 ${quoteSize}px "Noto Serif SC", serif`
  const quoteLines = wrapText(mCtx, text, maxW, 12)

  const styleLineCount = measureKnowledgeEntry(mCtx, styleUsed, styleBio, maxW, bioNameSize)
  const authorLineCount = measureKnowledgeEntry(mCtx, authorUsed, authorBio, maxW, bioNameSize)

  const section1H = labelSize + labelGap + headerSize
  const section2H = labelSize + labelGap + quoteLines.length * quoteLineH
  const section3H = labelSize + labelGap + styleLineCount * bioLineH + 20 + authorLineCount * bioLineH
  const contentH = section1H + sectionGap + section2H + sectionGap + section3H

  // Dynamic canvas height: content + equal top/bottom padding + QR area
  const padding = 130
  const h = Math.min(1920, contentH + padding * 2 + SHARE_QR_SIZE + 40)

  // ── Draw pass ───────────────────────────────────────────
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('分享图生成失败，请重试。')

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#f9f4ec')
  bg.addColorStop(0.6, '#f2ebe0')
  bg.addColorStop(1, '#ece3d4')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Warm glow
  const glow = ctx.createRadialGradient(w * 0.18, h * 0.22, 20, w * 0.18, h * 0.22, 500)
  glow.addColorStop(0, 'rgba(255,255,255,0.36)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)

  ctx.textBaseline = 'top'

  let y = padding

  // ── 文体 · 人物 ──────────────────────────────────────────
  ctx.fillStyle = labelColor
  ctx.font = `400 ${labelSize}px "Noto Serif SC", serif`
  ctx.fillText('文体 · 人物', margin, y)
  y += labelSize + labelGap

  ctx.fillStyle = '#2a2520'
  ctx.font = `400 ${headerSize}px "Noto Serif SC", serif`
  ctx.fillText(`${styleUsed} · ${authorUsed}`, margin, y)
  y += headerSize + sectionGap

  // ── 章句 ─────────────────────────────────────────────────
  ctx.fillStyle = labelColor
  ctx.font = `400 ${labelSize}px "Noto Serif SC", serif`
  ctx.fillText('章句', margin, y)
  y += labelSize + labelGap

  ctx.fillStyle = '#1c1714'
  ctx.font = `400 ${quoteSize}px "Noto Serif SC", serif`
  for (const line of quoteLines) {
    ctx.fillText(line, margin, y)
    y += quoteLineH
  }
  y += sectionGap

  // ── 小知识 ───────────────────────────────────────────────
  ctx.fillStyle = labelColor
  ctx.font = `400 ${labelSize}px "Noto Serif SC", serif`
  ctx.fillText('小知识', margin, y)
  y += labelSize + labelGap

  y = drawKnowledgeEntry(ctx, styleUsed, styleBio, margin, y, maxW, bioNameSize, bioLineH)
  y += 20

  drawKnowledgeEntry(ctx, authorUsed, authorBio, margin, y, maxW, bioNameSize, bioLineH)

  await drawShareFooter(ctx, w, h - margin - SHARE_QR_SIZE, '仿写')

  ctx.textBaseline = 'alphabetic'
  return canvasToBlob(canvas, 0.92)
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
      max_tokens: 480,
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
  const [pickedStyle, setPickedStyle] = useState('')
  const [pickedAuthor, setPickedAuthor] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isGeneratingShare, setIsGeneratingShare] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareBlob, setShareBlob] = useState<Blob | null>(null)
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null)
  const [isShareOpen, setIsShareOpen] = useState(false)

  const parsed = rawOutput ? parseXieOutput(rawOutput) : null
  const knowledge =
    pickedStyle && pickedAuthor ? getKnowledgeBit(pickedStyle, pickedAuthor) : null

  useEffect(() => {
    return () => {
      if (shareImageUrl) URL.revokeObjectURL(shareImageUrl)
    }
  }, [shareImageUrl])

  useEffect(() => {
    if (!isShareOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsShareOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [isShareOpen])

  const resetShareCard = () => {
    if (shareImageUrl) URL.revokeObjectURL(shareImageUrl)
    setShareImageUrl(null)
    setShareBlob(null)
    setIsShareOpen(false)
  }

  const handleSubmit = async () => {
    if (!intent.trim() || isLoading) return
    setError(null)
    setIsLoading(true)
    setRawOutput('')
    resetShareCard()

    const { style, author } = pickRandomStyleAndAuthor()
    setPickedStyle(style)
    setPickedAuthor(author)

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

  const buildShareCard = async () => {
    if (!parsed || !knowledge) return null
    setIsGeneratingShare(true)
    setError(null)
    try {
      const blob = await generateXieShareCard(
        parsed.text,
        parsed.styleUsed,
        parsed.authorUsed,
        knowledge.styleBio,
        knowledge.authorBio
      )
      const url = URL.createObjectURL(blob)
      if (shareImageUrl) URL.revokeObjectURL(shareImageUrl)
      setShareBlob(blob)
      setShareImageUrl(url)
      return blob
    } catch (err) {
      setError(err instanceof Error ? err.message : '分享图生成失败，请稍后再试。')
      return null
    } finally {
      setIsGeneratingShare(false)
    }
  }

  const handleOpenShare = async () => {
    const blob = shareBlob ?? (await buildShareCard())
    if (!blob) return
    setIsShareOpen(true)
  }

  const handleCloseShare = () => setIsShareOpen(false)

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

          {knowledge ? (
            <div className="section">
              <h4>小知识</h4>
              <p><strong>{parsed.styleUsed}</strong>{' '}{knowledge.styleBio}</p>
              <p><strong>{parsed.authorUsed}</strong>{' '}{knowledge.authorBio}</p>
            </div>
          ) : null}

          <button
            type="button"
            className="xie-share-icon-button xie-share-icon-button-floating"
            onClick={handleOpenShare}
            disabled={isGeneratingShare}
            aria-label="生成高质量分享图片"
            title="生成分享图片"
          >
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <path d={SHARE_ICON_PATH} />
            </svg>
          </button>

          {isShareOpen && shareImageUrl ? (
            <div
              className="xie-share-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="分享图片预览"
              onClick={handleCloseShare}
            >
              <div className="xie-share-sheet-card" onClick={(e) => e.stopPropagation()}>
                <div className="xie-share-sheet-header">
                  <p className="xie-share-sheet-title">可分享图片</p>
                  <button
                    type="button"
                    className="xie-share-close"
                    onClick={handleCloseShare}
                    aria-label="关闭分享预览"
                  >
                    ×
                  </button>
                </div>
                <div className="xie-share-sheet-preview">
                  <img src={shareImageUrl} alt="高质量分享图片预览" className="xie-share-sheet-image" />
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
