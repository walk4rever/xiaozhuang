// ---------------------------------------------------------------------------
// Supabase REST client (minimal, mirrors du-server pattern)
// ---------------------------------------------------------------------------
const required = (value: string | undefined, name: string): string => {
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

const supabaseFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const supabaseUrl = required(process.env.SUPABASE_URL, 'SUPABASE_URL')
  const serviceRoleKey = required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY')

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Supabase request failed: ${response.status} ${text}`)
  }

  if (response.status === 204) return null as T
  const text = await response.text()
  if (!text) return null as T
  return JSON.parse(text) as T
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type GuaInterpretation = {
  key: string
  base_interpretation: string
  changing_lines_guidance: string
  changed_interpretation: string
}

// ---------------------------------------------------------------------------
// Cache key
// key 格式："{本卦id}_{动爻位列表}" 如 "1_1,3,5"，无动爻则 "1_0"
// changingPositions: 1-indexed, sorted ascending
// ---------------------------------------------------------------------------
export const buildGuaCacheKey = (baseId: number, changingPositions: number[]): string => {
  const positions = [...changingPositions].sort((a, b) => a - b)
  return `${baseId}_${positions.length ? positions.join(',') : '0'}`
}

// ---------------------------------------------------------------------------
// DB operations
// ---------------------------------------------------------------------------
export const getGuaInterpretation = async (key: string): Promise<GuaInterpretation | null> => {
  const rows = await supabaseFetch<GuaInterpretation[]>(
    `xz_gua_interpretations?key=eq.${encodeURIComponent(key)}&limit=1`
  )
  return rows?.[0] ?? null
}

export const saveGuaInterpretation = async (data: GuaInterpretation): Promise<void> => {
  await supabaseFetch('xz_gua_interpretations', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(data),
  })
}
