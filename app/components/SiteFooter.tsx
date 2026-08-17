import styles from './SiteFooter.module.css'

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <p className={styles.copy}>
        © 2026 小庄 · Powered By <a href="https://air7.fun" className={styles.link}>Air7.fun</a>
      </p>
    </footer>
  )
}
