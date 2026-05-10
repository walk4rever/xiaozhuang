import Link from 'next/link'
import styles from './page.module.css'
import { StarMap } from './du/library/StarMap'
import { getLibraryVolumes, getStarMapAuthors, type VolumeInfo } from '@/lib/du-server'

export const dynamic = 'force-dynamic'

const features = [
  {
    href: '/xun',
    icon: '寻',
    title: '寻章',
    desc: '描述一个场景，或上传一张照片，帮你找到最贴切的那句话',
    ready: true,
    emphasis: '见意',
  },
  {
    href: '/gua',
    icon: '心',
    title: '问心',
    desc: '当你想不明白时，以周易智慧回应此刻的困惑',
    ready: true,
    emphasis: '解惑',
  },
  {
    href: '/xie',
    icon: '怀',
    title: '述怀',
    desc: '借古人的笔意，替你把心里的话写出来',
    ready: true,
    emphasis: '达情',
  },
  {
    href: '/du',
    icon: '读',
    title: '慢读',
    desc: '订阅每日古文慢读邮件，每天一封，慢慢读懂一段经典',
    ready: true,
    emphasis: '修身',
  },
]

const VOLUME_CHINESE: Record<number, string> = {
  1: '一', 2: '二', 3: '三', 4: '四', 5: '五',
  6: '六', 7: '七', 8: '八', 9: '九', 10: '十',
  11: '十一', 12: '十二', 13: '十三', 14: '十四', 15: '十五',
  16: '十六', 17: '十七', 18: '十八', 19: '十九', 20: '二十',
  21: '二十一', 22: '二十二', 23: '二十三', 24: '二十四', 25: '二十五', 26: '二十六',
}

const VOLUME_GROUPS = [
  { name: '著述门', range: [1, 9] as const, categories: '论著、词赋、序跋' },
  { name: '告语门', range: [10, 16] as const, categories: '诏令、奏议、书牍、哀祭' },
  { name: '记载门', range: [17, 26] as const, categories: '传志、叙记、典志、杂记' },
]

export default async function Home() {
  const [authors, volumes] = await Promise.all([
    getStarMapAuthors().catch(() => []),
    getLibraryVolumes().catch(() => [] as VolumeInfo[]),
  ])

  return (
    <div className={`app ${styles.homeApp}`}>
      <header className={`hero ${styles.homeHero}`}>
        <div className={styles.mistLayer} aria-hidden="true" />
        <div className={styles.mountainLayer} aria-hidden="true" />
        <div className={styles.seal}>庄</div>
        <div className={`hero-text ${styles.homeText}`}>
          <p className={styles.subtitle}>表达 · 照见 · 中文之美</p>
          <h1 className={styles.title}>小庄</h1>
          <p className={styles.description}>
            无论是寻章见意、问心解惑，还是述怀达情、慢读修身，小庄都在这里，助你找回中文之美的力量。
          </p>
          <p className={styles.heroQuote}>天地有大美而不言 —— 庄子</p>
        </div>
      </header>

      <section className={styles.grid}>
        {features.map((f) => (
          <Link
            key={f.title}
            href={f.ready ? f.href : '#'}
            className={`${styles.card} ${!f.ready ? styles.cardDisabled : ''}`}
          >
            <span className={styles.cardIcon}>{f.icon}</span>
            <div>
              <h2 className={styles.cardTitle}>
                {f.title}
                {f.emphasis && <span className={styles.emphasis}>{f.emphasis}</span>}
                {!f.ready && <span className={styles.badge}>即将推出</span>}
              </h2>
              <p className={styles.cardDesc}>{f.desc}</p>
            </div>
          </Link>
        ))}
      </section>

      <section className={styles.starMapSection}>
        <StarMap authors={authors} />
      </section>

      <section className={styles.duSection}>
        <h2>《经史百家杂钞》 · 曾国藩</h2>
        <p className={styles.duIntro}>
          《经史百家杂钞》是曾国藩历时数年亲手编选的古文读本，从经、史、子、集四部广泛选材，汇集百家，取精去芜。
          他在军务繁忙之际仍坚持选编，正因相信：读古文是一种修身的功夫，而非单纯积累知识。
        </p>
        <div className={styles.duCriteria}>
          <div className={styles.duCriterion}>
            <span className={styles.duLabel}>选文标准</span>
            <span className={styles.duValue}><strong>义理</strong>（思想正）· <strong>考据</strong>（事实准）· <strong>词章</strong>（文字美）</span>
          </div>
          <div className={styles.duCriterion}>
            <span className={styles.duLabel}>编纂总纲</span>
            <span className={styles.duValue}><strong>文以载道、经世致用</strong> — 古文不是摆设，是用来解决真实问题的</span>
          </div>
          <div className={styles.duCriterion}>
            <span className={styles.duLabel}>十一文体</span>
            <span className={styles.duValue}>论著 · 序跋 · 诏令 · 奏议 · 书牍 · 哀祭 · 传志 · 叙记 · 词赋 · 典志 · 杂记</span>
          </div>
        </div>
        <p className={styles.duWhy}>
          如果你想读古文但不知从哪里下手，这本书是一个诚实的答案——这是一个真正用古文做事的人，替你筛过的书单。
        </p>
        {volumes.length > 0 && (
          <div className={styles.duCatalog}>
            <h3 className={styles.duCatalogTitle}>
              三门 / 十一类
              <span className={styles.duLibraryTotal}>{volumes.reduce((s, v) => s + v.count, 0)} 条</span>
            </h3>
            <ul className={styles.duGroupList}>
              {VOLUME_GROUPS.map((group) => {
                const groupVolumes = volumes.filter((v) => v.volume >= group.range[0] && v.volume <= group.range[1])
                if (groupVolumes.length === 0) return null
                return (
                  <li key={group.name} className={styles.duGroupItem}>
                    <p className={styles.duGroupHeader}>
                      <strong>{group.name}</strong>（卷{VOLUME_CHINESE[group.range[0]]} - 卷{VOLUME_CHINESE[group.range[1]]}）：{group.categories}
                    </p>
                    <div className={styles.duVolumeLinks}>
                      {groupVolumes.map((v) => (
                        <Link key={v.volume} href={`/du/library/${v.volume}`} className={styles.duVolumeLink}>
                          卷{VOLUME_CHINESE[v.volume] ?? v.volume} · {v.theme}
                        </Link>
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </section>

      <footer className={styles.footer}>
        <p className={styles.footerBrand}>小庄</p>
        <p className={styles.footerTagline}>借古人的话，说今天的心</p>
        <p className={styles.footerCopy}>© 2026 小庄 · <a href="https://xz.air7.fun" className={styles.footerLink}>xz.air7.fun</a></p>
      </footer>
    </div>
  )
}
