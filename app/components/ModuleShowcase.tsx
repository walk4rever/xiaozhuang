'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import styles from './ModuleShowcase.module.css'

const ROTATE_MS = 4500
const FADE_MS = 260

// 完全照搬各模块页面自己 hero 的内容（seal 字符、subtitle、description、quote），
// 一字不改。du 和 xie 的 hero 本来就没有 quote 段落，所以这两条 quote 留空——
// 不替它们编一条，没有的东西就是没有。
const MODULE_CARDS = [
  {
    href: '/gua',
    icon: '心',
    subtitle: '静心 · 观变 · 明行',
    title: '问心',
    desc: '以阴阳为镜，照见内心之事。起卦前请平静情绪，想清楚所求，默念三遍即可。',
    quote: '山高月小，水落石出',
    gradient: 'linear-gradient(145deg, #8b4a3c, #a55d4e)',
  },
  {
    href: '/xun',
    icon: '章',
    subtitle: '观景 · 体情 · 寻意',
    title: '寻章',
    desc: '描述你看到的、感受到的，小庄从千年诗文中，帮你找到最贴切的那句话。',
    quote: '一峰则太华千寻，一勺则江湖万里',
    gradient: 'linear-gradient(145deg, #5f7c77, #77908a)',
  },
  {
    href: '/du',
    icon: '读',
    subtitle: '日读 · 慢研 · 养成',
    title: '慢读',
    desc: '每天一封《经史百家杂钞》节选，不求一下读完，只求慢慢读懂：一点原文，一点解释，一点照见今天的意味。',
    quote: null,
    gradient: 'linear-gradient(145deg, #8b4a3c, #a55d4e)',
  },
  {
    href: '/xie',
    icon: '怀',
    subtitle: '立诚 · 明心 · 见行',
    title: '述怀',
    desc: '从楚辞、道家、史传、词、禅语、唐宋古文、骈文、心学八种传统中随机取法，指定人物语感，写成古典短章。',
    quote: null,
    gradient: 'linear-gradient(145deg, #8b4a3c, #a55d4e)',
  },
]

export function ModuleShowcase() {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const pausedRef = useRef(false)

  const goTo = (next: number) => {
    setVisible(false)
    setTimeout(() => {
      setIndex(next)
      setVisible(true)
    }, FADE_MS)
  }

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    const id = setInterval(() => {
      if (pausedRef.current) return
      goTo((index + 1) % MODULE_CARDS.length)
    }, ROTATE_MS)
    return () => clearInterval(id)
  }, [index])

  const item = MODULE_CARDS[index]

  return (
    <div className={styles.showcase}>
      <Link
        href={item.href}
        className={styles.card}
        data-visible={visible || undefined}
        onMouseEnter={() => { pausedRef.current = true }}
        onMouseLeave={() => { pausedRef.current = false }}
        onFocus={() => { pausedRef.current = true }}
        onBlur={() => { pausedRef.current = false }}
      >
        <span className={styles.icon} style={{ background: item.gradient }} aria-hidden="true">
          {item.icon}
        </span>
        <div>
          <p className={styles.subtitle}>{item.subtitle}</p>
          <h1 className={styles.title}>{item.title}</h1>
          <p className={styles.desc}>{item.desc}</p>
          {item.quote && <p className={styles.quote}>{item.quote}</p>}
        </div>
      </Link>
      <div className={styles.dots} role="tablist" aria-label="切换展示的模块">
        {MODULE_CARDS.map((m, i) => (
          <button
            key={m.href}
            type="button"
            className={styles.dot}
            data-active={i === index || undefined}
            role="tab"
            aria-selected={i === index}
            aria-label={`查看${m.title}`}
            onClick={() => { pausedRef.current = false; goTo(i) }}
          />
        ))}
      </div>
    </div>
  )
}
