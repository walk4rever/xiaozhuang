import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { AuthorArticleEntry } from '@/lib/du-server'
import { getAuthorProfile, getAuthorArticles, getAuthorArticleTitles } from '@/lib/du-server'

interface Props {
  params: Promise<{ name: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name: raw } = await params
  const name = decodeURIComponent(raw)
  const profile = await getAuthorProfile(name).catch(() => null)
  if (!profile) return { title: '作者 — 小庄' }
  return {
    title: `${profile.source_origin} — 作者文库 — 小庄`,
    description: profile.description?.slice(0, 120) ?? `${profile.source_origin} 相关篇目`,
  }
}

export default async function AuthorPage({ params }: Props) {
  const { name: raw } = await params
  const name = decodeURIComponent(raw)

  const [profile, articles, articleTitles] = await Promise.all([
    getAuthorProfile(name).catch(() => null),
    getAuthorArticles(name).catch(() => []),
    getAuthorArticleTitles(name).catch(() => []),
  ])

  if (!profile) notFound()

  const grouped = articles.reduce<Record<string, AuthorArticleEntry[]>>((acc, article) => {
    const theme = article.theme || '未分类'
    if (!acc[theme]) acc[theme] = []
    acc[theme].push(article)
    return acc
  }, {})

  const fallbackTitles = articleTitles.filter(
    (t) => !articles.some((a) => a.base_title === t.base_title)
  )

  return (
    <div className="app du-app">
      <header className="hero du-hero">
        <div className="du-mist-layer" aria-hidden="true" />
        <div className="du-mountain-layer" aria-hidden="true" />
        <div className="seal">人</div>
        <div className="hero-text du-hero-text">
          <Link href="/" className="back-link">← 首页</Link>
          <p className="subtitle">作者文库</p>
          <h1>{profile.source_origin}</h1>
          <p className="description">
            {profile.dynasty ?? '朝代未标注'}
            {profile.article_count ? ` · ${profile.article_count} 篇` : ''}
            {profile.total_chars ? ` · ${profile.total_chars} 字` : ''}
          </p>
        </div>
      </header>

      <section className="panel du-panel" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0, marginBottom: '0.8rem', fontSize: '1.05rem' }}>简介</h2>
        <p style={{ margin: 0, color: 'var(--ink-1)', lineHeight: 1.9 }}>
          {profile.description?.trim() || '暂无作者简介。'}
        </p>
      </section>

      <section className="panel du-panel">
        <h2 style={{ marginTop: 0, marginBottom: '0.8rem', fontSize: '1.05rem' }}>文章</h2>
        {articles.length === 0 && fallbackTitles.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--ink-2)' }}>暂无可展示文章。</p>
        ) : (
          <ul className="du-library-article-list" style={{ marginTop: 0 }}>
            {Object.entries(grouped).map(([theme, entries]) => (
              <li key={theme} className="du-library-origin-group">
                <span className="du-library-origin-label">{theme}</span>
                <ul className="du-library-article-sublist">
                  {entries.map((a) => (
                    <li key={a.first_id} className="du-library-article-item">
                      <Link href={`/du/article/${a.first_id}`} className="du-library-article-link">
                        {a.base_title || '未命名'}
                      </Link>
                      {a.segment_count > 1 && (
                        <span className="du-library-segment-hint">共 {a.segment_count} 段</span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {fallbackTitles.length > 0 && (
              <li key="pending-passages" className="du-library-origin-group">
                <span className="du-library-origin-label">未分类</span>
                <ul className="du-library-article-sublist">
                  {fallbackTitles.map((a) => (
                    <li key={a.base_title} className="du-library-article-item">
                      <span
                        className="du-library-article-link"
                        style={{ opacity: 0.56, cursor: 'not-allowed' }}
                        title="该条目尚未入库可读原文"
                      >
                        {a.base_title}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  )
}
