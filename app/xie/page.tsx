import type { Metadata } from 'next'
import XieClient from './xie-client'

export const metadata: Metadata = {
  title: '述怀 — 小庄',
  description: '在老庄、骈文、唐宋古文与阳明文哲之间随机取法，写出文哲具佳短章。',
}

export default function XiePage() {
  return <XieClient />
}
