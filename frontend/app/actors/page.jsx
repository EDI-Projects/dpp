'use client'

import { useEffect, useState } from 'react'
import api from '../../lib/api'

const TIER_LABELS = { 0: 'Tier 0 Root', 1: 'Tier 1 Verified', 2: 'Tier 2 Dataset' }
const TIER_COLORS = {
  0: 'bg-red-100 text-red-800',
  1: 'bg-blue-100 text-blue-800',
  2: 'bg-gray-100 text-gray-700',
}
const ROLE_COLORS = {
  root:      'bg-red-50 text-red-700',
  certifier: 'bg-yellow-50 text-yellow-700',
  recycler:  'bg-green-50 text-green-700',
  regulator: 'bg-purple-50 text-purple-700',
  supplier:  'bg-cyan-50 text-cyan-700',
  logistics: 'bg-indigo-50 text-indigo-700',
  factory:   'bg-gray-50 text-gray-600',
}

function truncate(str, n = 24) {
  if (!str) return '—'
  return str.length > n ? str.slice(0, n) + '…' : str
}

export default function ActorsPage() {
  const [actors, setActors] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    api.get('/actors')
      .then(r => setActors(r.data))
      .catch(() => setError('Could not load actor registry.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-gray-500">Loading actors…</p>
  if (error) return <p className="text-red-600">{error}</p>

  const actorList = actors?.actors || []

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold mb-1">Actor Registry</h1>
      <p className="text-sm text-gray-500 mb-6">
        {actorList.length} registered actor{actorList.length !== 1 ? 's' : ''}
      </p>

      <div className="space-y-3">
        {actorList.map(actor => (
          <div
            key={actor.did}
            className="bg-white border border-gray-200 rounded-lg p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{actor.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${TIER_COLORS[actor.tier] || 'bg-gray-100 text-gray-600'}`}>
                    {TIER_LABELS[actor.tier] || `Tier ${actor.tier}`}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${ROLE_COLORS[actor.role] || 'bg-gray-50 text-gray-500'}`}>
                    {actor.role}
                  </span>
                </div>
                <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{actor.did}</p>
                {actor.approved_by && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Approved by: <span className="font-mono">{actor.approved_by}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => setExpanded(expanded === actor.did ? null : actor.did)}
                className="text-xs text-gray-400 hover:text-gray-600 underline shrink-0"
              >
                {expanded === actor.did ? 'Hide' : 'Details'}
              </button>
            </div>

            {expanded === actor.did && (
              <dl className="mt-3 border-t border-gray-100 pt-3 grid grid-cols-1 gap-y-2 text-xs">
                <div>
                  <dt className="text-gray-400 mb-0.5">DID</dt>
                  <dd className="font-mono break-all">{actor.did}</dd>
                </div>
                {actor.public_key && (
                  <div>
                    <dt className="text-gray-400 mb-0.5">Public Key (Ed25519)</dt>
                    <dd className="font-mono break-all text-gray-600 bg-gray-50 rounded p-2">
                      {actor.public_key}
                    </dd>
                  </div>
                )}
                {actor.approved_by && (
                  <div>
                    <dt className="text-gray-400 mb-0.5">Approved By</dt>
                    <dd className="font-mono">{actor.approved_by}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-gray-400 mb-0.5">Tier</dt>
                  <dd>{TIER_LABELS[actor.tier] || actor.tier}</dd>
                </div>
                <div>
                  <dt className="text-gray-400 mb-0.5">Role</dt>
                  <dd className="capitalize">{actor.role}</dd>
                </div>
              </dl>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
