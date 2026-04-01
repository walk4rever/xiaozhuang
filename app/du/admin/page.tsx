import type { Metadata } from 'next'
import DuAdminClient from './du-admin-client'

export const metadata: Metadata = {
  title: '慢读管理 — 小庄',
  robots: { index: false },
}

export default function DuAdminPage() {
  return <DuAdminClient />
}
