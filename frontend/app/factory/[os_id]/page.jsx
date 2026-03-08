'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import api from '../../../lib/api'

export default function FactoryPage() {
  const { os_id } = useParams()
  const [factory, setFactory] = useState(null)
  const [materials, setMaterials] = useState([])
  const [products, setProducts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      api.get(`/factories/${os_id}`),
      api.get(`/suggest-materials/${os_id}`),
      api.get(`/factories/${os_id}/products`),
    ])
      .then(([fr, mr, pr]) => {
        setFactory(fr.data)
        setMaterials(mr.data.suggestions || [])
        setProducts(pr.data)
      })
      .catch(() => setError('Could not load factory data.'))
      .finally(() => setLoading(false))
  }, [os_id])

  if (loading) return <p className="text-gray-500">Loading...</p>
  if (error) return <p className="text-red-600">{error}</p>

  return (
    <div className="max-w-2xl">
      <a href="/" className="text-sm text-blue-600 hover:underline mb-4 inline-block">&larr; Back to factories</a>

      <h1 className="text-2xl font-semibold mb-1">{factory.name}</h1>
      <p className="text-gray-500 text-sm mb-6 font-mono">{factory.os_id}</p>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="font-medium text-sm mb-3">Facility Details</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-500">Address</dt>
          <dd>{factory.address}</dd>
          <dt className="text-gray-500">Country</dt>
          <dd>{factory.country_name || factory.country_code}</dd>
          <dt className="text-gray-500">Sector</dt>
          <dd>{factory.sector}</dd>
          <dt className="text-gray-500">Product Category</dt>
          <dd>{factory.product_category}</dd>
          <dt className="text-gray-500">Facility Type</dt>
          <dd>{factory.facility_type || 'N/A'}</dd>
          <dt className="text-gray-500">Workers</dt>
          <dd>{factory.number_of_workers ?? 'N/A'}</dd>
          <dt className="text-gray-500">Status</dt>
          <dd className={factory.is_closed ? 'text-red-600' : 'text-green-600'}>
            {factory.is_closed ? 'Closed' : 'Active'}
          </dd>
          {factory.lat && (
            <>
              <dt className="text-gray-500">Coordinates</dt>
              <dd className="font-mono text-xs">{factory.lat}, {factory.lng}</dd>
            </>
          )}
        </dl>
      </div>

      {materials.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <h2 className="font-medium text-sm mb-3">Suggested Raw Materials</h2>
          <p className="text-xs text-gray-500 mb-3">
            Based on product category: <strong>{factory.product_category}</strong>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 text-left">
                  <th className="pb-2 font-medium">ID</th>
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 font-medium">Supplier</th>
                  <th className="pb-2 font-medium">Location</th>
                  <th className="pb-2 font-medium pr-1">Cost/Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {materials.map(m => (
                  <tr key={m.raw_material_id} className="hover:bg-gray-50">
                    <td className="py-1.5 font-mono text-gray-500">{m.raw_material_id}</td>
                    <td className="py-1.5 capitalize">{m.description}</td>
                    <td className="py-1.5">{m.supplier}</td>
                    <td className="py-1.5">{m.supplier_location}</td>
                    <td className="py-1.5 pr-1">{m.cost_per_unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <a
          href={`/issue/${factory.os_id}`}
          className="inline-block text-sm bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 transition-colors"
        >
          Issue Birth Certificate
        </a>
      </div>

      {products && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mt-6">
          <h2 className="font-medium text-sm mb-3">
            Issued Credentials
            <span className="ml-2 text-gray-400 font-normal">({products.total})</span>
          </h2>
          {products.total === 0 ? (
            <p className="text-xs text-gray-400">No products issued yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-left">
                    <th className="pb-2 font-medium">Product ID</th>
                    <th className="pb-2 font-medium">Stage Count</th>
                    <th className="pb-2 font-medium">Current Stage</th>
                    <th className="pb-2 font-medium">Issued</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {products.products.map(p => (
                    <tr key={p.product_id} className="hover:bg-gray-50">
                      <td className="py-2 font-mono text-gray-500 pr-3 max-w-[180px] truncate">{p.product_id}</td>
                      <td className="py-2 text-center">{p.stage_count}</td>
                      <td className="py-2">{p.current_stage}</td>
                      <td className="py-2">{p.issued_date || '—'}</td>
                      <td className="py-2">
                        <div className="flex gap-2">
                          <a href={`/product/${p.product_id}`} className="text-blue-600 hover:underline">Timeline</a>
                          <a href={`/verify/${p.product_id}`} className="text-gray-500 hover:underline">Verify</a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
