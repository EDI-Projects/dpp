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

/** Request a demo session token for the given actor DID */
export async function demoLogin(did) {
  const res = await api.post('/admin/demo-token', { did })
  setStoredToken(res.data.token, res.data.actor)
  return res.data
}

export default api
