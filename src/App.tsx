import { useMemo, useRef, useState } from 'react'
import zhouyi from './data/zhouyi.json'
import './App.css'

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

const INTERPRETATION_TEMPERATURE = 0.75

const buildInterpretationPrompt = (
  lines: Line[],
  entry: HexagramEntry | null,
  changedEntry: HexagramEntry | null
) => {
  // 收集所有动爻，lines[0]=初爻，lines[5]=上爻
  const changingYaos = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.changing)
    .map(({ index }) => {
      const label =
        index === 0 ? '初爻' : index === 5 ? '上爻' : `第${index + 1}爻`
      const yaoCiText = entry?.yaoCi[index] ?? ''
      return `${label}：${yaoCiText}`
    })

  const changingYaoText = changingYaos.length
    ? changingYaos.join('\n')
    : '无动爻（静卦，以本卦卦辞为主）'

  const baseTitle = entry?.title ?? '本卦'
  const changedTitle = changedEntry?.title ?? '变卦'

  return `
【本卦】${baseTitle}
卦辞：${entry?.guaCi ?? ''}
彖辞：${entry?.tuan?.[0] ?? ''}

【动爻】（共 ${changingYaos.length} 爻变动）
${changingYaoText}

【变卦】${changedTitle}
卦辞：${changedEntry?.guaCi ?? ''}

请严格按以下 Markdown 格式输出，不要添加额外标题层级：

**本卦解读**
（3-5句：先通俗讲解本卦的整体象意，再结合卦辞解释其含义，最后说明当前形势的核心建议）

**动爻启示**
（每条动爻先引用爻辞原文，再用2-3句解释含义与行动指引；若无动爻则解释"静卦"的意义并给出守势建议）

**变卦指引**
（3-5句：解读变卦的整体走向，结合卦辞说明事情最终结果，给出一到两条具体可操作的建议）
`.trim()
}

const parseInterpretation = (text: string) => {
  const cleanText = text.trim()
  const parts: Array<{ title: string; content: string }> = []
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

type ParsedStreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

const parseStreamEvent = (
  eventName: string,
  data: string
): ParsedStreamEvent | null => {
  if (!data) return null
  if (eventName === 'delta') {
    try {
      const content = JSON.parse(data) as string
      return typeof content === 'string' ? { type: 'delta', content } : null
    } catch {
      return null
    }
  }
  if (eventName === 'done') {
    return { type: 'done' }
  }
  if (eventName === 'error') {
    try {
      const payload = JSON.parse(data) as { error?: string }
      return {
        type: 'error',
        message: payload.error ?? 'stream_error',
      }
    } catch {
      return { type: 'error', message: 'stream_error' }
    }
  }
  return null
}

const extractJsonInterpretation = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null
  const parsed = payload as {
    choices?: Array<{
      delta?: { content?: string }
      message?: { content?: string }
    }>
  }
  return (
    parsed.choices?.[0]?.message?.content ??
    parsed.choices?.[0]?.delta?.content ??
    null
  )
}

const requestInterpretation = async (
  lines: Line[],
  entry: HexagramEntry | null,
  changedEntry: HexagramEntry | null,
  onChunk?: (text: string) => void
) => {
  const prompt = buildInterpretationPrompt(lines, entry, changedEntry)
  const rawModel =
    import.meta.env.VITE_AI_MODEL ??
    import.meta.env.VITE_DASHSCOPE_MODEL ??
    'deepseek-v3.2'
  const model = rawModel.startsWith('bailian/') ? rawModel.slice(8) : rawModel
  const apiUrl = import.meta.env.DEV
    ? '/api/bailian'
    : `${import.meta.env.BASE_URL}api/bailian`
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            '你是精通周易的解读师，擅长将古典卦象转化为现代人易懂的建议。请先解释卦辞、爻辞等古典经文的含义，再结合现实情境展开解读，让不懂易经的用户也能充分理解。语气温和、深入浅出，可适当引用原文并加以说明。输出语言：简体中文。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: INTERPRETATION_TEMPERATURE,
      max_tokens: 1024,
      stream: true,
    }),
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`${response.status} ${errorText}`.trim())
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as unknown
    const content = extractJsonInterpretation(payload)
    if (!content) {
      throw new Error('interpretation_empty')
    }
    onChunk?.(content)
    return content
  }
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('stream_unavailable')
  }
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let content = ''
  let currentEvent = ''
  let doneSeen = false
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
          const parsedEvent = parseStreamEvent(
            currentEvent,
            line.slice(5).trim()
          )
          if (!parsedEvent) continue
          if (parsedEvent.type === 'delta') {
            content += parsedEvent.content
            onChunk?.(content)
          } else if (parsedEvent.type === 'done') {
            doneSeen = true
          } else if (parsedEvent.type === 'error') {
            throw new Error(parsedEvent.message)
          }
        }
      }
    }
    if (done || doneSeen) {
      break
    }
  }
  if (buffer.trim()) {
    const line = buffer.trim()
    const delta = parseSseLine(line)
    if (delta) {
      content += delta
      onChunk?.(content)
    }
  }
  if (!content && !doneSeen) {
    throw new Error('interpretation_empty')
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
          <h3>{entry?.title}</h3>
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

function App() {
  const [result, setResult] = useState<HexagramResult | null>(null)
  const [isCasting, setIsCasting] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [revealResult, setRevealResult] = useState(false)
  const castIdRef = useRef(0)
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasResult = Boolean(result?.entry)

  const resetCast = () => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current)
      revealTimerRef.current = null
    }
    setIsCasting(false)
    setRevealResult(false)
    setResult(null)
    castIdRef.current += 1
  }

  const handleCast = async () => {
    if (hasResult || isCasting) {
      resetCast()
      return
    }
    castIdRef.current += 1
    const castId = castIdRef.current
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
              prev ? { ...prev, interpretation: partial } : prev
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
        (partial) => setResult((prev) => prev ? { ...prev, interpretation: partial } : prev)
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

  return (
    <div className="app">
      <header className="hero">
        <div className="seal">卦</div>
        <div className="hero-text">
          <p className="subtitle">静心 · 观变 · 明行</p>
          <h1>八卦起心</h1>
          <p className="description">
            以阴阳为镜，照见内心之事。起卦前请平静情绪，想清楚所求，默念三遍即可。
          </p>
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
          <button className="cast-button" onClick={handleCast}>
            {hasResult || isCasting ? '放空一下' : '八卦一下'}
          </button>
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
          </section>
        </>
      ) : null}
    </div>
  )
}

export default App
