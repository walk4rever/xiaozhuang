'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Author, Article, DailyRunWithPassage, PassageContext } from '@/lib/du-server'
import {
  canvasToBlob,
  drawShareFooter,
  shareBlobFile,
  SHARE_MARGIN,
  SHARE_QR_SIZE,
  SHARE_WIDTH,
} from '@/lib/share-card'

const VOLUME_CHINESE: Record<number, string> = {
  1: '一', 2: '二', 3: '三', 4: '四', 5: '五',
  6: '六', 7: '七', 8: '八', 9: '九', 10: '十',
  11: '十一', 12: '十二', 13: '十三', 14: '十四', 15: '十五',
  16: '十六', 17: '十七', 18: '十八', 19: '十九', 20: '二十',
  21: '二十一', 22: '二十二', 23: '二十三', 24: '二十四', 25: '二十五', 26: '二十六',
}

interface Props {
  run: DailyRunWithPassage
  date: string
  context?: PassageContext | null
  author?: Author | null
  article?: Article | null
}

function buildAttribution(
  passage: DailyRunWithPassage['passage'],
  context: PassageContext | null | undefined
): string {
  const parts: string[] = []

  if (passage.source_book) {
    let bookRef = `《${passage.source_book}》`
    if (passage.volume) {
      const volCN = VOLUME_CHINESE[passage.volume] ?? String(passage.volume)
      bookRef += `第${volCN}卷`
      if (passage.theme) bookRef += passage.theme
    }
    parts.push(`本段节选自${bookRef}`)
  }

  const authorPart = passage.source_origin ?? ''
  const baseTitle = context?.baseTitle ?? passage.title
  const titlePart = baseTitle ? `《${baseTitle}》` : ''
  const authorTitle = [authorPart, titlePart].filter(Boolean).join('·')
  if (authorTitle) parts.push(authorTitle)

  let line = parts.join('，')
  if (context && context.totalSegments > 1) {
    line += `｜第 ${context.currentIndex} 段，共 ${context.totalSegments} 段`
  }
  return line
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

const renderDuShareCard = async (
  ctx: CanvasRenderingContext2D,
  run: DailyRunWithPassage,
  date: string,
  context: PassageContext | null | undefined,
  shouldDraw: boolean,
  author?: Author | null,
  article?: Article | null
) => {
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
  const bioSize = 28
  const bioLineH = bioSize + 20
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

  ctx.font = `400 ${contentSize}px "Noto Serif SC", serif`
  const contentParagraphs = splitParagraphs(passage.content).map((line) => wrapText(ctx, line, maxW - 20, 99))

  ctx.font = `400 ${contextSize}px "Noto Serif SC", serif`
  const contextLines = contextLine ? wrapText(ctx, contextLine, maxW, 3) : []

  ctx.font = `400 ${bioSize}px "Noto Serif SC", serif`
  const authorLines = author?.description ? wrapText(ctx, author.description, maxW, 99) : []
  const articleLines = article?.background ? wrapText(ctx, article.background, maxW, 99) : []

  ctx.font = `500 ${summarySize}px "Noto Serif SC", serif`
  const summaryLines = wrapText(ctx, payload.summary, maxW, 4)

  ctx.font = `400 ${translationSize}px "Noto Serif SC", serif`
  const translationParagraphs = splitParagraphs(payload.translation).map((line) =>
    wrapText(ctx, line, maxW, 99)
  )

  ctx.font = `400 ${insightSize}px "Noto Serif SC", serif`
  const insightParagraphs = splitParagraphs(payload.insight).map((line) => wrapText(ctx, line, maxW, 99))

  const measureParagraphBlock = (paragraphs: string[][], lineHeight: number) =>
    paragraphs.reduce((total, lines, index) => {
      const linesHeight = lines.length * lineHeight
      const trailingGap = index < paragraphs.length - 1 ? paragraphGap : 0
      return total + linesHeight + trailingGap
    }, 0)

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
    // section3: 作者简介
    if (authorLines.length) {
      sy += sectionLabelSize + labelGap + authorLines.length * bioLineH + sectionGap
    }
    // section4: 文章背景
    if (articleLines.length) {
      sy += sectionLabelSize + labelGap + articleLines.length * bioLineH + sectionGap
    }
    // section5: 原文
    sy += sectionLabelSize + labelGap
    for (let i = 0; i < contentParagraphs.length; i += 1) {
      sy += contentParagraphs[i].length * contentLineH
      if (i < contentParagraphs.length - 1) sy += paragraphGap
    }
    sy += sectionGap
    // section6: 一句话
    sy += sectionLabelSize + labelGap + summaryLines.length * summaryLineH + sectionGap
    // section7: 慢慢读
    sy += sectionLabelSize + labelGap
    for (let i = 0; i < translationParagraphs.length; i += 1) {
      sy += translationParagraphs[i].length * translationLineH
      if (i < translationParagraphs.length - 1) sy += paragraphGap
    }
    sy += sectionGap
    // section8: 启示
    sy += sectionLabelSize + labelGap
    for (let i = 0; i < insightParagraphs.length; i += 1) {
      sy += insightParagraphs[i].length * insightLineH
      if (i < insightParagraphs.length - 1) sy += paragraphGap
    }
    return sy
  }

  const footerTopY = simulateY() + footerGap
  const h = footerTopY + SHARE_QR_SIZE + paddingBottom

  if (shouldDraw) {
    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#f9f4ec')
    bg.addColorStop(1, '#f0e8db')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    const glow = ctx.createRadialGradient(w * 0.15, h * 0.18, 10, w * 0.15, h * 0.18, 480)
    glow.addColorStop(0, 'rgba(255,255,255,0.32)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, h)
  }

  ctx.textBaseline = 'top'
  let y = paddingTop

  // ── 日期 + 来源 ───────────────────────────────────────
  ctx.fillStyle = '#96836e'
  ctx.font = `400 ${dateLabelSize}px "Noto Serif SC", serif`
  if (shouldDraw) ctx.fillText(date, margin, y)
  y += dateLabelSize + 12

  ctx.fillStyle = '#2a2520'
  ctx.font = `500 ${sourceSize}px "Noto Serif SC", serif`
  if (shouldDraw) ctx.fillText(source, margin, y)
  y += sourceSize + sectionGap

  // ── 节选信息 ─────────────────────────────────────────
  if (contextLines.length) {
    ctx.fillStyle = '#6d6154'
    ctx.font = `400 ${contextSize}px "Noto Serif SC", serif`
    for (const line of contextLines) {
      if (shouldDraw) ctx.fillText(line, margin, y)
      y += contextLineH
    }
    y += sectionGap
  }

  // ── 作者简介 ─────────────────────────────────────────
  if (authorLines.length) {
    ctx.fillStyle = sectionLabelColor
    ctx.font = `400 ${sectionLabelSize}px "Noto Serif SC", serif`
    if (shouldDraw) ctx.fillText(passage.source_origin ?? '作者', margin, y)
    y += sectionLabelSize + labelGap

    ctx.fillStyle = '#3a3028'
    ctx.font = `400 ${bioSize}px "Noto Serif SC", serif`
    for (const line of authorLines) {
      if (shouldDraw) ctx.fillText(line, margin, y)
      y += bioLineH
    }
    y += sectionGap
  }

  // ── 文章背景 ─────────────────────────────────────────
  if (articleLines.length) {
    ctx.fillStyle = sectionLabelColor
    ctx.font = `400 ${sectionLabelSize}px "Noto Serif SC", serif`
    if (shouldDraw) ctx.fillText(article?.base_title ?? '背景', margin, y)
    y += sectionLabelSize + labelGap

    ctx.fillStyle = '#3a3028'
    ctx.font = `400 ${bioSize}px "Noto Serif SC", serif`
    for (const line of articleLines) {
      if (shouldDraw) ctx.fillText(line, margin, y)
      y += bioLineH
    }
    y += sectionGap
  }

  // ── 原文 ─────────────────────────────────────────────
  ctx.fillStyle = sectionLabelColor
  ctx.font = `400 ${sectionLabelSize}px "Noto Serif SC", serif`
  if (shouldDraw) ctx.fillText('原文', margin, y)
  y += sectionLabelSize + labelGap

  // Left accent bar
  const contentBlockHeight = measureParagraphBlock(contentParagraphs, contentLineH)
  if (shouldDraw) {
    ctx.fillStyle = 'rgba(139,100,74,0.22)'
    ctx.fillRect(margin, y, 4, contentBlockHeight)
  }

  ctx.fillStyle = '#1c1714'
  ctx.font = `400 ${contentSize}px "Noto Serif SC", serif`
  for (let index = 0; index < contentParagraphs.length; index += 1) {
    for (const line of contentParagraphs[index]) {
      if (shouldDraw) ctx.fillText(line, margin + 20, y)
      y += contentLineH
    }
    if (index < contentParagraphs.length - 1) y += paragraphGap
  }
  y += sectionGap

  // ── 一句话 ───────────────────────────────────────────
  ctx.fillStyle = sectionLabelColor
  ctx.font = `400 ${sectionLabelSize}px "Noto Serif SC", serif`
  if (shouldDraw) ctx.fillText('一句话', margin, y)
  y += sectionLabelSize + labelGap

  ctx.fillStyle = '#2f2924'
  ctx.font = `500 ${summarySize}px "Noto Serif SC", serif`
  for (const line of summaryLines) {
    if (shouldDraw) ctx.fillText(line, margin, y)
    y += summaryLineH
  }
  y += sectionGap

  // ── 慢慢读 ───────────────────────────────────────────
  ctx.fillStyle = sectionLabelColor
  ctx.font = `400 ${sectionLabelSize}px "Noto Serif SC", serif`
  if (shouldDraw) ctx.fillText('慢慢读', margin, y)
  y += sectionLabelSize + labelGap

  ctx.fillStyle = '#3a3028'
  ctx.font = `400 ${translationSize}px "Noto Serif SC", serif`
  for (let index = 0; index < translationParagraphs.length; index += 1) {
    for (const line of translationParagraphs[index]) {
      if (shouldDraw) ctx.fillText(line, margin, y)
      y += translationLineH
    }
    if (index < translationParagraphs.length - 1) y += paragraphGap
  }
  y += sectionGap

  // ── 启示 ─────────────────────────────────────────────
  ctx.fillStyle = sectionLabelColor
  ctx.font = `400 ${sectionLabelSize}px "Noto Serif SC", serif`
  if (shouldDraw) ctx.fillText('启示', margin, y)
  y += sectionLabelSize + labelGap

  ctx.fillStyle = '#3a3028'
  ctx.font = `400 ${insightSize}px "Noto Serif SC", serif`
  for (let index = 0; index < insightParagraphs.length; index += 1) {
    for (const line of insightParagraphs[index]) {
      if (shouldDraw) ctx.fillText(line, margin, y)
      y += insightLineH
    }
    if (index < insightParagraphs.length - 1) y += paragraphGap
  }

  // ── Footer ────────────────────────────────────────────
  if (shouldDraw) {
    await drawShareFooter(ctx, w, footerTopY, '慢读')
  }

  return h
}

const generateDuShareCard = async (
  run: DailyRunWithPassage,
  date: string,
  context?: PassageContext | null,
  author?: Author | null,
  article?: Article | null
): Promise<Blob> => {
  const measureCanvas = document.createElement('canvas')
  measureCanvas.width = SHARE_WIDTH
  measureCanvas.height = 1
  const measureCtx = measureCanvas.getContext('2d')
  if (!measureCtx) throw new Error('图片生成失败')

  const finalHeight = await renderDuShareCard(measureCtx, run, date, context, false, author, article)

  const canvas = document.createElement('canvas')
  canvas.width = SHARE_WIDTH
  canvas.height = finalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('图片生成失败')

  await renderDuShareCard(ctx, run, date, context, true, author, article)
  return canvasToBlob(canvas, 0.93)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function DuDayClient({ run, date, context, author, article }: Props) {
  const { passage } = run
  const payload = passage.payload
  const source = [passage.source_origin, passage.title].filter(Boolean).join(' · ')
  const isPreviewPage = run.id === 0

  const [isShareOpen, setIsShareOpen] = useState(false)
  const [shareBlob, setShareBlob] = useState<Blob | null>(null)
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const openShare = async () => {
    setIsShareOpen(true)
    if (shareImageUrl && shareBlob) return
    if (!payload) return

    setIsGenerating(true)
    try {
      const blob = await generateDuShareCard(run, date, context, author, article)
      if (shareImageUrl) URL.revokeObjectURL(shareImageUrl)
      setShareBlob(blob)
      setShareImageUrl(URL.createObjectURL(blob))
    } catch (err) {
      console.error(err)
    } finally {
      setIsGenerating(false)
    }
  }

  const closeShare = () => setIsShareOpen(false)

  const handleSaveShareImage = async () => {
    const blob = shareBlob ?? (payload ? await generateDuShareCard(run, date, context, author, article) : null)
    if (!blob) return
    if (!shareBlob) setShareBlob(blob)
    await shareBlobFile(blob, `xiaozhuang-du-${date}.jpg`, '慢读分享图', `小庄 · 慢读 · ${date}`)
  }

  // ESC to close + body scroll lock
  useEffect(() => {
    return () => {
      if (shareImageUrl) URL.revokeObjectURL(shareImageUrl)
    }
  }, [shareImageUrl])

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
          {passage.volume
            ? <Link href={`/du/library/${passage.volume}`} className="back-link">← 卷{VOLUME_CHINESE[passage.volume] ?? passage.volume}{passage.theme ? ` · ${passage.theme}` : ''}</Link>
            : <Link href="/du" className="back-link">← 慢读</Link>
          }
          <p className="subtitle">{date}</p>
          <h1 className="du-day-title">{source}</h1>
        </div>
      </header>

      <section className="panel du-panel du-day-panel">
        {/* 出处 */}
        <p className="du-day-attribution">
          {buildAttribution(passage, context)}
        </p>

        {/* 作者简介 */}
        {author && (
          <div className="du-day-section">
            <span className="du-day-label">{passage.source_origin}</span>
            <p className="du-day-content">{author.description}</p>
          </div>
        )}

        {/* 文章背景 */}
        {article && (
          <div className="du-day-section">
            <span className="du-day-label">{article.base_title}</span>
            <p className="du-day-content">{article.background}</p>
          </div>
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
        {payload && !isShareOpen && (
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

        {/* 分段导航 */}
        {context && context.totalSegments > 1 && (
          <nav className="du-day-pager" aria-label="分段导航">
            {context.segmentIds.map((segmentId, index) => {
              const segmentNumber = index + 1
              const isCurrent = segmentNumber === context.currentIndex
              const href = isCurrent && !isPreviewPage ? `/du/${date}` : `/du/preview/${segmentId}`

              return (
                <Link
                  key={segmentId}
                  href={href}
                  className={`du-day-pager-link${isCurrent ? ' is-current' : ''}`}
                  aria-current={isCurrent ? 'page' : undefined}
                >
                  ({segmentNumber})
                </Link>
              )
            })}
          </nav>
        )}
      </section>

      {/* 分享弹窗 — 极简结构，避免 iOS 长按截取到父元素 CSS */}
      {isShareOpen && (
        <div className="du-share-sheet" onClick={closeShare}>
          <div className="du-share-sheet-topbar">
            <span className="du-share-sheet-title">点图片保存或分享</span>
            <button className="du-share-close" onClick={closeShare} aria-label="关闭">×</button>
          </div>

          {isGenerating && (
            <div className="du-share-generating">生成中…</div>
          )}
          {shareImageUrl && (
            <img
              className="du-share-sheet-image"
              src={shareImageUrl}
              alt="慢读分享长图预览"
              onClick={(event) => {
                event.stopPropagation()
                void handleSaveShareImage()
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
