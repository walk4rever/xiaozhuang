import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '小庄 — 照见中文之大美！',
  description: '一个面向现代情绪与表达场景的中文灵感产品，帮你借古人的话，说今天的心。',
  icons: '/favicon.svg',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-Hans">
      <body>{children}</body>
    </html>
  )
}
