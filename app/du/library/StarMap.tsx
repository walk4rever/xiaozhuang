'use client'

import { useMemo, useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import styles from './StarMap.module.css'
import type { StarMapAuthor } from '@/lib/du-server'

const DYNASTIES = [
  { name: '先秦', start: -770, end: -221 },
  { name: '秦', start: -221, end: -206 },
  { name: '汉', start: -206, end: 220 },
  { name: '魏晋', start: 220, end: 420 },
  { name: '南北朝', start: 420, end: 589 },
  { name: '隋唐', start: 589, end: 907 },
  { name: '宋', start: 960, end: 1279 },
  { name: '元', start: 1271, end: 1368 },
  { name: '明', start: 1368, end: 1644 },
  { name: '清', start: 1644, end: 1912 },
]

const DYNASTY_COLORS: Record<string, string> = {
  先秦: '#c56b2d',
  秦: '#2f7fbf',
  汉: '#5b9b3a',
  魏晋: '#7a5ac9',
  南北朝: '#2e9a8f',
  隋唐: '#d18a22',
  宋: '#3f8f5d',
  元: '#a557b6',
  明: '#b84e4e',
  清: '#4f78b8',
}

const X_MIN = 1
const X_MAX = 99
const YEAR_MIN = -770
const YEAR_MAX = 1912
const Y_MIN = 10
const Y_MAX = 80
const CANVAS_WIDTH = 1000
const CANVAS_HEIGHT = 300

function yearToX(year: number): number {
  const clampedYear = Math.max(YEAR_MIN, Math.min(YEAR_MAX, year))
  const normalized = (clampedYear - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)
  return X_MIN + normalized * (X_MAX - X_MIN)
}

function dynastyRangeOf(name: string): { start: number; end: number } | null {
  const dynastyRange = DYNASTIES.find((d) => d.name === name)
  if (!dynastyRange) return null
  return { start: dynastyRange.start, end: dynastyRange.end }
}

function dynastyX(dynasty: string): number {
  const range = dynastyRangeOf(dynasty)
  if (!range) return 50
  return yearToX((range.start + range.end) / 2)
}

function authorX(author: StarMapAuthor): number {
  const range = dynastyRangeOf(author.dynasty)
  if (!range) return yearToX(author.year)
  const clampedYear = Math.max(range.start, Math.min(range.end, author.year))
  return yearToX(clampedYear)
}

function authorXBounds(author: StarMapAuthor): { min: number; max: number } {
  const range = dynastyRangeOf(author.dynasty)
  if (!range) return { min: X_MIN, max: X_MAX }
  return {
    min: yearToX(range.start),
    max: yearToX(range.end),
  }
}

function weightedScore(author: StarMapAuthor): number {
  return author.article_count * 200 + author.total_chars
}

function scoreRange(authors: StarMapAuthor[]): { min: number; max: number } {
  if (authors.length === 0) return { min: 0, max: 1 }
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const author of authors) {
    const score = weightedScore(author)
    if (score < min) min = score
    if (score > max) max = score
  }
  if (min === max) return { min, max: min + 1 }
  return { min, max }
}

function starRadius(author: StarMapAuthor, min: number, max: number): number {
  const score = weightedScore(author)
  const normalized = (score - min) / (max - min)
  return 5 + normalized * 7
}

type PlacedStar = {
  author: StarMapAuthor
  x: number
  y: number
  r: number
  color: string
  isPreQin: boolean
}

function collides(a: { x: number; y: number; r: number }, b: { x: number; y: number; r: number }): boolean {
  const dx = (a.x - b.x) * (CANVAS_WIDTH / 100)
  const dy = (a.y - b.y) * (CANVAS_HEIGHT / 100)
  const distance = Math.sqrt(dx * dx + dy * dy)
  return distance < a.r + b.r + 2
}

function seedFrom(author: StarMapAuthor): number {
  return author.name.charCodeAt(0) + author.name.charCodeAt(author.name.length - 1) + author.year
}

function placeStars(authors: StarMapAuthor[], minScore: number, maxScore: number): PlacedStar[] {
  const placed: PlacedStar[] = []
  const sorted = [...authors].sort((a, b) => weightedScore(b) - weightedScore(a))

  for (const author of sorted) {
    const baseX = authorX(author)
    const bounds = authorXBounds(author)
    const r = starRadius(author, minScore, maxScore)
    const color = DYNASTY_COLORS[author.dynasty] ?? '#7a6758'
    const isPreQin = author.dynasty === '先秦'
    const seed = seedFrom(author)
    const baseY = Y_MIN + ((seed % 1000) / 1000) * (Y_MAX - Y_MIN)

    let chosenX = Math.max(bounds.min, Math.min(bounds.max, baseX))
    let chosenY = baseY
    let found = false

    for (let step = 0; step <= 16 && !found; step++) {
      const yUp = Math.max(Y_MIN, Math.min(Y_MAX, baseY - step * 2.4))
      const yDown = Math.max(Y_MIN, Math.min(Y_MAX, baseY + step * 2.4))
      const xShift = (step % 5) * 0.5
      const candidates = [
        { x: Math.max(bounds.min, Math.min(bounds.max, baseX - xShift)), y: yUp },
        { x: Math.max(bounds.min, Math.min(bounds.max, baseX + xShift)), y: yDown },
      ]
      for (const candidate of candidates) {
        const blocked = placed.some((p) => collides({ x: candidate.x, y: candidate.y, r }, p))
        if (!blocked) {
          chosenX = candidate.x
          chosenY = candidate.y
          found = true
          break
        }
      }
    }

    placed.push({ author, x: chosenX, y: chosenY, r, color, isPreQin })
  }

  return placed
}

type TooltipPos = { x: number; y: number; flip: boolean }

function tooltipPosFrom(e: MouseEvent): TooltipPos {
  return {
    x: e.clientX,
    y: e.clientY,
    flip: e.clientX > window.innerWidth * 0.6,
  }
}

export function StarMap({ authors }: { authors: StarMapAuthor[] }) {
  const router = useRouter()
  const [hovered, setHovered] = useState<StarMapAuthor | null>(null)
  const [tooltipPos, setTooltipPos] = useState<TooltipPos>({ x: 0, y: 0, flip: false })

  const stars = useMemo(() => {
    const { min, max } = scoreRange(authors)
    return placeStars(authors, min, max)
  }, [authors])

  const handleMouseEnter = (author: StarMapAuthor, e: MouseEvent) => {
    setHovered(author)
    setTooltipPos(tooltipPosFrom(e))
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (hovered) setTooltipPos(tooltipPosFrom(e))
  }

  // 触屏没有 hover：第一次点亮预览，第二次才跳转。
  // 桌面端 hover 已经写入 hovered，所以单击仍然直接跳转。
  const handleStarClick = (author: StarMapAuthor, e: MouseEvent) => {
    if (hovered?.name !== author.name) {
      setHovered(author)
      setTooltipPos(tooltipPosFrom(e))
      return
    }
    router.push(`/du/author/${encodeURIComponent(author.name)}`)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.title}>中华文脉星空图</h2>
        <p className={styles.subtitle}>两千年·{authors.length} 人·璀璨如星</p>
      </div>

      <div className={styles.skyWrap} onMouseMove={handleMouseMove} onMouseLeave={() => setHovered(null)}>
        <div className={styles.sky}>
        {DYNASTIES.map((d) => (
          <span key={d.name} className={styles.dynastyLabel} style={{ left: `${dynastyX(d.name)}%` }}>
            <span
              className={styles.dynastyName}
              style={{ color: DYNASTY_COLORS[d.name], fontWeight: 700 }}
            >
              {d.name}
            </span>
          </span>
        ))}

        {DYNASTIES.slice(1).map((d) => (
          <div key={d.name + '-line'} className={styles.dynastyLine} style={{ left: `${yearToX(d.start)}%` }} />
        ))}

        {stars.map((s) => (
          <button
            key={s.author.name}
            className={styles.star}
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.r * 2,
              height: s.r * 2,
              background: s.color,
              border: s.isPreQin ? '1px solid rgba(255, 240, 205, 0.95)' : '1px solid rgba(255, 245, 220, 0.6)',
              boxShadow: s.isPreQin
                ? '0 0 0 1px rgba(93, 58, 22, 0.18), 0 0 12px rgba(185, 122, 47, 0.55)'
                : '0 0 0 1px rgba(93, 58, 22, 0.12), 0 0 8px rgba(122, 104, 86, 0.28)',
            }}
            onMouseEnter={(e) => handleMouseEnter(s.author, e)}
            onClick={(e) => handleStarClick(s.author, e)}
            aria-label={`${s.author.name}（${s.author.dynasty}·${s.author.article_count} 篇），查看其选文`}
          />
        ))}
        </div>
      </div>

      {hovered && (
        <div
          className={styles.tooltip}
          style={
            tooltipPos.flip
              ? { position: 'fixed', right: window.innerWidth - tooltipPos.x + 14, top: Math.max(8, tooltipPos.y - 40) }
              : { position: 'fixed', left: tooltipPos.x + 14, top: Math.max(8, tooltipPos.y - 40) }
          }
        >
          <span className={styles.tooltipName}>{hovered.name}</span>
          <span className={styles.tooltipMeta}>
            {hovered.dynasty} · {hovered.article_count} 篇 · {hovered.total_chars} 字
          </span>
        </div>
      )}
    </div>
  )
}
