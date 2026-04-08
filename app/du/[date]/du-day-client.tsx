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

const splitParagraphs = (text: string): string[] => text.split('\n').map((line) => line.trim()).filter(Boolean)

const generateDuShareCard = async (
  run: DailyRunWithPassage,
  date: string,
  context?: PassageContext | null
): Promise<Blob> => {
  const { passage } = run
  const payload = passage.payload!
  const source = [passage.source_origin, passage.title].filter(Boolean).join(' · ')
  const contextLine = context?.contextLine ?? ''

  const w = SHARE_WIDTH
  const margin = SHARE_MARGIN
  const maxW = w - margin * 2

  // Font sizes
  const dateLabelSize = 26
  const sourceSize = 40
  const sectionLabelSize = 26
  const sectionLabelColor = '#96836e'
  const contextSize = 28
  const contextLineH = contextSize + 22
  const contentSize = 38
  const contentLineH = contentSize + 28
  const summarySize = 34
  const summaryLineH = summarySize + 22
  const translationSize = 34
  const translationLineH = translationSize + 24
  const insightSize = 34
  const insightLineH = insightSize + 26
  const sectionGap = 64
  const labelGap = 16
  const paragraphGap = 16

  // Measure pass
  const tmp = document.createElement('canvas')
  tmp.width = w
  tmp.height = 100
  const mCtx = tmp.getContext('2d')!

  mCtx.font = `400 ${contentSize}px "Noto Serif SC", serif`
  const contentParagraphs = splitParagraphs(passage.content).map((line) => wrapText(mCtx, line, maxW - 20, 99))

  mCtx.font = `400 ${contextSize}px "Noto Serif SC", serif`
  const contextLines = contextLine ? wrapText(mCtx, contextLine, maxW, 3) : []

  mCtx.font = `500 ${summarySize}px "Noto Serif SC", serif`
  const summaryLines = wrapText(mCtx, payload.summary, maxW, 4)

  mCtx.font = `400 ${translationSize}px "Noto Serif SC", serif`
  const translationParagraphs = splitParagraphs(payload.translation).map((line) =>
    wrapText(mCtx, line, maxW, 99)
  )

  mCtx.font = `400 ${insightSize}px "Noto Serif SC", serif`
  const insightParagraphs = splitParagraphs(payload.insight).map((line) => wrapText(mCtx, line, maxW, 99))

  const measureParagraphBlock = (paragraphs: string[][], lineHeight: number) =>
    paragraphs.reduce((total, lines, index) => {
      const linesHeight = lines.length * lineHeight
      const trailingGap = index < paragraphs.length - 1 ? paragraphGap : 0
      return total + linesHeight + trailingGap
    }, 0)

  const section1H = dateLabelSize + 12 + sourceSize
  const section2H = contextLines.length ? contextLines.length * contextLineH : 0
  const section3H = sectionLabelSize + labelGap + measureParagraphBlock(contentParagraphs, contentLineH)
  const section4H = sectionLabelSize + labelGap + summaryLines.length * summaryLineH
  const section5H = sectionLabelSize + labelGap + measureParagraphBlock(translationParagraphs, translationLineH)
  const section6H = sectionLabelSize + labelGap + measureParagraphBlock(insightParagraphs, insightLineH)
  const contentH =
    section1H +
    sectionGap +
    (section2H ? section2H + sectionGap : 0) +
    section3H +
    sectionGap +
    section4H +
    sectionGap +
    section5H +
    sectionGap +
    section6H

  const paddingTop = 120
  const paddingBottom = 80
  const footerGap = 64

  // Simulate the draw to get exact y, then compute real canvas height.
  // This avoids accumulated measurement drift for long articles.
  const simulateY = (): number => {
    let sy = paddingTop
    // section1: date + source
    sy += dateLabelSize + 12 + sourceSize + sectionGap
    // section2: context
    if (contextLines.length) {
      sy += contextLines.length * contextLineH + sectionGap
    }
    // section3: 原文
    sy += sectionLabelSize + labelGap
    for (let i = 0; i < contentParagraphs.length; i += 1) {
      sy += contentParagraphs[i].length * contentLineH
      if (i < contentParagraphs.length - 1) sy += paragraphGap
    }
    sy += sectionGap
    // section4: 一句话
    sy += sectionLabelSize + labelGap + summaryLines.length * summaryLineH + sectionGap
    // section5: 慢慢读
    sy += sectionLabelSize + labelGap
    for (let i = 0; i < translationParagraphs.length; i += 1) {
      sy += translationParagraphs[i].length * translationLineH
      if (i < translationParagraphs.length - 1) sy += paragraphGap
    }
    sy += sectionGap
    // section6: 启示
    sy += sectionLabelSize + labelGap
    for (let i = 0; i < insightParagraphs.length; i += 1) {
      sy += insightParagraphs[i].length * insightLineH
      if (i < insightParagraphs.length - 1) sy += paragraphGap
    }
    return sy
  }

  const footerTopY = simulateY() + footerGap
  const h = footerTopY + SHARE_QR_SIZE + paddingBottom

  // Draw pass
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#f9f4ec')
  bg.addColorStop(1, '#f0e8db')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Warm glow
  const glow = ctx.createRadialGradient(w * 0.15, h * 0.18, 10, w * 0.15, h * 0.18, 480)
  glow.addColorStop(0, 'rgba(255,255,255,0.32)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)

  ctx.textBaseline = 'top'
  let y = paddingTop

  // ── 日期 + 来源 ───────────────────────────────────────
  ctx.fillStyle = '#96836e'
  ctx.font = `400 ${dateLabelSize}px "Noto Serif SC", serif`
  ctx.fillText(date, margin, y)
  y += dateLabelSize + 12

  ctx.fillStyle = '#2a2520'
  ctx.font = `500 ${sourceSize}px "Noto Serif SC", serif`
  ctx.fillText(source, margin, y)
  y += sourceSize + sectionGap

  // ── 节选信息 ─────────────────────────────────────────
  if (contextLines.length) {
    ctx.fillStyle = '#6d6154'
    ctx.font = `400 ${contextSize}px "Noto Serif SC", serif`
    for (const line of contextLines) {
      ctx.fillText(line, margin, y)
      y += contextLineH
    }
    y += sectionGap
  }

  // ── 原文 ─────────────────────────────────────────────
  ctx.fillStyle = sectionLabelColor
  ctx.font = `400 ${sectionLabelSize}px "Noto Serif SC", serif`
  ctx.fillText('原文', margin, y)
  y += sectionLabelSize + labelGap

  // Left accent bar
  ctx.fillStyle = 'rgba(139,100,74,0.22)'
  const contentBlockHeight = measureParagraphBlock(contentParagraphs, contentLineH)
  ctx.fillRect(margin, y, 4, contentBlockHeight)

  ctx.fillStyle = '#1c1714'
  ctx.font = `400 ${contentSize}px "Noto Serif SC", serif`
  for (let index = 0; index < contentParagraphs.length; index += 1) {
    for (const line of contentParagraphs[index]) {
      ctx.fillText(line, margin + 20, y)
      y += contentLineH
    }
    if (index < contentParagraphs.length - 1) y += paragraphGap
  }
  y += sectionGap

  // ── 一句话 ───────────────────────────────────────────
  ctx.fillStyle = sectionLabelColor
  ctx.font = `400 ${sectionLabelSize}px "Noto Serif SC", serif`
  ctx.fillText('一句话', margin, y)
  y += sectionLabelSize + labelGap

  ctx.fillStyle = '#2f2924'
  ctx.font = `500 ${summarySize}px "Noto Serif SC", serif`
  for (const line of summaryLines) {
    ctx.fillText(line, margin, y)
    y += summaryLineH
  }
  y += sectionGap

  // ── 慢慢读 ───────────────────────────────────────────
  ctx.fillStyle = sectionLabelColor
  ctx.font = `400 ${sectionLabelSize}px "Noto Serif SC", serif`
  ctx.fillText('慢慢读', margin, y)
  y += sectionLabelSize + labelGap

  ctx.fillStyle = '#3a3028'
  ctx.font = `400 ${translationSize}px "Noto Serif SC", serif`
  for (let index = 0; index < translationParagraphs.length; index += 1) {
    for (const line of translationParagraphs[index]) {
      ctx.fillText(line, margin, y)
      y += translationLineH
    }
    if (index < translationParagraphs.length - 1) y += paragraphGap
  }
  y += sectionGap

  // ── 启示 ─────────────────────────────────────────────
  ctx.fillStyle = sectionLabelColor
  ctx.font = `400 ${sectionLabelSize}px "Noto Serif SC", serif`
  ctx.fillText('启示', margin, y)
  y += sectionLabelSize + labelGap

  ctx.fillStyle = '#3a3028'
  ctx.font = `400 ${insightSize}px "Noto Serif SC", serif`
  for (let index = 0; index < insightParagraphs.length; index += 1) {
    for (const line of insightParagraphs[index]) {
      ctx.fillText(line, margin, y)
      y += insightLineH
    }
    if (index < insightParagraphs.length - 1) y += paragraphGap
  }

  // ── Footer ────────────────────────────────────────────
  await drawShareFooter(ctx, w, footerTopY, '慢读')

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
      const blob = await generateDuShareCard(run, date, context)
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
              <h3 className="du-share-sheet-title">慢读长图，长按图片保存</h3>
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
                  alt="慢读分享长图预览"
                />
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
