'use client'

import { useEffect, useState } from 'react'
import api, { getStoredActor, setStoredToken, clearStoredToken } from '../../lib/api'

const TIER_COLORS = {
  0: 'bg-red-100 text-red-800',
  1: 'bg-blue-100 text-blue-800',
  2: 'bg-gray-100 text-gray-600',
}

export default function SessionBar() {
  const [actor, setActor] = useState(null)
  const [actors, setActors] = useState([])
  const [selectedDid, setSelectedDid] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setActor(getStoredActor())
    api.get('/actors').then(r => {
      const list = r.data.actors || []
      setActors(list)
      if (!selectedDid && list.length > 0) setSelectedDid(list[0].did)
    }).catch(() => {})
  }, [])

  async function handleLogin() {
    if (!selectedDid) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.post('/admin/demo-token', { did: selectedDid })
      setStoredToken(res.data.token, res.data.actor)
      setActor(res.data.actor)
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    clearStoredToken()
    setActor(null)
  }

  if (actor) {
    return (
      <div className="flex items-center gap-3 text-xs">
        <span className="text-gray-400">Signed in as</span>
        <span className="font-medium text-gray-700">{actor.name}</span>
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TIER_COLORS[actor.tier] || 'bg-gray-100 text-gray-600'}`}>
          Tier {actor.tier}
        </span>
        <button
          onClick={handleLogout}
          className="text-gray-400 hover:text-gray-700 border border-gray-200 rounded px-2 py-0.5 hover:bg-gray-50"
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {error && <span className="text-red-500">{error}</span>}
      <select
        value={selectedDid}
        onChange={e => setSelectedDid(e.target.value)}
        className="border border-gray-200 rounded px-2 py-1 text-xs bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
      >
        {actors.map(a => (
          <option key={a.did} value={a.did}>{a.name} (Tier {a.tier})</option>
        ))}
      </select>
      <button
        onClick={handleLogin}
        disabled={loading || !selectedDid}
        className="text-xs bg-gray-800 text-white rounded px-3 py-1 hover:bg-gray-900 transition-colors disabled:opacity-50"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </div>
  )
}
