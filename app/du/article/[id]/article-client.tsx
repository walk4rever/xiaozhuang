'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Author, Article, Passage } from '@/lib/du-server'
import { renderSimpleMarkdown } from '@/lib/text-format'

const VOLUME_CHINESE: Record<number, string> = {
  1: '一', 2: '二', 3: '三', 4: '四', 5: '五',
  6: '六', 7: '七', 8: '八', 9: '九', 10: '十',
  11: '十一', 12: '十二', 13: '十三', 14: '十四', 15: '十五',
  16: '十六', 17: '十七', 18: '十八', 19: '十九', 20: '二十',
  21: '二十一', 22: '二十二', 23: '二十三', 24: '二十四', 25: '二十五', 26: '二十六',
}

interface Props {
  baseTitle: string
  sourceOrigin: string
  sourceBook: string
  volume: number | null
  theme: string | null
  segments: Passage[]
  author: Author | null
  article: Article | null
}

export default function ArticleClient({
  baseTitle,
  sourceOrigin,
  sourceBook,
  volume,
  theme,
  segments,
  author,
  article,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  const totalChars = segments.reduce((sum, s) => sum + s.content.replace(/\s/g, '').length, 0)
  const authorHref = `/du/author/${encodeURIComponent(sourceOrigin)}`

  const activeSegment = segments[activeIndex]
  const activePayload = activeSegment?.payload ?? null

  const closeSheet = () => setIsSheetOpen(false)

  const selectSegment = (index: number) => {
    setActiveIndex(index)
    setIsSheetOpen(true)
  }

  useEffect(() => {
    if (!isSheetOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSheet() }
    document.addEventListener('keydown', onKey)
    const isMobile = window.matchMedia('(max-width: 879px)').matches
    if (isMobile) document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [isSheetOpen])

  return (
    <div className="app du-app du-article-app">
      <header className="hero du-hero">
        <div className="du-mist-layer" aria-hidden="true" />
        <div className="du-mountain-layer" aria-hidden="true" />
        <div className="seal">篇</div>
        <div className="hero-text du-hero-text">
          <div className="du-article-backlinks">
            {volume ? (
              <>
                <Link href={`/du/library/${volume}`} className="back-link">
                  ← 卷{VOLUME_CHINESE[volume] ?? volume}{theme ? ` · ${theme}` : ''}
                </Link>
                <span className="du-article-backlinks-sep">·</span>
                <Link href={authorHref} className="back-link">{sourceOrigin}</Link>
              </>
            ) : (
              <Link href={authorHref} className="back-link">← {sourceOrigin}</Link>
            )}
          </div>
          <h1 className="du-day-title">{sourceOrigin} · {baseTitle}</h1>
          <p className="description">
            {sourceBook}
            {volume ? ` · 卷${VOLUME_CHINESE[volume] ?? volume}` : ''}
            {segments.length > 1 ? ` · 共 ${segments.length} 段 · ${totalChars} 字` : ` · ${totalChars} 字`}
          </p>
        </div>
      </header>

      <section className="panel du-panel du-article-panel">
        <div className="du-article-layout">
          <div className="du-article-reading">
            {author && (
              <div className="du-day-meta">
                <span className="du-day-meta-label">{sourceOrigin}</span>
                <p className="du-day-meta-text">{author.description}</p>
              </div>
            )}

            {article && (
              <div className="du-day-meta">
                <span className="du-day-meta-label">{baseTitle}</span>
                <p className="du-day-meta-text">{article.background}</p>
              </div>
            )}

            {segments.map((seg, i) => (
              <button
                key={seg.id}
                type="button"
                id={`seg-${i + 1}`}
                className={`du-article-para${i === activeIndex ? ' is-active' : ''}`}
                onClick={() => selectSegment(i)}
              >
                <div className="du-day-content du-day-origin">
                  {seg.content.split('\n').map((line, j) => (
                    <p key={j}>
                      {j === 0 && segments.length > 1 && (
                        <span className="du-article-para-num">{i + 1}</span>
                      )}
                      {line}
                    </p>
                  ))}
                </div>
              </button>
            ))}
          </div>

          <aside className={`du-article-gloss-panel${isSheetOpen ? ' is-open' : ''}`}>
            <div className="du-article-gloss-topbar">
              <span className="du-article-gloss-topbar-title">
                {segments.length > 1 ? `第 ${activeIndex + 1} 段解读` : '分段解读'}
              </span>
              <button className="du-article-gloss-close" onClick={closeSheet} aria-label="关闭">×</button>
            </div>

            <div className="du-article-gloss-scroll">
              {activePayload ? (
                <div className="du-article-gloss-body">
                  <div className="du-article-gloss-row">
                    <span className="du-day-label">一句话</span>
                    <p className="du-day-content du-day-summary">{activePayload.summary}</p>
                  </div>

                  <div className="du-article-gloss-row">
                    <span className="du-day-label">慢慢读</span>
                    <div className="du-day-content">
                      {activePayload.translation.split('\n').filter(Boolean).map((line, j) => (
                        <p key={j}>{line}</p>
                      ))}
                    </div>
                  </div>

                  <div className="du-article-gloss-row">
                    <span className="du-day-label">关键词</span>
                    <ul className="du-day-keywords">
                      {activePayload.keywords.map((k) => (
                        <li key={k.term}>
                          <strong>{k.term}</strong>：{k.explanation}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="du-article-gloss-row">
                    <span className="du-day-label">析结构</span>
                    <p
                      className="du-day-content"
                      dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(activePayload.structure) }}
                    />
                  </div>

                  <div className="du-article-gloss-row">
                    <span className="du-day-label">启示</span>
                    <div className="du-day-content du-day-insight">
                      {activePayload.insight.split('\n').filter(Boolean).map((line, j) => (
                        <p key={j}>{line}</p>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="du-day-content" style={{ color: 'var(--ink-2)' }}>解读生成中，请稍后再来。</p>
              )}
            </div>
          </aside>

          {isSheetOpen && <div className="du-article-sheet-backdrop" onClick={closeSheet} aria-hidden="true" />}
        </div>
      </section>
    </div>
  )
}
