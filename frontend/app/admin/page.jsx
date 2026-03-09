'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import api, { getStoredActor } from '../../lib/api'

const EVENT_BADGE = {
  CREDENTIAL_ISSUED:  'bg-green-100 text-green-700',
  CREDENTIAL_REVOKED: 'bg-red-100 text-red-700',
  ACTOR_REGISTERED:   'bg-blue-100 text-blue-700',
  ACTOR_PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700',
  ACTOR_APPROVED:     'bg-green-100 text-green-700',
  ACTOR_REJECTED:     'bg-red-100 text-red-700',
  ACTOR_REVOKED:      'bg-red-100 text-red-700',
  KEY_ROTATED:        'bg-purple-100 text-purple-700',
}

export default function AdminPage() {
  const router = useRouter()
  const [actor, setActor]       = useState(null)
  const [pending, setPending]   = useState([])
  const [auditLog, setAuditLog] = useState([])
  const [tab, setTab]           = useState('queue')
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [actionMsg, setActionMsg] = useState(null)

  useEffect(() => {
    const stored = getStoredActor()
    if (!stored || !['tier0_root', 'tier1_regulator'].includes(stored.role)) {
      router.push('/dashboard')
      return
    }
    setActor(stored)
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [pRes, aRes] = await Promise.all([
        api.get('/admin/pending-approvals'),
        api.get('/admin/audit-log?limit=100'),
      ])
      setPending(pRes.data.pending || [])
      setAuditLog(aRes.data.entries || [])
    } catch (err) {
      if (err.response?.status === 403) { router.push('/dashboard'); return }
      setError(err.response?.data?.detail || 'Failed to load admin data.')
    } finally {
      setLoading(false)
    }
  }

  async function approve(did) {
    try {
      await api.post(`/admin/approve/${encodeURIComponent(did)}`)
      setActionMsg(`Approved: ${did}`)
      loadData()
    } catch (err) { setActionMsg(`Error: ${err.response?.data?.detail}`) }
  }

  async function reject(did) {
    if (!window.confirm(`Reject registration for ${did}?`)) return
    try {
      await api.post(`/admin/reject/${encodeURIComponent(did)}`)
      setActionMsg(`Rejected: ${did}`)
      loadData()
    } catch (err) { setActionMsg(`Error: ${err.response?.data?.detail}`) }
  }

  async function revokeActor(did) {
    if (!window.confirm(`Remove actor ${did} from the registry? This cannot be undone.`)) return
    try {
      await api.post(`/admin/revoke-actor/${encodeURIComponent(did)}`)
      setActionMsg(`Actor removed: ${did}`)
      loadData()
    } catch (err) { setActionMsg(`Error: ${err.response?.data?.detail}`) }
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto mt-16 text-center">
      <div className="text-3xl mb-3 animate-pulse">🛡️</div>
      <p className="text-gray-500">Loading admin panel…</p>
    </div>
  )

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-sm text-gray-500 mt-1">Root Authority · {actor?.name}</p>
        </div>
        <a href="/dashboard" className="text-sm text-blue-600 hover:underline">← Dashboard</a>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm mb-6">{error}</div>}
      {actionMsg && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-700 text-sm mb-4 flex justify-between">
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg(null)} className="text-blue-400 hover:text-blue-600">✕</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-yellow-600">{pending.length}</p>
          <p className="text-xs text-gray-500 mt-1">Pending approvals</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{auditLog.length}</p>
          <p className="text-xs text-gray-500 mt-1">Audit events</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-600">
            {auditLog.filter(e => e.event === 'CREDENTIAL_ISSUED').length}
          </p>
          <p className="text-xs text-gray-500 mt-1">Credentials issued</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl">
        {[['queue', `Approval Queue (${pending.length})`], ['log', 'Audit Log']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors
              ${tab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Approval Queue */}
      {tab === 'queue' && (
        <div>
          {pending.length === 0 ? (
            <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm">No pending approvals</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map(p => (
                <div key={p.did} className="bg-white border border-yellow-200 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{p.role}</p>
                      <p className="text-xs text-gray-400 font-mono mt-1 break-all">{p.did}</p>
                      {p.email && <p className="text-xs text-gray-400 mt-0.5">{p.email}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">
                        Submitted: {new Date(p.submitted).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <button onClick={() => approve(p.did)}
                        className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700">
                        Approve
                      </button>
                      <button onClick={() => reject(p.did)}
                        className="border border-red-300 text-red-600 px-4 py-1.5 rounded-lg text-sm hover:bg-red-50">
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Audit Log */}
      {tab === 'log' && (
        <div>
          {auditLog.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">No audit events yet</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {auditLog.map((e, i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-xl px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 mt-0.5 ${EVENT_BADGE[e.event] || 'bg-gray-100 text-gray-600'}`}>
                      {e.event}
                    </span>
                    <div className="min-w-0 flex-1">
                      {e.product_id && (
                        <a href={`/product/${encodeURIComponent(e.product_id)}`}
                          className="text-xs text-blue-600 hover:underline block truncate">
                          {e.product_id}
                        </a>
                      )}
                      {e.detail && <p className="text-xs text-gray-500 mt-0.5 truncate">{e.detail}</p>}
                      {e.actor_did && <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{e.actor_did}</p>}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                      {new Date(e.ts).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
