'use client'

import { useEffect, useState } from 'react'
import api, { getStoredActor, setStoredToken, clearStoredToken, didLogin } from '../../lib/api'

const TIER_COLORS = {
  1: 'bg-blue-100 text-blue-800',
  2: 'bg-gray-100 text-gray-600',
}

const ROLE_LABELS = {
  'tier1_certifier': 'Certifier',
  'tier1_recycler':  'Recycler',
  'tier1_regulator': 'Regulator',
  'tier2_factory':   'Factory',
  'tier2_supplier':  'Supplier',
  'tier2_logistics': 'Logistics',
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
      // Exclude Tier 0 root authority — not a user-facing role
      const list = (r.data.actors || []).filter(a => a.tier !== 0)
      setActors(list)
      if (!selectedDid && list.length > 0) setSelectedDid(list[0].did)
    }).catch(() => {})
  }, [])

  async function handleLogin() {
    if (!selectedDid) return
    setLoading(true)
    setError(null)
    try {
      const data = await didLogin(selectedDid)
      setActor(data.actor)
    } catch (err) {
      setError(err.response?.data?.detail || 'Auth failed')
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    clearStoredToken()
    setActor(null)
  }

  if (actor) {
    const isElevated = actor.role === 'tier0_root' || actor.role === 'tier1_regulator'
    return (
      <div className="flex items-center gap-3 text-xs">
        <a href="/dashboard" className="font-medium text-gray-700 hover:text-blue-600">{actor.name}</a>
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TIER_COLORS[actor.tier] || 'bg-gray-100 text-gray-600'}`}>
          {ROLE_LABELS[actor.role] || actor.role}
        </span>
        {isElevated && (
          <a href="/admin" className="text-red-600 border border-red-200 rounded px-2 py-0.5 hover:bg-red-50 font-medium">
            Admin
          </a>
        )}
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
          <option key={a.did} value={a.did}>
            {a.name} · {ROLE_LABELS[a.role] || a.role}
          </option>
        ))}
      </select>
      <button
        onClick={handleLogin}
        disabled={loading || !selectedDid}
        className="text-xs bg-gray-800 text-white rounded px-3 py-1 hover:bg-gray-900 transition-colors disabled:opacity-50"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
      <a href="/login" className="text-xs text-blue-600 hover:underline">Full sign-in →</a>
    </div>
  )
}