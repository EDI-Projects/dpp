'use client'

import { useEffect, useState } from 'react'
import api from '../lib/api'

const SECTOR_COLORS = {
  'Apparel': 'bg-purple-100 text-purple-800',
  'Footwear': 'bg-blue-100 text-blue-800',
  'Pharmaceuticals': 'bg-green-100 text-green-800',
  'Food & Agriculture': 'bg-yellow-100 text-yellow-800',
  'Home Textiles': 'bg-pink-100 text-pink-800',
  'Automotive': 'bg-red-100 text-red-800',
  'Industrial Materials': 'bg-gray-100 text-gray-800',
  'General Goods': 'bg-orange-100 text-orange-800',
}

function Badge({ label }) {
  const cls = SECTOR_COLORS[label] || 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

export default function FactoriesPage() {
  const [factories, setFactories] = useState([])
  const [filtered, setFiltered] = useState([])
  const [search, setSearch] = useState('')
  const [sector, setSector] = useState('All')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/factories')
      .then(r => {
        setFactories(r.data)
        setFiltered(r.data)
      })
      .catch(() => setError('Failed to load factories. Is the backend running?'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    let result = factories
    if (sector !== 'All') {
      result = result.filter(f => f.product_category === sector)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        f => f.name.toLowerCase().includes(q) || f.os_id.toLowerCase().includes(q) || f.address.toLowerCase().includes(q)
      )
    }
    setFiltered(result)
  }, [search, sector, factories])

  const sectors = ['All', ...new Set(factories.map(f => f.product_category).filter(Boolean))]

  if (loading) return <p className="text-gray-500">Loading factories...</p>
  if (error) return <p className="text-red-600">{error}</p>

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Factories</h1>
      <p className="text-gray-500 text-sm mb-6">{factories.length} facilities loaded from Open Supply Hub data</p>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          placeholder="Search by name, ID or address..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={sector}
          onChange={e => setSector(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {sectors.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <p className="text-xs text-gray-400 mb-4">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(f => (
          <div key={f.os_id} className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-2 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-medium text-sm leading-snug">{f.name}</h2>
              {f.is_closed && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded shrink-0">Closed</span>}
            </div>
            <p className="text-xs text-gray-500 truncate">{f.address}</p>
            <div className="flex flex-wrap gap-1">
              <Badge label={f.product_category} />
              {f.facility_type && (
                <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-50 text-gray-600 border border-gray-200">
                  {f.facility_type}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 font-mono">{f.os_id}</p>
            <div className="mt-auto pt-2 flex gap-2">
              <a
                href={`/factory/${f.os_id}`}
                className="flex-1 text-center text-sm font-semibold primary-gradient-bg text-white rounded-xl px-4 py-2 hover:shadow-lg transition-all"
              >
                View Factory Registration
              </a>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-gray-400 text-sm mt-8 text-center">No factories match your search.</p>
      )}
    </div>
  )
}
