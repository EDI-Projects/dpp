import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
})

// Attach stored Bearer token to every request
api.interceptors.request.use(config => {
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('dpp_token')
    if (token) config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// On 401, clear stale token so the UI resets to the sign-in state
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('dpp_token')
      localStorage.removeItem('dpp_actor')
    }
    return Promise.reject(err)
  }
)

export function getStoredActor() {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(localStorage.getItem('dpp_actor') || 'null') } catch { return null }
}

export function setStoredToken(token, actor) {
  localStorage.setItem('dpp_token', token)
  localStorage.setItem('dpp_actor', JSON.stringify(actor))
}

export function clearStoredToken() {
  localStorage.removeItem('dpp_token')
  localStorage.removeItem('dpp_actor')
}

/**
 * DIDAuth login: challenge → sign (server-side wallet) → verify.
 * Proves identity by Ed25519 signature without exposing the private key.
 */
export async function didLogin(did) {
  // 1. Request a challenge nonce for this DID
  const { data: { challenge } } = await api.post('/auth/challenge', { did })
  // 2. Sign the challenge (server-side wallet — in production this is a client wallet)
  const { data: { signature } } = await api.post('/auth/sign', { did, challenge })
  // 3. Verify the signature; backend issues a session token
  const { data } = await api.post('/auth/verify', { did, challenge, signature })
  setStoredToken(data.token, data.actor)
  return data
}

export default api
