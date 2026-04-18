import type { Metadata } from 'next'
import PassageEditorClient from './passage-editor-client'

export const metadata: Metadata = {
  title: '编辑段落 — 小庄',
  robots: { index: false },
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function PassageEditorPage({ params }: Props) {
  const { id } = await params
  const passageId = parseInt(id, 10)
  return <PassageEditorClient id={passageId} />
}
