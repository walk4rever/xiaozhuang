import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getArticleView } from '@/lib/du-server'
import ArticleClient from './article-client'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const passageId = parseInt(id, 10)
  if (isNaN(passageId)) return { title: '文章 — 小庄' }

  const view = await getArticleView(passageId).catch(() => null)
  if (!view) return { title: '文章 — 小庄' }

  return {
    title: `${view.sourceOrigin} · ${view.baseTitle} — 小庄`,
    description: view.article?.background?.slice(0, 120) ?? `${view.sourceOrigin}《${view.baseTitle}》`,
  }
}

export default async function ArticlePage({ params }: Props) {
  const { id } = await params
  const passageId = parseInt(id, 10)
  if (isNaN(passageId)) notFound()

  const view = await getArticleView(passageId).catch(() => null)
  if (!view || view.segments.length === 0) notFound()

  // Every article has exactly one canonical URL — its first segment's id.
  // Redirect any other segment id in this article to that canonical URL.
  const canonicalId = view.segments[0].id
  if (passageId !== canonicalId) redirect(`/du/article/${canonicalId}`)

  return (
    <ArticleClient
      baseTitle={view.baseTitle}
      sourceOrigin={view.sourceOrigin}
      sourceBook={view.sourceBook}
      volume={view.volume}
      theme={view.theme}
      segments={view.segments}
      author={view.author}
      article={view.article}
    />
  )
}
