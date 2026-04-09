'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import zhouyi from '@/data/zhouyi.json'
import Link from 'next/link'
import { drawShareFooter, SHARE_MARGIN, SHARE_QR_SIZE, SHARE_WIDTH } from '@/lib/share-card'

type HexagramEntry = {
  id: number
  title: string
  guaCi: string
  yaoCi: string[]
  tuan: string[]
  xiang: string[]
  wenyan: string[]
}

type Line = {
  value: 6 | 7 | 8 | 9
  yin: boolean
  changing: boolean
}

type HexagramResult = {
  lines: Line[]
  number: number
  entry: HexagramEntry | null
  changedLines: Line[]
  changedNumber: number
  changedEntry: HexagramEntry | null
  interpretation: string
}

type InterpretationSection = {
  title: string
  content: string
}

type ParsedInterpretation = {
  items: InterpretationSection[]
  plain: string
}

const entries = zhouyi as HexagramEntry[]
const entryById = new Map(entries.map((e) => [e.id, e]))

const trigramByBits: Record<number, string> = {
  0b111: 'tian',
  0b110: 'ze',
  0b101: 'huo',
  0b100: 'lei',
  0b011: 'feng',
  0b010: 'shui',
  0b001: 'shan',
  0b000: 'di',
}

const hexagramOrder = [
  'tian_tian',
  'tian_ze',
  'tian_huo',
  'tian_lei',
  'tian_feng',
  'tian_shui',
  'tian_shan',
  'tian_di',
  'ze_tian',
  'ze_ze',
  'ze_huo',
  'ze_lei',
  'ze_feng',
  'ze_shui',
  'ze_shan',
  'ze_di',
  'huo_tian',
  'huo_ze',
  'huo_huo',
  'huo_lei',
  'huo_feng',
  'huo_shui',
  'huo_shan',
  'huo_di',
  'lei_tian',
  'lei_ze',
  'lei_huo',
  'lei_lei',
  'lei_feng',
  'lei_shui',
  'lei_shan',
  'lei_di',
  'feng_tian',
  'feng_ze',
  'feng_huo',
  'feng_lei',
  'feng_feng',
  'feng_shui',
  'feng_shan',
  'feng_di',
  'shui_tian',
  'shui_ze',
  'shui_huo',
  'shui_lei',
  'shui_feng',
  'shui_shui',
  'shui_shan',
  'shui_di',
  'shan_tian',
  'shan_ze',
  'shan_huo',
  'shan_lei',
  'shan_feng',
  'shan_shui',
  'shan_shan',
  'shan_di',
  'di_tian',
  'di_ze',
  'di_huo',
  'di_lei',
  'di_feng',
  'di_shui',
  'di_shan',
  'di_di',
]

const hexagramNumbers = [
  1, 10, 13, 25, 44, 6, 33, 12, 43, 58, 49, 17, 28, 47, 31, 45, 14, 38, 30,
  21, 50, 64, 56, 35, 34, 54, 55, 51, 32, 40, 62, 16, 9, 61, 37, 42, 57, 59,
  53, 20, 5, 60, 63, 3, 48, 29, 39, 8, 26, 41, 22, 27, 18, 4, 52, 23, 11, 19,
  36, 24, 46, 7, 15, 2,
]

const hexagramMap = hexagramOrder.reduce<Record<string, number>>((map, key, index) => {
  map[key] = hexagramNumbers[index]
  return map
}, {})

const buildTrigramKey = (lines: Line[]) => {
  const bits =
    (lines[2].yin ? 0 : 1) +
    (lines[1].yin ? 0 : 2) +
    (lines[0].yin ? 0 : 4)
  return trigramByBits[bits]
}

const deriveHexagram = (lines: Line[]) => {
  const lower = buildTrigramKey(lines.slice(0, 3))
  const upper = buildTrigramKey(lines.slice(3, 6))
  const key = `${upper}_${lower}`
  const number = hexagramMap[key] ?? 1
  const entry = entryById.get(number) ?? null
  return { number, entry }
}

const CACHE_API = '/api/gua/interpret'

const buildCacheKey = (baseId: number, lines: Line[]): { key: string; baseId: number; changing: number[] } => {
  const changing = lines
    .map((line, i) => (line.changing ? i + 1 : null))
    .filter((n): n is number => n !== null)
  return { key: `${baseId}_${changing.length ? changing.join(',') : '0'}`, baseId, changing }
}

const INTERPRETATION_TEMPERATURE = 0.75

const getHexagramName = (entry: HexagramEntry | null) => {
  if (!entry) return ''

  const fromGuaCi = entry.guaCi.match(/^([^，。；：\s]+)/)?.[1]?.trim()
  if (fromGuaCi) {
    return fromGuaCi.endsWith('卦') ? fromGuaCi : `${fromGuaCi}卦`
  }

  const fromTitle = entry.title
    .replace(/^《易经》\s*第[一二三四五六七八九十百千零〇0-9]+卦\s*/u, '')
    .trim()
    .split(/\s+/)[0]
    ?.trim()

  if (!fromTitle) return ''
  return fromTitle.endsWith('卦') ? fromTitle : `${fromTitle}卦`
}

const SHARE_ICON_PATH =
  'M15 8a3 3 0 1 0-2.83-4H12a3 3 0 0 0 .17 1l-5.1 2.9a3 3 0 0 0-4.24 2.8 3 3 0 0 0 .06.6l5.05 2.87A3 3 0 0 0 8 15a3 3 0 1 0 .17-1l-5.1-2.9a3 3 0 0 0 0-1.2l5.1-2.9A3 3 0 1 0 15 8Z'
const SHARE_CARD_MAX_HEIGHT = 5600

const buildInterpretationPrompt = (
  lines: Line[],
  entry: HexagramEntry | null,
  changedEntry: HexagramEntry | null
) => {
  const describeLineState = (line: Line) => {
    if (line.value === 6) return '老阴（阴爻变阳）'
    if (line.value === 7) return '少阳（阳爻不变）'
    if (line.value === 8) return '少阴（阴爻不变）'
    return '老阳（阳爻变阴）'
  }

  // 收集所有动爻，lines[0]=初爻，lines[5]=上爻
  const changingYaos = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.changing)
    .map(({ line, index }) => {
      const label =
        index === 0 ? '初爻' : index === 5 ? '上爻' : `第${index + 1}爻`
      const yaoCiText = entry?.yaoCi[index] ?? ''
      const changedState = line.yin ? '变为阳爻' : '变为阴爻'
      return `${label}：${describeLineState(line)}，${changedState}。爻辞：${yaoCiText}`
    })

  const changingYaoText = changingYaos.length
    ? changingYaos.join('\n')
    : '无动爻（静卦，以本卦卦辞为主）'

  const baseTitle = getHexagramName(entry) || '本卦'
  const changedTitle = getHexagramName(changedEntry) || '变卦'
  const baseYaoText = entry?.yaoCi?.length
    ? entry.yaoCi.map((text, index) => {
        const label =
          index === 0 ? '初爻' : index === 5 ? '上爻' : `第${index + 1}爻`
        return `${label}：${text}`
      }).join('\n')
    : '暂无爻辞'
  const changedYaoText = changedEntry?.yaoCi?.length
    ? changedEntry.yaoCi.map((text, index) => {
        const label =
          index === 0 ? '初爻' : index === 5 ? '上爻' : `第${index + 1}爻`
        return `${label}：${text}`
      }).join('\n')
    : '暂无爻辞'

  return `
【本卦】${baseTitle}
卦辞：${entry?.guaCi ?? ''}
彖辞：${entry?.tuan?.[0] ?? ''}
爻辞：
${baseYaoText}

【动爻】（共 ${changingYaos.length} 爻变动）
${changingYaoText}

【变卦】${changedTitle}
卦辞：${changedEntry?.guaCi ?? ''}
爻辞：
${changedYaoText}

请只输出一个 JSON 对象，不要输出 Markdown，不要输出代码块，不要添加任何额外说明。JSON 结构必须严格如下：
{
  "baseInterpretation": "字符串，3-5句：先通俗讲解本卦的整体象意，再结合卦辞解释其含义，最后说明当前形势的核心建议",
  "changingLinesGuidance": "字符串：逐条说明动爻。每条动爻先引用爻辞原文，再用2-3句解释含义与行动指引；若无动爻则解释静卦意义并给出守势建议",
  "changedInterpretation": "字符串，3-5句：解读变卦的整体走向，结合卦辞说明事情最终结果，给出一到两条具体可操作的建议"
}
`.trim()
}

const parseMarkdownInterpretation = (text: string): ParsedInterpretation => {
  const cleanText = text.trim()
  const parts: InterpretationSection[] = []
  const regex = /\*\*(.+?)\*\*\s*/g
  let lastIndex = 0
  let match: RegExpExecArray | null = regex.exec(cleanText)
  if (!match) {
    return {
      items: parts,
      plain: cleanText.replace(/\*\*(.+?)\*\*/g, '$1'),
    }
  }
  while (match) {
    const title = match[1].replace(/[:：]\s*$/, '').trim()
    const contentStart = regex.lastIndex
    const nextMatch = regex.exec(cleanText)
    const contentEnd = nextMatch ? nextMatch.index : cleanText.length
    const rawContent = cleanText.slice(contentStart, contentEnd).trim()
    const content = rawContent.replace(/\*\*(.+?)\*\*/g, '$1')
    parts.push({ title, content })
    lastIndex = contentEnd
    match = nextMatch
  }
  return {
    items: parts,
    plain: cleanText.slice(lastIndex).replace(/\*\*(.+?)\*\*/g, '$1').trim(),
  }
}

const extractJsonBlock = (text: string) => {
  const trimmed = text.trim()
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }
  return trimmed.slice(start, end + 1)
}

// During streaming, raw JSON arrives token-by-token. Only expose it to the UI
// once parsing succeeds; otherwise keep showing the loading placeholder so
// users never see half-built JSON.
const toDisplayInterpretation = (raw: string): string => {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return raw
  const candidate = extractJsonBlock(trimmed)
  if (!candidate) return '解读生成中...'
  try {
    JSON.parse(candidate)
    return raw
  } catch {
    return '解读生成中...'
  }
}

const parseInterpretation = (text: string): ParsedInterpretation => {
  const jsonCandidate = extractJsonBlock(text)
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate) as {
        baseInterpretation?: string
        changingLinesGuidance?: string
        changedInterpretation?: string
      }
      const items: InterpretationSection[] = [
        {
          title: '本卦解读',
          content: parsed.baseInterpretation?.trim() ?? '',
        },
        {
          title: '动爻启示',
          content: parsed.changingLinesGuidance?.trim() ?? '',
        },
        {
          title: '变卦指引',
          content: parsed.changedInterpretation?.trim() ?? '',
        },
      ].filter((item) => item.content)

      if (items.length) {
        return { items, plain: '' }
      }
    } catch {
      // Fall back to markdown/plain-text parsing.
    }
  }

  return parseMarkdownInterpretation(text)
}

const requestInterpretation = async (
  lines: Line[],
  entry: HexagramEntry | null,
  changedEntry: HexagramEntry | null,
  onChunk?: (text: string) => void
) => {
  // Cache check (only when entry is resolved)
  if (entry) {
    const { baseId, changing } = buildCacheKey(entry.id, lines)
    const params = new URLSearchParams({ baseId: String(baseId), changing: changing.join(',') })
    try {
      const res = await fetch(`${CACHE_API}?${params}`)
      if (res.ok) {
        const json = await res.json() as { hit: boolean; data?: { base_interpretation: string; changing_lines_guidance: string; changed_interpretation: string } }
        if (json.hit && json.data) {
          const { base_interpretation, changing_lines_guidance, changed_interpretation } = json.data
          return JSON.stringify({ baseInterpretation: base_interpretation, changingLinesGuidance: changing_lines_guidance, changedInterpretation: changed_interpretation })
        }
      }
    } catch {
      // Cache unavailable — fall through to LLM
    }
  }

  const prompt = buildInterpretationPrompt(lines, entry, changedEntry)

  const response = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        {
          role: 'system',
          content:
            '你是“问心”的周易解读师，精通周易命理，擅长将古典卦象转化为现代人易懂的建议。请先解释卦辞、爻辞等古典经文的含义，再结合现实情境展开解读，让不懂易经的用户也能充分理解。语气温和、深入浅出，可适当引用原文并加以说明。若用户没有明确说明所问事项，请默认从学业、工作、事业、财富、爱情、家庭、亲戚、朋友等维度中选择与卦象最相关的几个角度进行分析，明确指出哪些维度更值得关注，并说明判断依据来自卦象、卦辞与动爻变化。输出语言：简体中文。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: INTERPRETATION_TEMPERATURE,
      max_tokens: 768,
    }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(payload.error ?? `${response.status} 请求失败`)
  }

  if (!response.body) throw new Error('stream_unavailable')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let content = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    content += chunk
    onChunk?.(content)
  }

  if (!content) throw new Error('interpretation_empty')

  // Save to cache after successful stream (fire-and-forget)
  if (entry) {
    try {
      const parsed = JSON.parse(content) as { baseInterpretation?: string; changingLinesGuidance?: string; changedInterpretation?: string }
      if (parsed.baseInterpretation && parsed.changingLinesGuidance && parsed.changedInterpretation) {
        const { baseId, changing } = buildCacheKey(entry.id, lines)
        fetch(CACHE_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseId,
            changing,
            baseInterpretation: parsed.baseInterpretation,
            changingLinesGuidance: parsed.changingLinesGuidance,
            changedInterpretation: parsed.changedInterpretation,
          }),
        }).catch(() => { /* ignore cache write failures */ })
      }
    } catch {
      // Not valid JSON — skip caching
    }
  }

  return content
}

const tossLine = (): Line => {
  const coins = Array.from({ length: 3 }, () => (Math.random() < 0.5 ? 2 : 3))
  const sum = coins[0] + coins[1] + coins[2]
  if (sum === 6) return { value: 6, yin: true, changing: true }
  if (sum === 7) return { value: 7, yin: false, changing: false }
  if (sum === 8) return { value: 8, yin: true, changing: false }
  if (sum === 9) return { value: 9, yin: false, changing: true }
  throw new Error(`tossLine: unexpected coin sum ${sum}, expected 6–9`)
}

const wrapCanvasText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 999
) => {
  const lines: string[] = []
  const paragraphs = text.replace(/\r/g, '').split('\n')

  for (const paragraph of paragraphs) {
    const source = paragraph.trim()
    if (!source) {
      lines.push('')
      continue
    }

    let current = ''
    for (const char of Array.from(source)) {
      const next = current + char
      if (ctx.measureText(next).width <= maxWidth) {
        current = next
        continue
      }
      if (current) lines.push(current)
      current = char
      if (lines.length >= maxLines) break
    }
    if (lines.length >= maxLines) break
    if (current) lines.push(current)
  }

  if (lines.length > maxLines) return lines.slice(0, maxLines)
  if (lines.length === maxLines && maxLines < 999) {
    const joined = text.replace(/\s+/g, '')
    const compact = lines.join('').replace(/\s+/g, '')
    if (joined !== compact) {
      const last = lines[maxLines - 1] ?? ''
      lines[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 1))}…`
    }
  }
  return lines
}


const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('分享图生成失败'))
    }, 'image/jpeg', quality)
  })

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

const drawHexagramOnCanvas = (
  ctx: CanvasRenderingContext2D,
  lines: Line[],
  x: number,
  y: number,
  width: number,
  height: number
) => {
  // 与页面里的 SVG 卦象一致：viewBox 160x120，阴爻(58+58) 阳爻(140)
  const displayLines = [...lines].reverse()
  const baseW = 160
  const baseH = 120
  const scale = Math.min(width / baseW, height / baseH)
  const drawW = baseW * scale
  const drawH = baseH * scale
  const offsetX = x + (width - drawW) / 2
  const offsetY = y + (height - drawH) / 2

  displayLines.forEach((line, index) => {
    const fill = line.changing ? '#ff6b6b' : '#6aa6ff'
    const rectY = offsetY + (6 + index * 18) * scale
    const rectH = 10 * scale
    const radius = 5 * scale

    ctx.fillStyle = fill
    if (line.yin) {
      drawRoundedRect(ctx, offsetX + 10 * scale, rectY, 58 * scale, rectH, radius)
      ctx.fill()
      drawRoundedRect(ctx, offsetX + 92 * scale, rectY, 58 * scale, rectH, radius)
      ctx.fill()
      return
    }

    drawRoundedRect(ctx, offsetX + 10 * scale, rectY, 140 * scale, rectH, radius)
    ctx.fill()
  })
}

const renderGuaShareCard = async (
  ctx: CanvasRenderingContext2D,
  result: HexagramResult,
  interpretation: ParsedInterpretation,
  canvasHeight: number,
  shouldDraw: boolean
) => {
  const w = ctx.canvas.width
  const padding = SHARE_MARGIN
  const contentW = w - padding * 2

  if (shouldDraw) {
    const bg = ctx.createLinearGradient(0, 0, 0, canvasHeight)
    bg.addColorStop(0, '#f8f4ec')
    bg.addColorStop(0.55, '#efe8dc')
    bg.addColorStop(1, '#e9dfd1')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, canvasHeight)
  }

  ctx.textBaseline = 'top'
  let y = 72

  const baseName = getHexagramName(result.entry) || '本卦'
  const changedName = getHexagramName(result.changedEntry)
  const hasChangedHexagram =
    Boolean(changedName) && result.lines.some((line) => line.changing) && result.changedNumber !== result.number

  ctx.fillStyle = '#1f1a16'
  ctx.font = '700 54px "Noto Serif SC", serif'
  if (shouldDraw) ctx.fillText(baseName, padding, y)
  y += 76

  ctx.fillStyle = '#6b5f54'
  ctx.font = '400 28px "Noto Serif SC", serif'
  ctx.textAlign = 'left'
  if (shouldDraw) ctx.fillText(`本卦：${baseName}`, padding, y)
  if (hasChangedHexagram && changedName) {
    ctx.textAlign = 'right'
    if (shouldDraw) ctx.fillText(`变卦：${changedName}`, w - padding, y)
    ctx.textAlign = 'left'
  }
  y += 58

  const drawSectionTitle = (title: string) => {
    ctx.fillStyle = '#2f2722'
    ctx.font = '700 34px "Noto Serif SC", serif'
    if (shouldDraw) ctx.fillText(title, padding, y)
    y += 52
  }

  const drawParagraph = (text: string, size = 28, color = '#4d433a', gapAfter = 22) => {
    ctx.fillStyle = color
    ctx.font = `400 ${size}px "Noto Serif SC", serif`
    const lineHeight = Math.round(size * 1.62)
    const lines = wrapCanvasText(ctx, text.trim(), contentW)
    for (const line of lines) {
      if (shouldDraw && line) ctx.fillText(line, padding, y)
      y += line ? lineHeight : Math.round(lineHeight * 0.45)
    }
    y += gapAfter
  }

  const drawHexagramPanel = (lines: Line[]) => {
    const panelHeight = 250
    if (shouldDraw) {
      ctx.fillStyle = 'rgba(139, 74, 60, 0.1)'
      drawRoundedRect(ctx, padding, y, contentW, panelHeight, 26)
      ctx.fill()
      drawHexagramOnCanvas(ctx, lines, padding + 44, y + 30, contentW - 88, panelHeight - 60)
    }
    y += panelHeight + 28
  }

  const drawHexagramSection = (
    sectionTitle: string,
    entry: HexagramEntry | null,
    lines: Line[],
    highlightChanging: boolean
  ) => {
    drawSectionTitle(sectionTitle)
    drawHexagramPanel(lines)

    drawParagraph(entry?.guaCi ?? '暂无卦辞', 29, '#4d433a', 18)
    drawParagraph('爻辞', 30, '#352d27', 10)

    entry?.yaoCi.forEach((text, index) => {
      const line = lines[index]
      const isChanging = highlightChanging && (line?.changing ?? false)
      const suffix = isChanging ? '（动爻）' : ''
      drawParagraph(`${text}${suffix}`, 27, isChanging ? '#7e3f34' : '#4d433a', 10)
    })
    y += 12
  }

  drawHexagramSection('本卦卦象', result.entry, result.lines, true)

  if (hasChangedHexagram) {
    drawHexagramSection('变卦卦象', result.changedEntry, result.changedLines, false)
  }

  drawSectionTitle('卦象解读')
  if (interpretation.items.length) {
    interpretation.items.forEach((item) => {
      drawParagraph(`【${item.title}】`, 28, '#352d27', 8)
      drawParagraph(item.content, 27, '#4d433a', 16)
    })
  } else {
    drawParagraph(interpretation.plain || result.interpretation || '暂无解读', 27, '#4d433a', 14)
  }

  const footerY = y + 24
  if (shouldDraw) {
    ctx.strokeStyle = 'rgba(139, 74, 60, 0.2)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(padding, footerY)
    ctx.lineTo(w - padding, footerY)
    ctx.stroke()
  }

  const footerTopY = footerY + 34
  if (shouldDraw) {
    await drawShareFooter(ctx, w, footerTopY, '问心')
  }

  return Math.min(SHARE_CARD_MAX_HEIGHT, Math.ceil(footerTopY + SHARE_QR_SIZE + 34))
}

const generateGuaShareCard = async (result: HexagramResult, interpretation: ParsedInterpretation) => {
  const measureCanvas = document.createElement('canvas')
  measureCanvas.width = SHARE_WIDTH
  measureCanvas.height = 1
  const measureCtx = measureCanvas.getContext('2d')
  if (!measureCtx) throw new Error('分享图生成失败，请稍后再试。')

  const finalHeight = await renderGuaShareCard(measureCtx, result, interpretation, 1, false)

  const output = document.createElement('canvas')
  output.width = SHARE_WIDTH
  output.height = finalHeight
  const outputCtx = output.getContext('2d')
  if (!outputCtx) throw new Error('分享图生成失败，请稍后再试。')

  await renderGuaShareCard(outputCtx, result, interpretation, finalHeight, true)
  return await canvasToBlob(output, 0.92)
}

type HexagramCardProps = {
  heading: string
  entry: HexagramEntry | null
  lines: Array<Line | null>
}

function HexagramCard({ heading, entry, lines }: HexagramCardProps) {
  return (
    <section className="panel result-panel">
      <div className="panel-header">
        <div className="header-left">
          <div className="hexagram header-hexagram">
            <svg className="hexagram-image" viewBox="0 0 160 120" aria-hidden="true">
              {lines.map((line, index) => {
                if (!line) return null
                const y = 6 + index * 18
                const fill = line.changing ? '#ff6b6b' : '#6aa6ff'
                if (line.yin) {
                  return (
                    <g key={`svg-${index}`}>
                      <rect x="10" y={y} width="58" height="10" rx="5" fill={fill} />
                      <rect x="92" y={y} width="58" height="10" rx="5" fill={fill} />
                    </g>
                  )
                }
                return (
                  <rect key={`svg-${index}`} x="10" y={y} width="140" height="10" rx="5" fill={fill} />
                )
              })}
            </svg>
          </div>
          <div className="header-text">
            <h2>{heading}</h2>
          </div>
        </div>
      </div>

      <div className="result-body">
        <div className="text-block">
          <h3>{getHexagramName(entry) || entry?.title}</h3>
          <div className="quote">{entry?.guaCi}</div>


          <div className="section">
            <h4>爻辞</h4>
            <ul>
              {entry?.yaoCi.map((yao, i) => {
                // yaoCi[0]=初爻 对应 lines 末尾；lines 已 reverse，所以 lines[len-1-i]
                const correspondingLine = lines[lines.length - 1 - i]
                const isChanging = correspondingLine?.changing ?? false
                return (
                  <li key={yao} className={isChanging ? 'changing-yao' : ''}>
                    {yao}
                    {isChanging && <span className="changing-badge">动爻</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function GuaClient() {
  const [result, setResult] = useState<HexagramResult | null>(null)
  const [isCasting, setIsCasting] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [revealResult, setRevealResult] = useState(false)
  const [isGeneratingShare, setIsGeneratingShare] = useState(false)
  const [shareBlob, setShareBlob] = useState<Blob | null>(null)
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const castIdRef = useRef(0)
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasResult = Boolean(result?.entry)

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

  const resetCast = () => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current)
      revealTimerRef.current = null
    }
    resetShareCard()
    setIsCasting(false)
    setRevealResult(false)
    setResult(null)
    castIdRef.current += 1
  }

  const handleCast = async () => {
    if (isCasting) return
    castIdRef.current += 1
    const castId = castIdRef.current
    resetShareCard()
    const lines = Array.from({ length: 6 }, () => tossLine())
    const changedLines = lines.map((line) =>
      line.changing
        ? { ...line, yin: !line.yin, changing: false }
        : { ...line, changing: false }
    )
    const { number, entry } = deriveHexagram(lines)
    const { number: changedNumber, entry: changedEntry } = deriveHexagram(changedLines)
    setIsCasting(true)
    setRevealResult(false)
    setResult({
      lines,
      number,
      entry,
      changedLines,
      changedNumber,
      changedEntry,
      interpretation: '解读生成中...',
    })
    revealTimerRef.current = setTimeout(() => {
      setRevealResult(true)
    }, 3000)
    try {
      let hasReceivedFirstChunk = false
      const finalText = await requestInterpretation(
        lines,
        entry,
        changedEntry,
        (partial) => {
          if (castId === castIdRef.current) {
            if (!hasReceivedFirstChunk && partial.trim()) {
              hasReceivedFirstChunk = true
              setIsCasting(false)
            }
            setResult((prev) =>
              prev ? { ...prev, interpretation: toDisplayInterpretation(partial) } : prev
            )
          }
        }
      )
      if (castId !== castIdRef.current) {
        return
      }
      setIsCasting(false)
      setResult((prev) => (prev ? { ...prev, interpretation: finalText } : prev))
    } catch (error) {
      if (castId !== castIdRef.current) {
        return
      }
      const message =
        error instanceof Error && error.message
          ? `解读生成失败：${error.message}`
          : '解读生成失败，请稍后再试。'
      const nextResult = {
        lines,
        number,
        entry,
        changedLines,
        changedNumber,
        changedEntry,
        interpretation: message,
      }
      setResult(nextResult)
      setIsCasting(false)
    }
  }

  const handleRetry = async () => {
    if (!result || isRetrying) return
    setIsRetrying(true)
    setResult((prev) => prev ? { ...prev, interpretation: '解读生成中...' } : prev)
    try {
      const finalText = await requestInterpretation(
        result.lines,
        result.entry,
        result.changedEntry,
        (partial) => setResult((prev) => prev ? { ...prev, interpretation: toDisplayInterpretation(partial) } : prev)
      )
      setResult((prev) => prev ? { ...prev, interpretation: finalText } : prev)
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? `解读生成失败：${error.message}`
          : '解读生成失败，请稍后再试。'
      setResult((prev) => prev ? { ...prev, interpretation: message } : prev)
    } finally {
      setIsRetrying(false)
    }
  }

  const changingLines = useMemo(
    () =>
      result?.lines
        .map((line, index) => ({ line, index }))
        .filter((item) => item.line.changing) ?? [],
    [result]
  )

  const displayLines = result?.lines
    ? [...result.lines].reverse()
    : Array.from({ length: 6 }, () => null)
  const displayChangedLines = result?.changedLines
    ? [...result.changedLines].reverse()
    : Array.from({ length: 6 }, () => null)
  const interpretationParts = result?.interpretation
    ? parseInterpretation(result.interpretation)
    : { items: [], plain: '' }

  const buildShareCard = async () => {
    if (!result || !result.entry) return null
    setIsGeneratingShare(true)
    try {
      const parsed = parseInterpretation(result.interpretation)
      const blob = await generateGuaShareCard(result, parsed)
      const url = URL.createObjectURL(blob)
      if (shareImageUrl) URL.revokeObjectURL(shareImageUrl)
      setShareBlob(blob)
      setShareImageUrl(url)
      return blob
    } catch {
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

  const handleCloseShare = () => {
    setIsShareOpen(false)
  }

  const handleSaveShareImage = async () => {
    const blob = shareBlob ?? (await buildShareCard())
    if (!blob) return

    const filename = `xiaozhuang-gua-${result?.number ?? 'share'}.jpg`
    const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })

    try {
      if (
        typeof navigator !== 'undefined' &&
        'share' in navigator &&
        typeof navigator.share === 'function' &&
        (!('canShare' in navigator) || navigator.canShare?.({ files: [file] }))
      ) {
        await navigator.share({
          title: '问心卦象分享图',
          text: '小庄 · 问心',
          files: [file],
        })
        return
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
    }

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.rel = 'noopener'
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="app gua-app">
      <header className="hero gua-hero">
        <div className="gua-mist-layer" aria-hidden="true" />
        <div className="gua-mountain-layer" aria-hidden="true" />
        <div className="seal">心</div>
        <div className="hero-text gua-hero-text">
          <Link href="/" className="back-link">← 小庄</Link>
          <p className="subtitle">静心 · 观变 · 明行</p>
          <h1>问心</h1>
          <p className="description">
            以阴阳为镜，照见内心之事。起卦前请平静情绪，想清楚所求，默念三遍即可。
          </p>
          <p className="gua-hero-quote">山高月小，水落石出</p>
        </div>
      </header>

      <section className="panel cast-panel">
        <div className="cast-info">
          <div>
            <h2>起卦提示</h2>
            <p className="panel-tip">
              起卦遵循三枚铜钱法，共六爻自下而上。数得六（老阴）或九（老阳）为变爻，将用金纹标记。
            </p>
          </div>
          {!hasResult && !isCasting ? (
            <button className="cast-button" onClick={handleCast}>
              八卦一下
            </button>
          ) : null}
        </div>
      </section>

      {isCasting && !revealResult ? (
        <section className="panel casting-panel">
          <div className="casting-content">
            <svg className="yin-yang-spinner" viewBox="0 0 120 120" aria-hidden="true">
              {/* 阴（暗）底圆 */}
              <circle cx="60" cy="60" r="50" fill="#15110f" />
              {/* 阳（亮）路径：顶→右大弧到底→逆时针下小圆左侧到圆心→顺时针上小圆右侧回顶 */}
              <path
                d="M 60 10 A 50 50 0 0 1 60 110 A 25 25 0 0 0 60 60 A 25 25 0 0 1 60 10 Z"
                fill="#f7f0e1"
              />
              {/* 外圆边框 */}
              <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(246,226,178,0.2)" strokeWidth="1" />
              {/* 阳鱼内的阴眼（上小圆圆心） */}
              <circle cx="60" cy="35" r="10" fill="#15110f" />
              {/* 阴鱼内的阳眼（下小圆圆心） */}
              <circle cx="60" cy="85" r="10" fill="#f7f0e1" />
            </svg>
            <div>
              <h2>卦象生成中</h2>
              <p className="subtle">静心片刻，让卦象自然显现。</p>
            </div>
          </div>
        </section>
      ) : null}

      {hasResult && revealResult ? (
        <>
          <main className="layout">
            <HexagramCard heading="本卦卦象" entry={result?.entry ?? null} lines={displayLines} />
          </main>

          {changingLines.length > 0 ? (
            <HexagramCard heading="变卦卦象" entry={result?.changedEntry ?? null} lines={displayChangedLines} />
          ) : null}

          <section className="panel guidance-panel">
            <h2>卦象解读</h2>
            {interpretationParts.items.length ? (
              interpretationParts.items.map((item) => (
                <div className="section" key={item.title}>
                  <h4>{item.title}</h4>
                  <p>{item.content}</p>
                </div>
              ))
            ) : (
              <p>{interpretationParts.plain || result?.interpretation}</p>
            )}
            {result?.interpretation?.startsWith('解读生成失败') ? (
              <button
                className="retry-button"
                onClick={handleRetry}
                disabled={isRetrying}
              >
                {isRetrying ? '重新解读中...' : '重新解读'}
              </button>
            ) : null}

            <button
              type="button"
              className="gua-share-icon-button gua-share-icon-button-floating"
              onClick={handleOpenShare}
              disabled={isGeneratingShare || !result?.entry}
              aria-label="生成卦象长图"
              title="生成分享长图"
            >
              <svg viewBox="0 0 18 18" aria-hidden="true">
                <path d={SHARE_ICON_PATH} />
              </svg>
            </button>

            {result?.interpretation && result.interpretation !== '解读生成中...' ? (
              <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                <button className="cast-button" style={{ width: 'auto', minWidth: '160px', marginTop: 0 }} onClick={resetCast}>放空一下</button>
              </div>
            ) : null}

            {isShareOpen && shareImageUrl ? (
              <div
                className="gua-share-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="卦象分享图片预览"
              >
                <div className="gua-share-sheet-topbar">
                  <span className="gua-share-sheet-title">点图片保存或分享</span>
                  <button type="button" className="gua-share-close" onClick={handleCloseShare} aria-label="关闭分享预览">
                    ×
                  </button>
                </div>
                <img
                  src={shareImageUrl}
                  alt="卦象分享长图预览"
                  className="gua-share-sheet-image"
                  onClick={handleSaveShareImage}
                />
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  )
}
