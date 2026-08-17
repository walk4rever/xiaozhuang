import Link from 'next/link'
import styles from './page.module.css'
import { StarMap } from './du/library/StarMap'
import { ModuleShowcase } from './components/ModuleShowcase'
import { getLibraryVolumes, getStarMapAuthors, type VolumeInfo } from '@/lib/du-server'

// 曾用 force-dynamic（见 7ce6d85）：静态生成会让新播种的卷（如 data/library-progress.md
// 记录的内容脚本）在下次构建前一直不可见。卷目录/作者统计是周级变化，用 revalidate
// 而非 force-dynamic 既能定期看到新内容，也不必每次请求都打两次 Supabase。
export const revalidate = 3600

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
      <ModuleShowcase />

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
    </div>
  )
}
