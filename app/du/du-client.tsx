'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { DailyRunWithPassage, VolumeInfo } from '@/lib/du-server'

const VOLUME_CHINESE: Record<number, string> = {
  1: '一', 2: '二', 3: '三', 4: '四', 5: '五',
  6: '六', 7: '七', 8: '八', 9: '九', 10: '十',
  11: '十一', 12: '十二', 13: '十三', 14: '十四', 15: '十五',
  16: '十六', 17: '十七', 18: '十八', 19: '十九', 20: '二十',
  21: '二十一', 22: '二十二', 23: '二十三', 24: '二十四', 25: '二十五', 26: '二十六',
}

interface Props {
  recentRuns: DailyRunWithPassage[]
  pagination: {
    page: number
    pageSize: number
    total: number
  }
  volumes: VolumeInfo[]
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function DuClient({ recentRuns, pagination, volumes }: Props) {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const confirm = params.get('confirm')
    if (confirm === 'ok') setMessage('订阅已确认，明日起开始发送慢读。')
    else if (confirm === 'invalid') setError('确认链接无效或已过期，请重新订阅。')
  }, [])

  const handleSubscribe = async () => {
    const trimmed = email.trim().toLowerCase()
    if (!EMAIL_REGEX.test(trimmed)) {
      setError('请输入有效邮箱地址。')
      setMessage(null)
      return
    }

    setIsLoading(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch('/api/du/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })

      const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string }
      if (!response.ok) {
        throw new Error(payload.error ?? '订阅失败，请稍后重试。')
      }

      setMessage(payload.message ?? '订阅成功。')
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '订阅失败，请稍后重试。')
    } finally {
      setIsLoading(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
  const hasPrev = pagination.page > 1
  const hasNext = pagination.page < totalPages
  const recentHash = '#du-recent'
  const buildPageHref = (page: number) => (page === 1 ? `/du${recentHash}` : `/du?page=${page}${recentHash}`)

  return (
    <div className="app du-app">
      <header className="hero du-hero">
        <div className="du-mist-layer" aria-hidden="true" />
        <div className="du-mountain-layer" aria-hidden="true" />
        <div className="seal">读</div>
        <div className="hero-text du-hero-text">
          <Link href="/" className="back-link">← 小庄</Link>
          <p className="subtitle">日读 · 慢研 · 养成</p>
          <h1>慢读</h1>
          <p className="description">
            每天一封《经史百家杂钞》节选，不求一下读完，只求慢慢读懂：一点原文，一点解释，一点照见今天的意味。
          </p>
        </div>
      </header>

      <section className="panel du-panel">
        <h2>输入邮箱，开始每日慢读</h2>
        <p className="du-tip">每日发送 1 封，不刷屏；每封都带退订链接。</p>

        <div className="du-subscribe-row">
          <input
            className="du-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleSubscribe()
              }
            }}
          />
          <button className="du-button" onClick={handleSubscribe} disabled={isLoading}>
            {isLoading ? '订阅中…' : '订阅慢读'}
          </button>
        </div>

        {message ? <p className="du-success">{message}</p> : null}
        {error ? <p className="du-error">{error}</p> : null}
      </section>

      <section className="panel du-panel du-about-panel">
        <h2>关于这本书</h2>
        <p className="du-about-intro">
          《经史百家杂钞》是曾国藩历时数年亲手编选的古文读本，从经、史、子、集四部广泛选材，汇集百家，取精去芜。
          他在军务繁忙之际仍坚持选编，正因相信：读古文是一种修身的功夫，而非单纯积累知识。
        </p>
        <div className="du-about-criteria">
          <div className="du-about-criterion">
            <span className="du-about-label">选文标准</span>
            <span className="du-about-value"><strong>义理</strong>（思想正）· <strong>考据</strong>（事实准）· <strong>词章</strong>（文字美）</span>
          </div>
          <div className="du-about-criterion">
            <span className="du-about-label">编纂总纲</span>
            <span className="du-about-value"><strong>文以载道、经世致用</strong> — 古文不是摆设，是用来解决真实问题的</span>
          </div>
          <div className="du-about-criterion">
            <span className="du-about-label">十大文体</span>
            <span className="du-about-value">论著 · 序跋 · 诏令 · 奏议 · 书牍 · 哀祭 · 传志 · 叙记 · 词赋 · 典志 · 杂记</span>
          </div>
        </div>
        <p className="du-about-why">
          如果你想读古文但不知从哪里下手，这本书是一个诚实的答案——这是一个真正用古文做事的人，替你筛过的书单。
        </p>
      </section>

      {volumes.length > 0 && (
        <section className="panel du-panel">
          <h2 className="du-admin-heading">
            书库
            <span className="du-library-book-total">{volumes.reduce((s, v) => s + v.count, 0)} 条</span>
          </h2>
          <ul className="du-library-volume-list">
            {volumes.map((v) => (
              <li key={v.volume} className="du-library-volume-item">
                <Link href={`/du/library/${v.volume}`} className="du-library-volume-link">
                  <span className="du-library-volume-name">
                    卷{VOLUME_CHINESE[v.volume] ?? v.volume} · {v.theme}
                  </span>
                  <span className="du-library-volume-count">{v.count} 条</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recentRuns.length > 0 && (
        <section id="du-recent" className="panel du-panel">
          <h2 className="du-admin-heading">近期慢读</h2>
          <ul className="du-recent-list">
            {recentRuns.map((r) => (
              <li key={r.id} className="du-recent-item">
                <span className="du-recent-date">{r.run_date}</span>
                <Link href={`/du/${r.run_date}`} className="du-recent-title">
                  {[r.passage.source_origin, r.passage.title].filter(Boolean).join(' · ')}
                </Link>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <nav className="du-recent-pager" aria-label="近期慢读分页">
              {hasPrev ? (
                <Link href={buildPageHref(pagination.page - 1)} className="du-recent-pager-btn" scroll={false}>
                  上一页
                </Link>
              ) : (
                <span className="du-recent-pager-btn is-disabled">上一页</span>
              )}

              <span className="du-recent-pager-info">第 {pagination.page} / {totalPages} 页</span>

              {hasNext ? (
                <Link href={buildPageHref(pagination.page + 1)} className="du-recent-pager-btn" scroll={false}>
                  下一页
                </Link>
              ) : (
                <span className="du-recent-pager-btn is-disabled">下一页</span>
              )}
            </nav>
          )}
        </section>
      )}
    </div>
  )
}
