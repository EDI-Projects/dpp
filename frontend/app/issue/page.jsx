'use client'

import { useEffect, useState } from 'react'
import api from '../../lib/api'

export default function IssueRegistryPage() {
  const [factories, setFactories] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/factories')
      .then(r => setFactories(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = factories.filter(f => 
    f.name.toLowerCase().includes(search.toLowerCase()) || 
    f.os_id.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="text-center py-20 text-gray-500 font-medium">Loading valid factories...</div>

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-2">Issue New Product Passport</h1>
        <p className="text-base text-gray-500">Select an authorized factory from the registry to issue a Birth Certificate.</p>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by Factory Name or OS-ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full glass border border-gray-200 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filtered.map(f => (
          <a key={f.os_id} href={`/issue/${f.os_id}`} className="glass-card rounded-2xl p-5 hover:shadow-lg transition-all group border border-gray-100 block cursor-pointer">
            <div className="flex items-start justify-between mb-3">
              <h2 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{f.name}</h2>
              <span className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-semibold">{f.sector}</span>
            </div>
            <p className="text-xs text-gray-500 mb-4 h-8 overflow-hidden">{f.address}</p>
            <div className="flex justify-between items-center border-t border-gray-100 pt-3">
              <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">{f.os_id}</span>
              <span className="text-sm font-semibold text-indigo-600 group-hover:translate-x-1 transition-transform">Issue →</span>
            </div>
          </a>
        ))}
      </div>
      
      {filtered.length === 0 && (
        <div className="text-center py-10 text-gray-500">No structured factories found matching your search.</div>
      )}
    </div>
  )
}
