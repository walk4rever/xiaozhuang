import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '小庄 — 照见中文之大美！',
  description: '借古人的话，说今天的心。无论是寻章见意、问心解惑，还是述怀达情、慢读修身，小庄都在这里，助你找回中文之美的力量。',
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
