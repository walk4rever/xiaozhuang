'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { DailyRunWithPassage, PassageContext } from '@/lib/du-server'
import { drawShareFooter, SHARE_MARGIN, SHARE_QR_SIZE, SHARE_WIDTH } from '@/lib/share-card'

interface Props {
  run: DailyRunWithPassage
  date: string
  context?: PassageContext | null
}

// ---------------------------------------------------------------------------
// Simple markdown renderer (bold + numbered lists only)
// ---------------------------------------------------------------------------
const renderSimpleMarkdown = (text: string): string => {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n(\d+)\.\s/g, '<br/><b>$1.</b> ')
    .replace(/^\n/, '')
}

// ---------------------------------------------------------------------------
// Canvas share card
// ---------------------------------------------------------------------------

const SHARE_ICON =
  'M15 8a3 3 0 1 0-2.83-4H12a3 3 0 0 0 .17 1l-5.1 2.9a3 3 0 0 0-4.24 2.8 3 3 0 0 0 .06.6l5.05 2.87A3 3 0 0 0 8 15a3 3 0 1 0 .17-1l-5.1-2.9a3 3 0 0 0 0-1.2l5.1-2.9A3 3 0 1 0 15 8Z'

const canvasToBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('图片生成失败'))),
      'image/jpeg',
      0.93
    )
  )

const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 99
): string[] => {
  const chars = Array.from(text)
  const lines: string[] = []
  let current = ''

  for (const char of chars) {
    const next = current + char
    if (ctx.measureText(next).width <= maxWidth) {
      current = next
    } else {
      if (current) lines.push(current)
      if (lines.length >= maxLines) break
      current = char
    }
  }
  if (lines.length < maxLines && current) lines.push(current)
  return lines
}

const generateDuShareCard = async (run: DailyRunWithPassage, date: string): Promise<Blob> => {
  const { passage } = run
  const payload = passage.payload!
  const source = [passage.source_origin, passage.title].filter(Boolean).join(' · ')

  const w = SHARE_WIDTH
  const margin = SHARE_MARGIN
  const maxW = w - margin * 2

  // Font sizes
  const dateLabelSize = 26
  const sourceSize = 40
  const sectionLabelSize = 26
  const sectionLabelColor = '#96836e'
  const contentSize = 38
  const contentLineH = contentSize + 28
  const insightSize = 34
  const insightLineH = insightSize + 26
  const sectionGap = 64
  const labelGap = 16

  // Measure pass
  const tmp = document.createElement('canvas')
  tmp.width = w
  tmp.height = 100
  const mCtx = tmp.getContext('2d')!

  mCtx.font = `400 ${contentSize}px "Noto Serif SC", serif`
  const contentLines = wrapText(mCtx, passage.content, maxW, 8)

  mCtx.font = `400 ${insightSize}px "Noto Serif SC", serif`
  const insightLines = wrapText(mCtx, payload.insight, maxW, 12)

  const section1H = dateLabelSize + 12 + sourceSize
  const section2H = sectionLabelSize + labelGap + contentLines.length * contentLineH
  const section3H = sectionLabelSize + labelGap + insightLines.length * insightLineH
  const contentH = section1H + sectionGap + section2H + sectionGap + section3H

  const padding = 120
  const h = Math.min(1920, contentH + padding * 2 + SHARE_QR_SIZE + 40)

  // Draw pass
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#f9f4ec')
  bg.addColorStop(0.55, '#f2ebe0')
  bg.addColorStop(1, '#ebe1d2')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Warm glow
  const glow = ctx.createRadialGradient(w * 0.15, h * 0.18, 10, w * 0.15, h * 0.18, 480)
  glow.addColorStop(0, 'rgba(255,255,255,0.32)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)

  ctx.textBaseline = 'top'
  let y = padding

  // ── 日期 + 来源 ───────────────────────────────────────
  ctx.fillStyle = '#96836e'
  ctx.font = `400 ${dateLabelSize}px "Noto Serif SC", serif`
  ctx.fillText(date, margin, y)
  y += dateLabelSize + 12

  ctx.fillStyle = '#2a2520'
  ctx.font = `500 ${sourceSize}px "Noto Serif SC", serif`
  ctx.fillText(source, margin, y)
  y += sourceSize + sectionGap

  // ── 原文 ─────────────────────────────────────────────
  ctx.fillStyle = sectionLabelColor
  ctx.font = `400 ${sectionLabelSize}px "Noto Serif SC", serif`
  ctx.fillText('原文', margin, y)
  y += sectionLabelSize + labelGap

  // Left accent bar
  ctx.fillStyle = 'rgba(139,100,74,0.22)'
  ctx.fillRect(margin, y, 4, contentLines.length * contentLineH)

  ctx.fillStyle = '#1c1714'
  ctx.font = `400 ${contentSize}px "Noto Serif SC", serif`
  for (const line of contentLines) {
    ctx.fillText(line, margin + 20, y)
    y += contentLineH
  }
  if (passage.content.length > contentLines.join('').length) {
    y -= contentLineH
    ctx.fillText('……', margin + 20, y)
    y += contentLineH
  }
  y += sectionGap

  // ── 今日启发 ─────────────────────────────────────────
  ctx.fillStyle = sectionLabelColor
  ctx.font = `400 ${sectionLabelSize}px "Noto Serif SC", serif`
  ctx.fillText('今日启发', margin, y)
  y += sectionLabelSize + labelGap

  ctx.fillStyle = '#3a3028'
  ctx.font = `400 ${insightSize}px "Noto Serif SC", serif`
  for (const line of insightLines) {
    ctx.fillText(line, margin, y)
    y += insightLineH
  }

  // ── Footer ────────────────────────────────────────────
  await drawShareFooter(ctx, w, h - margin - SHARE_QR_SIZE, '慢读')

  return canvasToBlob(canvas)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function DuDayClient({ run, date, context }: Props) {
  const { passage } = run
  const payload = passage.payload
  const source = [passage.source_origin, passage.title].filter(Boolean).join(' · ')

  const [isShareOpen, setIsShareOpen] = useState(false)
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const openShare = async () => {
    setIsShareOpen(true)
    if (shareImageUrl) return
    if (!payload) return

    setIsGenerating(true)
    try {
      const blob = await generateDuShareCard(run, date)
      setShareImageUrl(URL.createObjectURL(blob))
    } catch (err) {
      console.error(err)
    } finally {
      setIsGenerating(false)
    }
  }

  const closeShare = () => setIsShareOpen(false)

  // ESC to close + body scroll lock
  useEffect(() => {
    if (!isShareOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeShare() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [isShareOpen])

  return (
    <div className="app du-app">
      <header className="hero du-hero">
        <div className="du-mist-layer" aria-hidden="true" />
        <div className="du-mountain-layer" aria-hidden="true" />
        <div className="seal">读</div>
        <div className="hero-text du-hero-text">
          <Link href="/du" className="back-link">← 慢读</Link>
          <p className="subtitle">{date}</p>
          <h1 className="du-day-title">{source}</h1>
        </div>
      </header>

      <section className="panel du-panel du-day-panel">
        {/* 背景提示 */}
        {context && (
          <p className="du-day-context">{context.contextLine}</p>
        )}

        {/* 原文 */}
        <div className="du-day-section">
          <span className="du-day-label">原文</span>
          <div className="du-day-content du-day-origin">
            {passage.content.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>

        {payload ? (
          <>
            {/* 一句话大意 */}
            <div className="du-day-section">
              <span className="du-day-label">一句话</span>
              <p className="du-day-content du-day-summary">{payload.summary}</p>
            </div>

            {/* 白话直译 */}
            <div className="du-day-section">
              <span className="du-day-label">慢慢读</span>
              <div className="du-day-content">
                {payload.translation.split('\n').filter(Boolean).map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </div>

            {/* 关键词 */}
            <div className="du-day-section">
              <span className="du-day-label">关键词</span>
              <ul className="du-day-keywords">
                {payload.keywords.map((k) => (
                  <li key={k.term}>
                    <strong>{k.term}</strong>：{k.explanation}
                  </li>
                ))}
              </ul>
            </div>

            {/* 结构 */}
            <div className="du-day-section">
              <span className="du-day-label">析结构</span>
              <p
                className="du-day-content"
                dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(payload.structure) }}
              />
            </div>

            {/* 启发 */}
            <div className="du-day-section du-day-section-last">
              <span className="du-day-label">启示</span>
              <div className="du-day-content du-day-insight">
                {payload.insight.split('\n').filter(Boolean).map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="du-day-content" style={{ color: 'var(--ink-2)' }}>解读生成中，请稍后再来。</p>
        )}

        {/* 分享按钮 */}
        {payload && (
          <button
            className="du-share-icon-button du-share-icon-button-floating"
            onClick={openShare}
            disabled={isGenerating}
            aria-label="分享"
          >
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <path d={SHARE_ICON} />
            </svg>
          </button>
        )}

        {/* 上下段导航 */}
        {context && (context.prevId || context.nextId) && (
          <div className="du-day-nav">
            {context.prevId
              ? <Link href={`/du/preview/${context.prevId}`} className="du-day-nav-btn">← 上一段</Link>
              : <span />
            }
            {context.nextId
              ? <Link href={`/du/preview/${context.nextId}`} className="du-day-nav-btn">下一段 →</Link>
              : <span />
            }
          </div>
        )}
      </section>

      {/* 分享弹窗 */}
      {isShareOpen && (
        <div className="du-share-sheet" onClick={closeShare}>
          <div className="du-share-sheet-card" onClick={(e) => e.stopPropagation()}>
            <div className="du-share-sheet-header">
              <h3 className="du-share-sheet-title">长按图片保存，分享到朋友圈</h3>
              <button className="du-share-close" onClick={closeShare} aria-label="关闭">×</button>
            </div>

            <div className="du-share-sheet-preview">
              {isGenerating && (
                <div className="du-share-generating">生成中…</div>
              )}
              {shareImageUrl && (
                <img
                  className="du-share-sheet-image"
                  src={shareImageUrl}
                  alt="分享图片预览"
                />
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
