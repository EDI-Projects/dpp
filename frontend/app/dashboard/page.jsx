'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import api, { getStoredActor, clearStoredToken } from '../../lib/api'

const STAGE_LABELS = {
  ProductBirthCertificate:    'Manufactured',
  MaterialSourcingCredential: 'Materials Sourced',
  CertificationCredential:    'Certified',
  CustodyTransferCredential:  'Shipped',
  OwnershipCredential:        'Received by Retailer',
  RepairCredential:           'Repaired',
  EndOfLifeCredential:        'Recycled',
}

const ROLE_BADGE = {
  tier0_root:       'bg-red-100 text-red-800',
  tier1_certifier:  'bg-blue-100 text-blue-800',
  tier1_recycler:   'bg-green-100 text-green-800',
  tier1_regulator:  'bg-purple-100 text-purple-800',
  tier2_factory:    'bg-gray-100 text-gray-700',
  tier2_supplier:   'bg-orange-100 text-orange-800',
  tier2_logistics:  'bg-yellow-100 text-yellow-800',
}

export default function DashboardPage() {
  const router = useRouter()
  const [actor, setActor]       = useState(null)
  const [products, setProducts] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    const stored = getStoredActor()
    if (!stored) { router.push('/login'); return }
    setActor(stored)
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [pRes, aRes] = await Promise.all([
        api.get('/dashboard/my-products'),
        api.get('/dashboard/recent-activity').catch(() => ({ data: { entries: [] } })),
      ])
      setProducts(pRes.data.products || [])
      setActivity(aRes.data.entries || [])
    } catch (err) {
      if (err.response?.status === 401) { router.push('/login'); return }
      setError(err.response?.data?.detail || 'Failed to load dashboard.')
    } finally {
      setLoading(false)
    }
  }

  function handleSignOut() {
    clearStoredToken()
    router.push('/login')
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto mt-16 text-center">
      <div className="text-3xl mb-3 animate-pulse">⚙️</div>
      <p className="text-gray-500">Loading your dashboard…</p>
    </div>
  )

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          {actor && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-600">{actor.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[actor.role] || 'bg-gray-100 text-gray-600'}`}>
                {actor.role}
              </span>
            </div>
          )}
          {actor && <p className="text-xs text-gray-400 font-mono mt-0.5 truncate max-w-xs">{actor.did}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          {(actor?.role === 'tier0_root' || actor?.role === 'tier1_regulator') && (
            <a href="/admin" className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700">Admin</a>
          )}
          <a href="/dashboard/settings" className="text-xs border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">Settings</a>
          <button onClick={handleSignOut} className="text-xs border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">Sign out</button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm mb-6">{error}</div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        {actor?.role?.startsWith('tier2_factory') && (
          <a href="/product/new" className="rounded-xl border border-gray-200 bg-white p-4 hover:bg-blue-50 hover:border-blue-200 transition-colors">
            <div className="text-2xl mb-2">📋</div>
            <div className="font-medium text-sm">Issue Birth Certificate</div>
            <div className="text-xs text-gray-500 mt-0.5">Register a new product</div>
          </a>
        )}
        <a href="/actors" className="rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors">
          <div className="text-2xl mb-2">🏭</div>
          <div className="font-medium text-sm">Browse Factories</div>
          <div className="text-xs text-gray-500 mt-0.5">View all factory products</div>
        </a>
        <a href={`/verify/new`} onClick={e => { e.preventDefault(); const id = window.prompt('Enter product ID to verify:'); if(id) router.push(`/verify/${encodeURIComponent(id)}`) }}
          className="rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors cursor-pointer">
          <div className="text-2xl mb-2">🔍</div>
          <div className="font-medium text-sm">Verify a Product</div>
          <div className="text-xs text-gray-500 mt-0.5">Scan or enter product ID</div>
        </a>
        <a href="/dashboard/settings" className="rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors">
          <div className="text-2xl mb-2">🔑</div>
          <div className="font-medium text-sm">Key Rotation</div>
          <div className="text-xs text-gray-500 mt-0.5">Rotate your signing key</div>
        </a>
      </div>

      {/* Products */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-800">Your Products</h2>
          <span className="text-xs text-gray-400">{products.length} total</span>
        </div>
        {products.length === 0 ? (
          <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-gray-200">
            <div className="text-3xl mb-2">📦</div>
            <p className="text-sm">No products issued yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {products.map(p => (
              <a key={p.product_id} href={`/product/${encodeURIComponent(p.product_id)}`}
                className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.product_id}</p>
                  <p className="text-xs text-gray-500">{STAGE_LABELS[p.current_stage] || p.current_stage} · {p.stage_count} stage{p.stage_count !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.has_warning && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">⚠️ Issue</span>}
                  <span className="text-gray-400 text-sm">→</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div>
        <h2 className="font-semibold text-gray-800 mb-3">Recent Activity</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No recent activity</p>
        ) : (
          <div className="space-y-1.5">
            {activity.slice(0, 10).map((e, i) => (
              <div key={i} className="flex items-center gap-3 text-xs py-2 border-b border-gray-100">
                <span className="text-gray-400 shrink-0 tabular-nums">{new Date(e.ts).toLocaleString()}</span>
                <span className={`px-1.5 py-0.5 rounded font-medium shrink-0 ${e.event.includes('ISSUED') ? 'bg-green-100 text-green-700' : e.event.includes('REVOKED') ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                  {e.event}
                </span>
                {e.product_id && (
                  <a href={`/product/${encodeURIComponent(e.product_id)}`} className="text-blue-600 hover:underline truncate">
                    {e.product_id}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
