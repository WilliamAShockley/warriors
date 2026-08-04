// Signed identity sessions, HMAC-SHA256 over Web Crypto so the edge
// middleware can verify them without a database round-trip. The payload
// names the user, their workspace, and their role; the signature makes it
// tamper-proof. Secret: AUTH_SECRET, else the first APP_PASSWORD word —
// so existing deployments need no new variable to keep working.

export type SessionPayload = {
  userId: string
  workspaceId: string
  email: string
  role: 'reader' | 'guest'
  exp: number // unix seconds
}

const SESSION_DAYS = 30

const secret = () =>
  process.env.AUTH_SECRET ||
  (process.env.APP_PASSWORD ?? '').split(',')[0]?.trim() ||
  ''

const enc = new TextEncoder()

const b64url = (bytes: ArrayBuffer | Uint8Array) => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const b of arr) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromB64url = (s: string) => {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(padded)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(`allocator-auth:${secret()}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}

export async function signSession(
  payload: Omit<SessionPayload, 'exp'> & { exp?: number }
): Promise<string> {
  const full: SessionPayload = {
    ...payload,
    exp: payload.exp ?? Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 3600,
  }
  const body = b64url(enc.encode(JSON.stringify(full)))
  return `v1.${body}.${await hmac(body)}`
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  if (!secret()) return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  const [, body, sig] = parts
  if ((await hmac(body)) !== sig) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload
    if (!payload.workspaceId || !payload.exp || payload.exp < Date.now() / 1000) return null
    return payload
  } catch {
    return null
  }
}
