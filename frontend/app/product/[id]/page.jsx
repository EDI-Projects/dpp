'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import api from '../../../lib/api'


const STAGE_COLORS = {
  'Birth Certificate': 'border-blue-400 bg-blue-50',
  'Material Sourcing': 'border-green-400 bg-green-50',
  'Certification': 'border-yellow-400 bg-yellow-50',
  'Custody Transfer': 'border-purple-400 bg-purple-50',
  'Ownership': 'border-pink-400 bg-pink-50',
  'Repair': 'border-orange-400 bg-orange-50',
  'End of Life': 'border-gray-400 bg-gray-50',
}

function getStageLabel(vcType) {
  if (!vcType) return 'Unknown'
  if (vcType.includes('BirthCertificate')) return 'Birth Certificate'
  if (vcType.includes('MaterialSourcing')) return 'Material Sourcing'
  if (vcType.includes('Certification')) return 'Certification'
  if (vcType.includes('CustodyTransfer')) return 'Custody Transfer'
  if (vcType.includes('Ownership')) return 'Ownership'
  if (vcType.includes('Repair')) return 'Repair'
  if (vcType.includes('EndOfLife')) return 'End of Life'
  return vcType
}

function CredentialCard({ entry }) {
  const [expanded, setExpanded] = useState(false)
  const vc = entry.credential
  const types = Array.isArray(vc?.type) ? vc.type : [vc?.type]
  const vcLabel = getStageLabel(types[types.length - 1])
  const label = (vcLabel !== 'Unknown' ? vcLabel : null) || entry.stage || 'Unknown'
  const colorClass = STAGE_COLORS[label] || 'border-gray-300 bg-gray-50'

  return (
    <div className={`border-l-4 rounded-lg p-4 ${colorClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-medium text-sm">{label}</span>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs text-gray-500 hover:text-gray-700 underline shrink-0"
        >
          {expanded ? 'Hide' : 'Raw JSON'}
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        Issued: {new Date(vc?.issuanceDate).toLocaleString()}
      </p>
      <p className="text-xs text-gray-500 font-mono">Issuer: {vc?.issuer}</p>

      {vc?.credentialSubject && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {Object.entries(vc.credentialSubject).map(([k, v]) => (
            typeof v !== 'object' && (
              <div key={k} className="contents">
                <dt className="text-gray-500 capitalize">{k.replace(/_/g, ' ')}</dt>
                <dd className="truncate">{String(v)}</dd>
              </div>
            )
          ))}
        </dl>
      )}

      {expanded && (
        <pre className="mt-3 text-xs bg-white border border-gray-200 rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap text-gray-700">
          {JSON.stringify(vc, null, 2)}
        </pre>
      )}
    </div>
  )
}

export default function ProductPage() {
  const { id } = useParams()
  const [lifecycle, setLifecycle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get(`/product/${id}/lifecycle`)
      .then(r => setLifecycle(r.data))
      .catch(() => setError('Product not found or no lifecycle data available.'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="text-gray-500">Loading...</p>
  if (error) return <p className="text-red-600">{error}</p>

  const entries = lifecycle?.lifecycle || []

  return (
    <div className="max-w-2xl">
      <a href="/" className="text-sm text-blue-600 hover:underline mb-4 inline-block">&larr; Back to factories</a>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Lifecycle Timeline</h1>
          <p className="text-xs text-gray-400 font-mono">{id}</p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/product/${id}/add-stage`}
            className="text-sm bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 transition-colors"
          >
            + Add Stage
          </a>
          <a
            href={`/verify/${id}`}
            className="text-sm bg-white border border-gray-300 text-gray-700 rounded px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            Verify Chain
          </a>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-gray-500">No lifecycle events recorded yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map((entry, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-xs text-white font-bold shrink-0">
                  {i + 1}
                </div>
                {i < entries.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 mt-1" />}
              </div>
              <div className="flex-1 pb-4">
                <CredentialCard entry={entry} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
