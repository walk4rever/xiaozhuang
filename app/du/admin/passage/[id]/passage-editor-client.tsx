'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { PassageFull, PassageContext } from '@/lib/du-server'
import type { DuOutput } from '@/data/du-prompt'

interface Props {
  id: number
}

type PassageWithContext = PassageFull & { context: PassageContext | null }

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
const getSecret = () => sessionStorage.getItem('du_admin_secret') ?? ''

const adminFetch = async (path: string, init?: RequestInit) => {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': getSecret(),
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 401) throw new Error('密码错误，请返回管理页重新登录')
  return res.json()
}

// ---------------------------------------------------------------------------
// Segment nav bar
// ---------------------------------------------------------------------------
function SegmentNav({ context, currentId }: { context: PassageContext; currentId: number }) {
  const { currentIndex, totalSegments, prevId, nextId, baseTitle } = context

  if (totalSegments <= 1) return null

  return (
    <div className="du-admin-seg-nav">
      <Link
        href={prevId ? `/du/admin/passage/${prevId}` : '#'}
        className={`du-admin-seg-nav-btn${!prevId ? ' du-admin-seg-nav-disabled' : ''}`}
        aria-disabled={!prevId}
      >
        ← 上一段
      </Link>
      <span className="du-admin-seg-nav-info">
        {baseTitle}｜第 {currentIndex} 段 / 共 {totalSegments} 段
        <span className="du-admin-seg-nav-id">（#{currentId}）</span>
      </span>
      <Link
        href={nextId ? `/du/admin/passage/${nextId}` : '#'}
        className={`du-admin-seg-nav-btn${!nextId ? ' du-admin-seg-nav-disabled' : ''}`}
        aria-disabled={!nextId}
      >
        下一段 →
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Payload display
// ---------------------------------------------------------------------------
function PayloadView({ payload, generatedAt }: { payload: DuOutput; generatedAt: string | null }) {
  return (
    <div className="du-admin-payload">
      {generatedAt && (
        <p className="du-admin-payload-meta">生成于 {new Date(generatedAt).toLocaleString('zh-CN')}</p>
      )}
      <div className="du-admin-payload-field">
        <span className="du-admin-payload-label">一句话</span>
        <p>{payload.summary}</p>
      </div>
      <div className="du-admin-payload-field">
        <span className="du-admin-payload-label">白话译</span>
        <p>{payload.translation}</p>
      </div>
      <div className="du-admin-payload-field">
        <span className="du-admin-payload-label">关键词</span>
        <ul className="du-admin-payload-keywords">
          {payload.keywords.map((k, i) => (
            <li key={i}><strong>{k.term}</strong>：{k.explanation}</li>
          ))}
        </ul>
      </div>
      <div className="du-admin-payload-field">
        <span className="du-admin-payload-label">结构</span>
        <p>{payload.structure}</p>
      </div>
      <div className="du-admin-payload-field">
        <span className="du-admin-payload-label">启示</span>
        <p>{payload.insight}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function PassageEditorClient({ id }: Props) {
  const router = useRouter()
  const [passage, setPassage] = useState<PassageWithContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [noAuth, setNoAuth] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Editable fields
  const [title, setTitle] = useState('')
  const [sourceOrigin, setSourceOrigin] = useState('')
  const [difficulty, setDifficulty] = useState(1)
  const [theme, setTheme] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [content, setContent] = useState('')

  const [savingMeta, setSavingMeta] = useState(false)
  const [savingContent, setSavingContent] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const addLog = (msg: string) =>
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 15))

  const loadPassage = (data: PassageWithContext) => {
    setPassage(data)
    setTitle(data.title ?? '')
    setSourceOrigin(data.source_origin ?? '')
    setDifficulty(data.difficulty)
    setTheme(data.theme ?? '')
    setEnabled(data.enabled)
    setContent(data.content)
  }

  useEffect(() => {
    if (!getSecret()) {
      setNoAuth(true)
      setLoading(false)
      return
    }
    adminFetch(`/api/du/admin/passage/${id}`, { method: 'GET', headers: {} })
      .then(loadPassage)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [id])

  const handleSaveMeta = async () => {
    setSavingMeta(true)
    try {
      await adminFetch(`/api/du/admin/passage/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, source_origin: sourceOrigin, difficulty, theme, enabled }),
      })
      setPassage((prev) => prev ? { ...prev, title, source_origin: sourceOrigin, difficulty, theme, enabled } : prev)
      addLog('✓ 元数据已保存')
    } catch (e: unknown) {
      addLog(`✗ ${e instanceof Error ? e.message : '保存失败'}`)
    } finally {
      setSavingMeta(false)
    }
  }

  const handleSaveContent = async () => {
    setSavingContent(true)
    try {
      await adminFetch(`/api/du/admin/passage/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      })
      setPassage((prev) => prev ? { ...prev, content } : prev)
      addLog('✓ 正文已保存')
    } catch (e: unknown) {
      addLog(`✗ ${e instanceof Error ? e.message : '保存失败'}`)
    } finally {
      setSavingContent(false)
    }
  }

  const handleSaveAndNext = async () => {
    await handleSaveContent()
    const nextId = passage?.context?.nextId
    if (nextId) router.push(`/du/admin/passage/${nextId}`)
  }

  const handleRegenerate = async () => {
    if (!confirm('重新生成 AI 解读？当前 payload 将被覆盖。')) return
    setRegenerating(true)
    addLog('重新生成 payload…')
    try {
      await adminFetch('/api/du/admin/regenerate', {
        method: 'POST',
        body: JSON.stringify({ passageId: id }),
      })
      const updated: PassageWithContext = await adminFetch(`/api/du/admin/passage/${id}`, { method: 'GET', headers: {} })
      setPassage(updated)
      addLog('✓ Payload 已重新生成')
    } catch (e: unknown) {
      addLog(`✗ ${e instanceof Error ? e.message : '生成失败'}`)
    } finally {
      setRegenerating(false)
    }
  }

  // ── States ────────────────────────────────────────
  if (noAuth) {
    return (
      <div className="app du-app">
        <section className="panel du-panel du-admin-section">
          <p>请先 <Link href="/du/admin" className="du-admin-link">返回管理页登录</Link>，再访问段落编辑器。</p>
        </section>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="app du-app">
        <section className="panel du-panel du-admin-section">
          <p className="du-admin-empty">加载中…</p>
        </section>
      </div>
    )
  }

  if (error || !passage) {
    return (
      <div className="app du-app">
        <section className="panel du-panel du-admin-section">
          <p className="du-admin-empty">{error ?? '段落不存在'}</p>
          <Link href="/du/admin" className="du-admin-link">← 返回管理</Link>
        </section>
      </div>
    )
  }

  const { context } = passage

  // ── Editor ────────────────────────────────────────
  return (
    <div className="app du-app">
      <header className="hero du-hero" style={{ minHeight: '30vh' }}>
        <div className="du-mist-layer" aria-hidden="true" />
        <div className="du-mountain-layer" aria-hidden="true" />
        <div className="hero-text du-hero-text">
          <Link href="/du/admin" className="back-link">← 管理</Link>
          <p className="subtitle">段落编辑</p>
          <h1>
            {context && context.totalSegments > 1
              ? `${context.baseTitle}（${context.currentIndex}/${context.totalSegments}）`
              : (passage.source_origin ?? passage.source_book)}
          </h1>
        </div>
      </header>

      {/* 段落导航 */}
      {context && <SegmentNav context={context} currentId={id} />}

      {/* 元数据 */}
      <section className="panel du-panel du-admin-section">
        <h2 className="du-admin-heading">元数据</h2>
        <div className="du-admin-editor-grid">
          <div className="du-admin-field-group">
            <label className="du-admin-field-label">标题</label>
            <input
              className="du-admin-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="du-admin-field-group">
            <label className="du-admin-field-label">来源</label>
            <input
              className="du-admin-input"
              value={sourceOrigin}
              onChange={(e) => setSourceOrigin(e.target.value)}
            />
          </div>
          <div className="du-admin-field-group">
            <label className="du-admin-field-label">难度 (1–5)</label>
            <input
              className="du-admin-input"
              type="number"
              min={1}
              max={5}
              value={difficulty}
              onChange={(e) => setDifficulty(parseInt(e.target.value, 10))}
            />
          </div>
          <div className="du-admin-field-group">
            <label className="du-admin-field-label">主题</label>
            <input
              className="du-admin-input"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            />
          </div>
          <div className="du-admin-field-group">
            <label className="du-admin-field-label">启用</label>
            <label className="du-admin-toggle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>{enabled ? '已启用' : '已禁用'}</span>
            </label>
          </div>
        </div>
        <div className="du-admin-actions" style={{ marginTop: '1rem' }}>
          <button
            className="du-admin-btn du-admin-btn-primary"
            onClick={handleSaveMeta}
            disabled={savingMeta}
          >
            {savingMeta ? '保存中…' : '保存元数据'}
          </button>
          <Link href={`/du/preview/${id}`} className="du-admin-btn" target="_blank">
            预览阅读页 →
          </Link>
        </div>
      </section>

      {/* 正文 */}
      <section className="panel du-panel du-admin-section">
        <h2 className="du-admin-heading">
          正文
          <span className="du-admin-library-total">{content.length} 字</span>
        </h2>
        <textarea
          className="du-admin-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          spellCheck={false}
        />
        <div className="du-admin-actions" style={{ marginTop: '0.75rem' }}>
          <button
            className="du-admin-btn du-admin-btn-primary"
            onClick={handleSaveContent}
            disabled={savingContent || content === passage.content}
          >
            {savingContent ? '保存中…' : '保存正文'}
          </button>
          {context?.nextId && (
            <button
              className="du-admin-btn du-admin-btn-primary"
              onClick={handleSaveAndNext}
              disabled={savingContent}
            >
              {savingContent ? '保存中…' : '保存并到下一段 →'}
            </button>
          )}
          <button
            className="du-admin-btn"
            onClick={() => setContent(passage.content)}
            disabled={content === passage.content}
          >
            撤销更改
          </button>
        </div>
      </section>

      {/* Payload */}
      <section className="panel du-panel du-admin-section">
        <h2 className="du-admin-heading">AI 解读 (Payload)</h2>
        {passage.payload ? (
          <PayloadView payload={passage.payload} generatedAt={passage.payload_generated_at} />
        ) : (
          <p className="du-admin-empty">暂无 payload</p>
        )}
        <div className="du-admin-actions" style={{ marginTop: '1rem' }}>
          <button
            className="du-admin-btn du-admin-btn-warn"
            onClick={handleRegenerate}
            disabled={regenerating}
          >
            {regenerating ? '生成中…' : '重新生成 Payload'}
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
    </div>
  )
}
