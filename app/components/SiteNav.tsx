'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './SiteNav.module.css'

const NAV_LINKS = [
  { href: '/gua', label: '问心' },
  { href: '/xun', label: '寻章' },
  { href: '/du', label: '慢读' },
  { href: '/xie', label: '述怀' },
]

export function SiteNav() {
  const pathname = usePathname()

  return (
    <nav className={styles.nav} aria-label="站点导航">
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          <img src="/favicon.svg" alt="" width={28} height={28} className={styles.brandSeal} />
          小庄
        </Link>
        <ul className={styles.links}>
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`)
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={styles.link}
                  data-active={isActive || undefined}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}
