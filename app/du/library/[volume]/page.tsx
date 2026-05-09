import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getVolumePassages, getLibraryVolumes } from '@/lib/du-server'

export const dynamic = 'force-dynamic'

const VOLUME_CHINESE: Record<number, string> = {
  1: '一', 2: '二', 3: '三', 4: '四', 5: '五',
  6: '六', 7: '七', 8: '八', 9: '九', 10: '十',
  11: '十一', 12: '十二', 13: '十三', 14: '十四', 15: '十五',
  16: '十六', 17: '十七', 18: '十八', 19: '十九', 20: '二十',
  21: '二十一', 22: '二十二', 23: '二十三', 24: '二十四', 25: '二十五', 26: '二十六',
}

interface Props {
  params: Promise<{ volume: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { volume: raw } = await params
  const vol = parseInt(raw, 10)
  const volumes = await getLibraryVolumes().catch(() => [])
  const info = volumes.find((v) => v.volume === vol)
  const label = info ? `卷${VOLUME_CHINESE[vol] ?? vol} · ${info.theme}` : `卷${raw}`
  return { title: `${label} — 书库 — 小庄` }
}

export default async function VolumePage({ params }: Props) {
  const { volume: raw } = await params
  const vol = parseInt(raw, 10)
  if (isNaN(vol)) notFound()

  const [articles, volumes] = await Promise.all([
    getVolumePassages(vol).catch(() => null),
    getLibraryVolumes().catch(() => []),
  ])

  if (!articles || articles.length === 0) notFound()

  const info = volumes.find((v) => v.volume === vol)
  const label = info ? `卷${VOLUME_CHINESE[vol] ?? vol} · ${info.theme}` : `卷${vol}`

  const grouped = articles.reduce<Record<string, typeof articles>>((acc, a) => {
    const origin = a.source_origin || '佚名'
    if (!acc[origin]) acc[origin] = []
    acc[origin].push(a)
    return acc
  }, {})

  return (
    <div className="app du-app">
      <header className="hero du-hero">
        <div className="du-mist-layer" aria-hidden="true" />
        <div className="du-mountain-layer" aria-hidden="true" />
        <div className="seal">卷</div>
        <div className="hero-text du-hero-text">
          <Link href="/" className="back-link">← 小庄</Link>
          <p className="subtitle">{info?.source_book ?? '经史百家杂钞'}</p>
          <h1>{label}</h1>
          <p className="description">{articles.length} 篇，共 {info?.count ?? 0} 条</p>
        </div>
      </header>

      <section className="panel du-panel">
        <ul className="du-library-article-list">
          {Object.entries(grouped).map(([origin, arts]) => (
            <li key={origin} className="du-library-origin-group">
              <span className="du-library-origin-label">{origin}</span>
              <ul className="du-library-article-sublist">
                {arts.map((a) => (
                  <li key={a.first_id} className="du-library-article-item">
                    <Link href={`/du/preview/${a.first_id}`} className="du-library-article-link">
                      {a.base_title}
                    </Link>
                    {a.segment_count > 1 && (
                      <span className="du-library-segment-hint">共 {a.segment_count} 段</span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
