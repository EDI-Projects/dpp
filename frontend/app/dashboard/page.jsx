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
      <p className="text-gray-500">Loading your dashboard…</p>
    </div>
  )

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Dashboard</h1>
          {actor && (
            <div className="flex items-center gap-3 mt-2">
              <span className="text-base font-medium text-gray-700">{actor.name}</span>
              <span className={`text-xs px-3 py-1 rounded-full font-bold border ${ROLE_BADGE[actor.role] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {actor.role}
              </span>
            </div>
          )}
          {actor && <p className="text-xs text-gray-500 font-mono mt-1.5 truncate max-w-sm bg-white/50 px-2 py-1 rounded">{actor.did}</p>}
        </div>
        <div className="flex flex-wrap gap-3 shrink-0">
          {(actor?.role === 'tier0_root' || actor?.role === 'tier1_regulator') && (
            <a href="/admin" className="text-sm bg-rose-500 text-white px-4 py-2 rounded-xl hover:bg-rose-600 font-semibold shadow-sm transition-colors">Admin Console</a>
          )}
          <a href="/dashboard/settings" className="text-sm bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl hover:bg-gray-50 font-medium shadow-sm transition-colors">Settings</a>
          <button onClick={handleSignOut} className="text-sm bg-white border border-gray-200 text-red-600 px-4 py-2 rounded-xl hover:bg-red-50 font-medium shadow-sm transition-colors">Sign out</button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50/80 backdrop-blur p-4 text-red-700 text-sm mb-8 shadow-sm flex items-start gap-3">
          <svg className="w-5 h-5 shrink-0 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {error}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {(actor?.role === 'tier2_factory') && (
          <a href="/issue" className="glass-card rounded-2xl p-5 group cursor-pointer block">
            <div className="w-10 h-10 rounded-full primary-gradient-bg mb-3 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
            </div>
            <div className="font-semibold text-gray-900">Issue Birth Cert</div>
            <div className="text-xs text-gray-500 mt-1">Register new product</div>
          </a>
        )}
        <a href="/actors" className="glass-card rounded-2xl p-5 group">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 mb-3 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
          </div>
          <div className="font-semibold text-gray-900">Network Registry</div>
          <div className="text-xs text-gray-500 mt-1">Browse participants</div>
        </a>
        <a href={`/verify/new`} onClick={e => { e.preventDefault(); const id = window.prompt('Enter product ID to verify:'); if(id) router.push(`/verify/${encodeURIComponent(id)}`) }}
          className="glass-card rounded-2xl p-5 group cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 mb-3 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <div className="font-semibold text-gray-900">Verify Passport</div>
          <div className="text-xs text-gray-500 mt-1">Audit on-chain ID</div>
        </a>
        <a href="/dashboard/settings" className="glass-card rounded-2xl p-5 group">
          <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 mb-3 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
          </div>
          <div className="font-semibold text-gray-900">Key Management</div>
          <div className="text-xs text-gray-500 mt-1">Rotate DID keys</div>
        </a>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Products */}
        <div className="md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Your Products</h2>
            <span className="text-xs font-semibold bg-gray-200 text-gray-600 px-3 py-1 rounded-full">{products.length} records</span>
          </div>
          {products.length === 0 ? (
            <div className="text-center py-12 glass rounded-3xl">
              <p className="text-gray-500 font-medium">No products issued yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {products.map(p => (
                <a key={p.product_id} href={`/product/${encodeURIComponent(p.product_id)}`}
                  className="flex items-center justify-between bg-white/70 backdrop-blur-sm rounded-2xl border border-gray-200/60 p-4 hover:shadow-lg hover:bg-white transition-all group">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">{p.product_id}</p>
                    <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full primary-gradient-bg"></span>
                      {STAGE_LABELS[p.current_stage] || p.current_stage} 
                      <span className="text-gray-300 mx-1">|</span> 
                      {p.stage_count} verified stage{p.stage_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    {p.has_warning && <span className="text-xs font-bold bg-red-100 text-red-700 px-3 py-1 rounded-full animate-pulse border border-red-200">Attention</span>}
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Activity Log</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8 glass rounded-2xl border-dashed">No recent activity</p>
          ) : (
            <div className="glass rounded-3xl p-5">
              <div className="space-y-4">
                {activity.slice(0, 10).map((e, i) => (
                  <div key={i} className="relative pl-4">
                    <div className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-gray-300"></div>
                    {i !== activity.length - 1 && <div className="absolute left-[3px] top-3 w-[1px] h-full bg-gray-100"></div>}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                        {new Date(e.ts).toLocaleDateString()} {new Date(e.ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${e.event.includes('ISSUED') ? 'bg-green-50 text-green-700 border-green-200' : e.event.includes('REVOKED') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                          {e.event}
                        </span>
                        {e.product_id && (
                          <a href={`/product/${encodeURIComponent(e.product_id)}`} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium truncate max-w-[150px]" title={e.product_id}>
                            {e.product_id.split(':').pop()}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

