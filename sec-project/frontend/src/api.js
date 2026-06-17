const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res
}

export async function checkHealth() {
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(8000) })
    return r.ok
  } catch { return false }
}

export async function fetchPreview(serials) {
  const r = await post('/preview', { serials })
  return r.json()
}

export async function downloadFile(serials, type) {
  const r = await post(`/generate/${type}`, { serials })
  const blob = await r.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `FM-QAF-01-02_02.${type}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
