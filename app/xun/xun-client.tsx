'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type ParsedResult = {
  quote: string
  source: string
  interpretation: string
  resonance: string
}

type ImageAsset = {
  dataUrl: string
  mimeType: string
  width: number
  height: number
  sizeBytes: number
}

type ShareTemplate = 'photo' | 'quote'

const SHARE_ICON_PATH =
  'M15 8a3 3 0 1 0-2.83-4H12a3 3 0 0 0 .17 1l-5.1 2.9a3 3 0 0 0-4.24 2.8 3 3 0 0 0 .06.6l5.05 2.87A3 3 0 0 0 8 15a3 3 0 1 0 .17-1l-5.1-2.9a3 3 0 0 0 0-1.2l5.1-2.9A3 3 0 1 0 15 8Z'

const SYSTEM_PROMPT = `你是"小庄"，一位深谙中国古典诗词与古文的文化伙伴。用户会通过两种方式向你提供线索：
1. 文字描述一个场景、一种情绪、或一个画面
2. 上传一张照片，有时会再补充一句主观感受

你的任务是：先准确理解用户此刻的场景、氛围与情绪，再从中国古典诗词、古文名篇中找到最贴切、最美的一句（或几句），并解释为什么这句话与用户的此刻最为契合。

如果用户上传了图片，请优先依据图片内容理解场景，同时结合用户补充的文字。不要机械罗列图像内容，要抓住画面的情绪、光线、时节、关系感、距离感与气氛。

输出要求：请只输出一个 JSON 对象，不要输出 Markdown，不要输出代码块。JSON 结构必须严格如下：
{
  "quote": "原文引用（诗句或古文原文）",
  "source": "出处（作者、篇名、朝代）",
  "interpretation": "白话解读：这句话是什么意思，写作背景是什么，妙在哪里（3-5句）",
  "resonance": "共鸣连接：为什么这句话与用户描述的场景/情绪或上传的照片最为契合，它如何照见此刻的心境（2-3句）"
}

选句原则：
1. 优先选意境贴合、情感共鸣强的句子，而非最有名的句子
2. 诗词、古文、辞赋均可，不限于唐诗宋词
3. 白话解读要深入浅出，让不懂古文的人也能感受到美
4. 共鸣连接要具体，不要泛泛而谈`

const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const MAX_IMAGE_EDGE = 1600
const MIN_IMAGE_EDGE = 14
const INITIAL_JPEG_QUALITY = 0.88
const MIN_JPEG_QUALITY = 0.56
const SHARE_CARD_WIDTH = 1080
const SHARE_CARD_HEIGHT = 1440

const extractJsonBlock = (text: string) => {
  const trimmed = text.trim()
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) return fencedMatch[1].trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return trimmed.slice(start, end + 1)
}

const parseResult = (text: string): ParsedResult | null => {
  const json = extractJsonBlock(text)
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as ParsedResult
    if (parsed.quote && parsed.source) return parsed
    return null
  } catch {
    return null
  }
}

type SseEvent =
  | { type: 'delta'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

const parseSseLine = (line: string): string | null => {
  if (!line.startsWith('data:')) return null
  const data = line.slice(5).trim()
  if (!data || data === '[DONE]') return null
  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
    }
    return parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}

const parseStreamEvent = (eventName: string, data: string): SseEvent | null => {
  if (!data) return null
  if (eventName === 'delta') {
    try {
      const content = JSON.parse(data) as string
      return typeof content === 'string' ? { type: 'delta', content } : null
    } catch {
      return null
    }
  }
  if (eventName === 'done') return { type: 'done' }
  if (eventName === 'error') {
    try {
      const payload = JSON.parse(data) as { error?: string }
      return { type: 'error', message: payload.error ?? 'stream_error' }
    } catch {
      return { type: 'error', message: 'stream_error' }
    }
  }
  return null
}

const readErrorMessage = async (response: Response) => {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      const payload = (await response.json()) as { error?: string; message?: string }
      return payload.error ?? payload.message ?? `${response.status} 请求失败`
    } catch {
      return `${response.status} 请求失败`
    }
  }

  const text = await response.text()
  return text.trim() || `${response.status} 请求失败`
}

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('图片读取失败，请重试。'))
    }
    reader.onerror = () => reject(new Error('图片读取失败，请重试。'))
    reader.readAsDataURL(file)
  })

const blobToDataUrl = (blob: Blob) =>
  fileToDataUrl(new File([blob], 'upload.jpg', { type: blob.type || 'image/jpeg' }))

const loadImage = (dataUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片无法解析，请换一张试试。'))
    img.src = dataUrl
  })

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('图片处理失败，请重试。'))
    }, 'image/jpeg', quality)
  })

const optimizeImage = async (file: File): Promise<ImageAsset> => {
  if (!file.type.startsWith('image/')) {
    throw new Error('只能上传图片文件。')
  }

  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error('原图太大了，请换一张 12MB 以内的图片。')
  }

  const dataUrl = await fileToDataUrl(file)
  const img = await loadImage(dataUrl)

  if (img.width < MIN_IMAGE_EDGE || img.height < MIN_IMAGE_EDGE) {
    throw new Error('图片太小了，请换一张更清晰的图片。')
  }

  const ratio = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height))
  const width = Math.max(MIN_IMAGE_EDGE, Math.round(img.width * ratio))
  const height = Math.max(MIN_IMAGE_EDGE, Math.round(img.height * ratio))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('图片处理失败，请重试。')

  ctx.fillStyle = '#f7f3ec'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  let quality = INITIAL_JPEG_QUALITY
  let blob = await canvasToBlob(canvas, quality)

  while (blob.size > MAX_IMAGE_BYTES && quality > MIN_JPEG_QUALITY) {
    quality = Math.max(MIN_JPEG_QUALITY, quality - 0.08)
    blob = await canvasToBlob(canvas, quality)
  }

  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error('图片太大了，请换一张更小的图片。')
  }

  const optimizedDataUrl = await blobToDataUrl(blob)

  return {
    dataUrl: optimizedDataUrl,
    mimeType: 'image/jpeg',
    width,
    height,
    sizeBytes: blob.size,
  }
}

const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
) => {
  const chars = Array.from(text)
  const lines: string[] = []
  let current = ''

  for (const char of chars) {
    const next = current + char
    if (ctx.measureText(next).width <= maxWidth) {
      current = next
      continue
    }
    if (current) lines.push(current)
    current = char
    if (lines.length >= maxLines) break
  }

  if (lines.length < maxLines && current) lines.push(current)

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines)
  }

  if (lines.length === maxLines && chars.join('') !== lines.join('')) {
    const last = lines[maxLines - 1] ?? ''
    lines[maxLines - 1] = last.slice(0, Math.max(0, last.length - 1)) + '…'
  }

  return lines
}

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

const generateShareCard = async (
  result: ParsedResult,
  image: ImageAsset | null,
  template: ShareTemplate
) => {
  const canvas = document.createElement('canvas')
  canvas.width = SHARE_CARD_WIDTH
  canvas.height = SHARE_CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('分享图生成失败，请重试。')

  const w = canvas.width
  const h = canvas.height
  const usePhotoTemplate = template === 'photo' && Boolean(image)

  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#faf6ef')
  bg.addColorStop(0.55, '#f3ede4')
  bg.addColorStop(1, '#ebe4d8')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  const paperGlow = ctx.createRadialGradient(w * 0.18, h * 0.1, 10, w * 0.18, h * 0.1, 340)
  paperGlow.addColorStop(0, 'rgba(255,255,255,0.92)')
  paperGlow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = paperGlow
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = 'rgba(95, 124, 119, 0.06)'
  ctx.beginPath()
  ctx.ellipse(w * 0.14, h * 0.82, 250, 108, -0.06, 0, Math.PI * 2)
  ctx.ellipse(w * 0.46, h * 0.86, 320, 104, 0.02, 0, Math.PI * 2)
  ctx.ellipse(w * 0.8, h * 0.83, 270, 96, 0.09, 0, Math.PI * 2)
  ctx.fill()

  drawRoundedRect(ctx, 52, 52, w - 104, h - 104, 44)
  ctx.fillStyle = 'rgba(252, 249, 244, 0.62)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(122, 104, 86, 0.1)'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = 'rgba(139, 74, 60, 0.08)'
  ctx.fillRect(86, 88, 6, h - 176)

  ctx.fillStyle = '#8b4a3c'
  drawRoundedRect(ctx, 100, 96, 110, 110, 26)
  ctx.fill()
  ctx.fillStyle = '#f6efe5'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '72px "Ma Shan Zheng", serif'
  ctx.fillText('庄', 155, 150)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#6f7f7a'
  ctx.font = '400 24px "Noto Serif SC", serif'
  ctx.fillText(usePhotoTemplate ? '小庄 · 照片寻句' : '小庄 · 纯诗句雅版', 244, 106)
  ctx.fillStyle = '#8d7761'
  ctx.font = '400 20px "Noto Serif SC", serif'
  ctx.fillText('借古人的话，说今天的心', 244, 144)

  let currentY = usePhotoTemplate ? 248 : 226

  if (usePhotoTemplate && image) {
    const photo = await loadImage(image.dataUrl)
    const frameX = 98
    const frameY = currentY
    const frameW = w - 196
    const frameH = 516

    ctx.fillStyle = 'rgba(255,255,255,0.74)'
    drawRoundedRect(ctx, frameX - 12, frameY - 12, frameW + 24, frameH + 24, 44)
    ctx.fill()

    ctx.save()
    drawRoundedRect(ctx, frameX, frameY, frameW, frameH, 34)
    ctx.clip()

    const scale = Math.max(frameW / photo.width, frameH / photo.height)
    const drawW = photo.width * scale
    const drawH = photo.height * scale
    const drawX = frameX + (frameW - drawW) / 2
    const drawY = frameY + (frameH - drawH) / 2
    ctx.drawImage(photo, drawX, drawY, drawW, drawH)

    const photoFade = ctx.createLinearGradient(0, frameY + frameH * 0.58, 0, frameY + frameH)
    photoFade.addColorStop(0, 'rgba(36,31,27,0)')
    photoFade.addColorStop(1, 'rgba(36,31,27,0.16)')
    ctx.fillStyle = photoFade
    ctx.fillRect(frameX, frameY, frameW, frameH)
    ctx.restore()

    ctx.strokeStyle = 'rgba(122, 104, 86, 0.16)'
    ctx.lineWidth = 2
    drawRoundedRect(ctx, frameX, frameY, frameW, frameH, 34)
    ctx.stroke()

    currentY = frameY + frameH + 58
  }

  const textCardX = 98
  const textCardY = currentY
  const textCardW = w - 196
  const textCardH = usePhotoTemplate ? 430 : 760

  drawRoundedRect(ctx, textCardX, textCardY, textCardW, textCardH, 32)
  ctx.fillStyle = 'rgba(255, 252, 247, 0.84)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(122, 104, 86, 0.14)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  if (!usePhotoTemplate) {
    const innerMist = ctx.createRadialGradient(textCardX + 140, textCardY + 120, 10, textCardX + 140, textCardY + 120, 220)
    innerMist.addColorStop(0, 'rgba(255,255,255,0.7)')
    innerMist.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = innerMist
    drawRoundedRect(ctx, textCardX, textCardY, textCardW, textCardH, 32)
    ctx.fill()

    ctx.fillStyle = 'rgba(95, 124, 119, 0.08)'
    ctx.beginPath()
    ctx.ellipse(textCardX + 170, textCardY + textCardH - 88, 140, 54, -0.05, 0, Math.PI * 2)
    ctx.ellipse(textCardX + 420, textCardY + textCardH - 72, 190, 60, 0.02, 0, Math.PI * 2)
    ctx.ellipse(textCardX + 710, textCardY + textCardH - 90, 150, 56, 0.08, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = '#241f1b'
  ctx.font = usePhotoTemplate ? '700 58px "Noto Serif SC", serif' : '700 66px "Noto Serif SC", serif'
  const quoteLines = wrapText(ctx, result.quote, textCardW - 112, usePhotoTemplate ? 4 : 7)
  let quoteY = textCardY + (usePhotoTemplate ? 58 : 92)
  for (const line of quoteLines) {
    ctx.fillText(line, textCardX + 56, quoteY)
    quoteY += 80
  }

  ctx.fillStyle = '#8d7761'
  ctx.fillRect(textCardX + 56, quoteY + 12, 120, 2)
  quoteY += 34

  ctx.fillStyle = '#746d64'
  ctx.font = '400 28px "Noto Serif SC", serif'
  ctx.fillText(`—— ${result.source}`, textCardX + 56, quoteY)
  quoteY += 72

  ctx.fillStyle = '#4f4842'
  ctx.font = usePhotoTemplate ? '400 28px "Noto Serif SC", serif' : '400 30px "Noto Serif SC", serif'
  const resonanceLines = wrapText(ctx, result.resonance, textCardW - 112, usePhotoTemplate ? 4 : 8)
  for (const line of resonanceLines) {
    ctx.fillText(line, textCardX + 56, quoteY)
    quoteY += usePhotoTemplate ? 44 : 48
  }

  if (!usePhotoTemplate) {
    quoteY += 20
    ctx.fillStyle = '#8d7761'
    ctx.font = '400 22px "Noto Serif SC", serif'
    ctx.fillText('雅版仅保留诗句、出处与共鸣，更适合单独发圈。', textCardX + 56, quoteY)
  }

  ctx.fillStyle = '#6f7f7a'
  ctx.font = '400 22px "Noto Serif SC", serif'
  ctx.fillText('适合保存到相册后分享到朋友圈', 100, h - 110)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#8b4a3c'
  ctx.font = '400 30px "Ma Shan Zheng", serif'
  ctx.fillText('题于小庄', w - 96, h - 118)

  const blob = await canvasToBlob(canvas, 0.92)
  return blob
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function requestXun(
  input: string,
  image: ImageAsset | null,
  onChunk?: (text: string) => void
): Promise<string> {
  const hasImage = Boolean(image)
  const userText = input.trim()
  const imageInstruction = hasImage
    ? userText
      ? `请先看这张照片，再结合我的补充感受来寻句：${userText}`
      : '请先认真看这张照片的场景、氛围与情绪，再为它寻一句最贴切的古典诗文。'
    : userText

  const userMessage = hasImage
    ? {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: imageInstruction },
          {
            type: 'image_url' as const,
            image_url: {
              url: image!.dataUrl,
            },
          },
        ],
      }
    : {
        role: 'user' as const,
        content: userText,
      }

  const response = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        userMessage,
      ],
      temperature: 0.8,
      max_tokens: 768,
      stream: true,
    }),
  })

  if (!response.ok) {
    const errorMessage = await readErrorMessage(response)
    throw new Error(errorMessage)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = payload.choices?.[0]?.message?.content ?? ''
    onChunk?.(content)
    return content
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('stream_unavailable')

  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let content = ''
  let currentEvent = ''

  while (true) {
    const { value, done } = await reader.read()
    if (value) {
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) {
          currentEvent = ''
          continue
        }
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim()
          continue
        }
        if (line.startsWith('data:')) {
          if (!currentEvent) {
            const delta = parseSseLine(line)
            if (delta) {
              content += delta
              onChunk?.(content)
            }
            continue
          }
          const evt = parseStreamEvent(currentEvent, line.slice(5).trim())
          if (!evt) continue
          if (evt.type === 'delta') {
            content += evt.content
            onChunk?.(content)
          } else if (evt.type === 'error') {
            throw new Error(evt.message)
          } else if (evt.type === 'done') {
            return content
          }
        }
      }
    }
    if (done) break
  }

  return content
}

export default function XunClient() {
  const [input, setInput] = useState('')
  const [rawOutput, setRawOutput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isPreparingImage, setIsPreparingImage] = useState(false)
  const [isGeneratingShare, setIsGeneratingShare] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [image, setImage] = useState<ImageAsset | null>(null)
  const [shareBlob, setShareBlob] = useState<Blob | null>(null)
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const requestIdRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const parsed = rawOutput ? parseResult(rawOutput) : null
  const isStreaming = isLoading && rawOutput.length > 0
  const canSubmit = Boolean(input.trim() || image)
  const shareTemplate: ShareTemplate = image ? 'photo' : 'quote'

  useEffect(() => {
    return () => {
      if (shareImageUrl) URL.revokeObjectURL(shareImageUrl)
    }
  }, [shareImageUrl])

  useEffect(() => {
    if (!isShareOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsShareOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isShareOpen])

  const resetShareCard = () => {
    if (shareImageUrl) URL.revokeObjectURL(shareImageUrl)
    setShareImageUrl(null)
    setShareBlob(null)
    setIsShareOpen(false)
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)
    setIsPreparingImage(true)
    resetShareCard()
    try {
      const optimized = await optimizeImage(file)
      setImage(optimized)
    } catch (err) {
      setImage(null)
      setError(err instanceof Error ? err.message : '图片处理失败，请重试。')
    } finally {
      setIsPreparingImage(false)
      event.target.value = ''
    }
  }

  const clearImage = () => {
    setImage(null)
    resetShareCard()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async () => {
    if (!canSubmit || isLoading || isPreparingImage) return
    requestIdRef.current += 1
    const reqId = requestIdRef.current

    setIsLoading(true)
    setRawOutput('')
    setError(null)
    resetShareCard()

    try {
      await requestXun(input.trim(), image, (partial) => {
        if (reqId === requestIdRef.current) setRawOutput(partial)
      })
    } catch (err) {
      if (reqId === requestIdRef.current) {
        setError(err instanceof Error ? err.message : '寻句失败，请稍后再试')
      }
    } finally {
      if (reqId === requestIdRef.current) setIsLoading(false)
    }
  }

  const buildShareCard = async () => {
    if (!parsed) return null
    setIsGeneratingShare(true)
    setError(null)
    try {
      const blob = await generateShareCard(parsed, image, shareTemplate)
      const url = URL.createObjectURL(blob)
      if (shareImageUrl) URL.revokeObjectURL(shareImageUrl)
      setShareBlob(blob)
      setShareImageUrl(url)
      return blob
    } catch (err) {
      setError(err instanceof Error ? err.message : '分享图生成失败，请稍后再试。')
      return null
    } finally {
      setIsGeneratingShare(false)
    }
  }

  const handleOpenShare = async () => {
    const blob = shareBlob ?? (await buildShareCard())
    if (!blob) return
    setIsShareOpen(true)
  }

  const handleSaveShareImage = async () => {
    const blob = shareBlob ?? (await buildShareCard())
    if (!blob) return
    downloadBlob(blob, 'xiaozhuang-share.jpg')
  }

  const handleCloseShare = () => {
    setIsShareOpen(false)
  }

  return (
    <div className="app xun-app">
      <header className="hero xun-hero">
        <div className="xun-mist-layer" aria-hidden="true" />
        <div className="xun-mountain-layer" aria-hidden="true" />
        <div className="seal">句</div>
        <div className="hero-text">
          <Link href="/" className="back-link">← 小庄</Link>
          <p className="subtitle">观景 · 体情 · 寻意</p>
          <h1>寻句</h1>
          <p className="description">
            描述你看到的、感受到的，或直接上传一张照片，小庄从千年诗文中，帮你找到最贴切的那句话。
          </p>
          <p className="xun-hero-quote">一峰则太华千寻，一勺则江湖万里</p>
        </div>
      </header>

      <section className="panel xun-input-panel">
        <div className="xun-upload-row">
          <button
            type="button"
            className="xun-upload-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isPreparingImage}
          >
            {isPreparingImage ? '图片处理中…' : image ? '重新选择照片' : '拍照 / 上传照片'}
          </button>
          <input
            ref={fileInputRef}
            className="xun-file-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
          />
        </div>

        {image ? (
          <div className="xun-image-preview-wrap">
            <img src={image.dataUrl} alt="待寻句照片" className="xun-image-preview" />
            <div className="xun-image-meta">
              <span>
                已预处理 · JPEG · {image.width}×{image.height} · {(image.sizeBytes / 1024 / 1024).toFixed(2)} MB
              </span>
              <button type="button" className="xun-clear-image" onClick={clearImage}>
                移除
              </button>
            </div>
          </div>
        ) : (
          <div className="xun-upload-hint">
            上传后会自动做格式规范化、尺寸约束与体积压缩。你也可以再补一句感受，比如“这张图让我想到离别”。
          </div>
        )}

        <textarea
          className="xun-textarea"
          placeholder="比如：秋天傍晚，满地银杏叶，金色的光洒在路上…… 也可以只上传照片。"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
        />
        <button
          className="xun-button"
          onClick={handleSubmit}
          disabled={isLoading || isPreparingImage || !canSubmit}
        >
          {isPreparingImage
            ? '图片处理中…'
            : isLoading
              ? image
                ? '看图寻句中…'
                : '寻句中…'
              : image
                ? '为这张照片找一句'
                : '帮我找那句话'}
        </button>
      </section>

      {error && (
        <section className="panel xun-result">
          <p className="xun-error">{error}</p>
        </section>
      )}

      {isStreaming && !parsed && (
        <section className="panel xun-result">
          <p className="xun-streaming">{image ? '小庄正在看图寻句……' : '寻句中，古人正在翻书……'}</p>
        </section>
      )}

      {parsed && (
        <section className="panel xun-result">
          <div className="xun-result-toolbar">
            <span className="xun-result-tag">{image ? '看图寻句' : '文字寻句'}</span>
          </div>
          <div className="xun-quote-block">
            <p className="quote-text">{parsed.quote}</p>
            <p className="quote-source">—— {parsed.source}</p>
          </div>
          <div className="section">
            <h4>📖 白话解读</h4>
            <p>{parsed.interpretation}</p>
          </div>
          <div className="section">
            <h4>💫 为何是这句</h4>
            <p>{parsed.resonance}</p>
          </div>

          <button
            type="button"
            className="xun-share-icon-button xun-share-icon-button-floating"
            onClick={handleOpenShare}
            disabled={isGeneratingShare}
            aria-label="生成高质量分享图片"
            title="生成分享图片"
          >
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <path d={SHARE_ICON_PATH} />
            </svg>
          </button>

          {isShareOpen && shareImageUrl ? (
            <div
              className="xun-share-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="分享图片预览"
              onClick={handleCloseShare}
            >
              <div className="xun-share-sheet-card" onClick={(event) => event.stopPropagation()}>
                <div className="xun-share-sheet-header">
                  <div>
                    <h4>生成好的图片</h4>
                    <p>可直接保存，用于朋友圈或相册分享。</p>
                  </div>
                  <button type="button" className="xun-share-close" onClick={handleCloseShare} aria-label="关闭分享预览">
                    ×
                  </button>
                </div>
                <div className="xun-share-sheet-preview">
                  <img src={shareImageUrl} alt="高质量分享图片预览" className="xun-share-sheet-image" />
                </div>
                <div className="xun-share-sheet-actions">
                  <button type="button" className="xun-secondary-button xun-secondary-button-accent" onClick={handleSaveShareImage}>
                    保存图片
                  </button>
                  <button type="button" className="xun-secondary-button" onClick={handleCloseShare}>
                    关闭
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      )}
    </div>
  )
}
