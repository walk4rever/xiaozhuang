'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { DailyRunWithPassage } from '@/lib/du-server'

interface Props {
  recentRuns: DailyRunWithPassage[]
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function DuClient({ recentRuns }: Props) {
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

  return (
    <div className="app du-app">
      <header className="hero du-hero">
        <div className="du-mist-layer" aria-hidden="true" />
        <div className="du-mountain-layer" aria-hidden="true" />
        <div className="seal">读</div>
        <div className="hero-text du-hero-text">
          <Link href="/" className="back-link">← 小庄</Link>
          <p className="subtitle">日读 · 慢研 · 养成</p>
          <h1>慢读订阅</h1>
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

      {recentRuns.length > 0 && (
        <section className="panel du-panel">
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
        </section>
      )}
    </div>
  )
}
