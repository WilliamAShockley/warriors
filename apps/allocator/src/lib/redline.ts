// The redline: sentence-level tracked changes between two versions of a
// draft. Shared by the proof room (live, as the pen moves) and the Record
// (staged vs signed, after the fact). Pure functions, no DOM.

export type Change = {
  kind: 'struck' | 'added' | 'reworded' | 'envelope'
  label?: string
  a?: string
  b?: string
}

const toSentences = (t: string) =>
  t
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

const similar = (x: string, y: string) => {
  const wx = new Set(x.toLowerCase().split(/\W+/).filter(Boolean))
  const wy = new Set(y.toLowerCase().split(/\W+/).filter(Boolean))
  if (!wx.size || !wy.size) return false
  let inter = 0
  wx.forEach((w) => {
    if (wy.has(w)) inter++
  })
  return inter / Math.max(wx.size, wy.size) > 0.4
}

// Sentence-level LCS diff; an adjacent strike+add that share enough words
// reads as a rewording rather than two separate changes.
export function redlineDiff(before: string, after: string): Change[] {
  const a = toSentences(before)
  const b = toSentences(after)
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])

  const raw: Change[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ kind: 'struck', a: a[i++] })
    } else {
      raw.push({ kind: 'added', b: b[j++] })
    }
  }
  while (i < n) raw.push({ kind: 'struck', a: a[i++] })
  while (j < m) raw.push({ kind: 'added', b: b[j++] })

  const out: Change[] = []
  for (let k = 0; k < raw.length; k++) {
    const cur = raw[k]
    const nxt = raw[k + 1]
    if (cur.kind === 'struck' && nxt?.kind === 'added' && similar(cur.a!, nxt.b!)) {
      out.push({ kind: 'reworded', a: cur.a, b: nxt.b })
      k++
    } else {
      out.push(cur)
    }
  }
  return out
}

export const changeKey = (c: Change) => `${c.kind}:${c.label ?? ''}:${c.a ?? ''}:${c.b ?? ''}`
