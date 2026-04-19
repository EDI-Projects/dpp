import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(config => {
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('dpp_token')
    if (token) config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

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

export async function loginWithWallet(signer, chainId = 80002) {
  const address = await signer.getAddress()
  const { data: challenge } = await api.post('/auth/siwe/challenge', {
    address,
    chain_id: chainId,
  })

  const signature = await signer.signMessage(challenge.message)
  const { data } = await api.post('/auth/siwe/verify', {
    address,
    nonce: challenge.nonce,
    signature,
    chain_id: challenge.chain_id,
  })

  setStoredToken(data.token, data.actor)
  return data
}

export default api
