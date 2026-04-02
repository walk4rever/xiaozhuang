'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface RunSummary {
  id: number
  run_date: string
  sent_count: number
  passage: {
    source_origin: string | null
    title: string | null
    payload: unknown
  }
}

interface TodayStatus {
  prepared: boolean
  run: RunSummary | null
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
const callApi = async (path: string, body?: Record<string, unknown>) => {
  const secret = sessionStorage.getItem('du_admin_secret') ?? ''
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': secret,
    },
    body: JSON.stringify(body ?? {}),
  })
  if (res.status === 401) {
    sessionStorage.removeItem('du_admin_secret')
    throw new Error('密码错误，请重新登录')
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function DuAdminClient() {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState(false)

  const [todayStatus, setTodayStatus] = useState<TodayStatus | null>(null)
  const [recentRuns, setRecentRuns] = useState<RunSummary[]>([])
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const addLog = (msg: string) =>
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 20))

  // ── 验证密码 ──────────────────────────────────────────
  const handleAuth = async () => {
    if (!password.trim()) return
    const secret = password.trim()
    const res = await fetch('/api/du/admin/ping', {
      method: 'POST',
      headers: { 'x-cron-secret': secret },
    })
    if (!res.ok) {
      setAuthError(true)
      return
    }
    sessionStorage.setItem('du_admin_secret', secret)
    setAuthed(true)
    setAuthError(false)
  }

  // ── 拉取今日状态 ──────────────────────────────────────
  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/du/reading/${today}`)
      if (res.ok) {
        const run = await res.json()
        setTodayStatus({ prepared: true, run })
      } else {
        setTodayStatus({ prepared: false, run: null })
      }
    } catch {
      setTodayStatus({ prepared: false, run: null })
    }
  }

  // ── 拉取最近7天 ──────────────────────────────────────
  const fetchRecent = async () => {
    try {
      const res = await fetch('/api/du/reading/recent')
      if (res.ok) {
        const data = await res.json()
        setRecentRuns(data ?? [])
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!authed) return
    fetchStatus()
    fetchRecent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed])

  // ── 操作 ─────────────────────────────────────────────
  const handleApiError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e)
    addLog(`✗ ${msg}`)
    if (msg.includes('重新登录')) setAuthed(false)
  }

  const handlePrepare = async (force = false) => {
    setBusy('prepare')
    addLog(force ? '重置并重新选文…' : '选文并写入今日记录…')
    try {
      const data = await callApi('/api/du/cron/prepare', { force })
      addLog(data.error ? `✗ ${data.error}` : `✓ 已准备：${data.sourceOrigin} · ${data.title}`)
      await fetchStatus()
    } catch (e) {
      handleApiError(e)
    } finally {
      setBusy(null)
    }
  }

  const handleTestSend = async () => {
    setBusy('test')
    addLog('发送测试邮件…')
    try {
      const data = await callApi('/api/du/cron/send', { testOnly: true })
      addLog(data.error ? `✗ ${data.error}` : '✓ 测试邮件已发送')
    } catch (e) {
      handleApiError(e)
    } finally {
      setBusy(null)
    }
  }

  const handleRealSend = async () => {
    if (!confirm('确认发送给所有订阅者？')) return
    setBusy('send')
    addLog('正式发送…')
    try {
      const data = await callApi('/api/du/cron/send', { testOnly: false })
      addLog(
        data.error
          ? `✗ ${data.error}`
          : `✓ 已发送 ${data.sentCount ?? 0} 封`
      )
      await Promise.all([fetchStatus(), fetchRecent()])
    } catch (e) {
      handleApiError(e)
    } finally {
      setBusy(null)
    }
  }

  // ── 登录界面 ──────────────────────────────────────────
  if (!authed) {
    return (
      <div className="app du-app">
        <header className="hero du-hero" style={{ minHeight: '40vh' }}>
          <div className="du-mist-layer" aria-hidden="true" />
          <div className="du-mountain-layer" aria-hidden="true" />
          <div className="hero-text du-hero-text">
            <Link href="/du" className="back-link">← 慢读</Link>
            <h1>慢读管理</h1>
          </div>
        </header>
        <section className="panel du-panel">
          <h2>验证身份</h2>
          <div className="du-subscribe-row">
            <input
              className="du-input"
              type="password"
              placeholder="管理密码"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
            />
            <button className="du-button" onClick={handleAuth}>进入</button>
          </div>
          {authError && <p className="du-error">密码错误</p>}
        </section>
      </div>
    )
  }

  // ── 管理界面 ──────────────────────────────────────────
  const source = todayStatus?.run
    ? [todayStatus.run.passage.source_origin, todayStatus.run.passage.title]
        .filter(Boolean)
        .join(' · ')
    : null

  return (
    <div className="app du-app">
      <header className="hero du-hero" style={{ minHeight: '40vh' }}>
        <div className="du-mist-layer" aria-hidden="true" />
        <div className="du-mountain-layer" aria-hidden="true" />
        <div className="hero-text du-hero-text">
          <Link href="/du" className="back-link">← 慢读</Link>
          <p className="subtitle">管理后台</p>
          <h1>今日 {today}</h1>
        </div>
      </header>

      {/* 今日状态 */}
      <section className="panel du-panel du-admin-section">
        <h2 className="du-admin-heading">今日状态</h2>

        <div className="du-admin-status">
          <span className={`du-admin-badge ${todayStatus?.prepared ? 'du-admin-badge-ok' : 'du-admin-badge-no'}`}>
            {todayStatus?.prepared ? '✓ 已准备' : '○ 未准备'}
          </span>
          {source && <span className="du-admin-source">{source}</span>}
          {todayStatus?.run && (
            <span className={`du-admin-badge ${todayStatus.run.sent_count > 0 ? 'du-admin-badge-ok' : 'du-admin-badge-no'}`}>
              {todayStatus.run.sent_count > 0 ? `✓ 已发送 ${todayStatus.run.sent_count} 封` : '○ 未发送'}
            </span>
          )}
          {todayStatus?.run?.passage.payload == null && todayStatus?.prepared && (
            <span className="du-admin-badge du-admin-badge-warn">⚠ 缺 payload</span>
          )}
        </div>

        {todayStatus?.prepared && (
          <div style={{ marginTop: '0.5rem' }}>
            <Link href={`/du/${today}`} className="du-admin-link" target="_blank">
              查看阅读页 →
            </Link>
          </div>
        )}

        <div className="du-admin-actions">
          <button
            className="du-admin-btn"
            onClick={() => handlePrepare(false)}
            disabled={!!busy || todayStatus?.prepared === true}
          >
            {busy === 'prepare' ? '处理中…' : '选文 & 准备'}
          </button>
          <button
            className="du-admin-btn du-admin-btn-warn"
            onClick={() => handlePrepare(true)}
            disabled={!!busy}
          >
            重置今日 & 重新选文
          </button>
          <button
            className="du-admin-btn"
            onClick={handleTestSend}
            disabled={!!busy || !todayStatus?.prepared}
          >
            {busy === 'test' ? '发送中…' : '发测试邮件'}
          </button>
          <button
            className="du-admin-btn du-admin-btn-primary"
            onClick={handleRealSend}
            disabled={!!busy || !todayStatus?.prepared || (todayStatus?.run?.sent_count ?? 0) > 0}
          >
            {busy === 'send' ? '发送中…' : '发给所有订阅者'}
          </button>
        </div>
      </section>

      {/* 操作日志 */}
      {log.length > 0 && (
        <section className="panel du-panel du-admin-section">
          <h2 className="du-admin-heading">操作日志</h2>
          <div className="du-admin-log">
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </section>
      )}

      {/* 最近7天 */}
      {recentRuns.length > 0 && (
        <section className="panel du-panel du-admin-section">
          <h2 className="du-admin-heading">最近发送记录</h2>
          <ul className="du-admin-history">
            {recentRuns.map((r) => (
              <li key={r.id} className="du-admin-history-item">
                <span className="du-admin-history-date">{r.run_date}</span>
                <span className="du-admin-history-source">
                  {[r.passage.source_origin, r.passage.title].filter(Boolean).join(' · ')}
                </span>
                <span className="du-admin-history-sent">{r.sent_count} 封</span>
                <Link href={`/du/${r.run_date}`} className="du-admin-link" target="_blank">阅读</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
