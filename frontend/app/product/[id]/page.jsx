'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import api from '../../../lib/api'

const STAGE_COLORS = {
  'Birth Certificate': 'border-blue-400 bg-blue-50/50',
  'Material Sourcing': 'border-emerald-400 bg-emerald-50/50',
  'Certification': 'border-amber-400 bg-amber-50/50',
  'Custody Transfer': 'border-purple-400 bg-purple-50/50',
  'Ownership': 'border-pink-400 bg-pink-50/50',
  'Repair': 'border-orange-400 bg-orange-50/50',
  'End of Life': 'border-gray-400 bg-gray-50/50',
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
  const colorClass = STAGE_COLORS[label] || 'border-gray-300 bg-gray-50/50'

  return (
    <div className={`border-l-4 rounded-xl p-5 shadow-sm backdrop-blur-sm transition-all hover:shadow-md ${colorClass}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-900">{label}</span>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-white/60 px-2 py-1 rounded"
        >
          {expanded ? 'Hide JSON' : 'View Payload'}
        </button>
      </div>
      
      <p className="text-xs font-medium text-gray-500 mb-0.5">
        Issued on {new Date(vc?.issuanceDate).toLocaleString()}
      </p>
      <p className="text-xs text-gray-400 font-mono break-all bg-white/40 px-1.5 py-0.5 rounded inline-block">By: {vc?.issuer}</p>

      {vc?.credentialSubject && (
        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs bg-white/60 p-3 rounded-xl border border-black/5">
          {Object.entries(vc.credentialSubject).map(([k, v]) => {
            if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
              return Object.entries(v).map(([sk, sv]) => (
                typeof sv !== 'object' && (
                  <div key={`${k}.${sk}`} className="flex flex-col">
                    <dt className="text-gray-400 capitalize font-medium mb-0.5 pl-2 border-l border-gray-300">↳ {k.replace(/_/g, ' ')} {sk.replace(/_/g, ' ')}</dt>
                    <dd className="font-semibold text-gray-800 truncate pl-3">{String(sv)}</dd>
                  </div>
                )
              ))
            }
            return (
              <div key={k} className="flex flex-col">
                <dt className="text-gray-500 capitalize font-medium mb-0.5">{k.replace(/_/g, ' ')}</dt>
                <dd className="font-semibold text-gray-800 truncate">{String(v)}</dd>
              </div>
            )
          })}
        </dl>
      )}

      {/* IPFS + Polygon anchoring */}
      {(entry.ipfs_cid || entry.tx_hash) && (
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-wider">
          {entry.ipfs_cid && (
            <a href={`https://gateway.pinata.cloud/ipfs/${entry.ipfs_cid}`}
               target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-50 text-cyan-700 hover:bg-cyan-100 border border-cyan-200 transition-colors shadow-sm">
               <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
              IPFS Pinned
            </a>
          )}
          {entry.tx_hash && (
            <a href={`https://amoy.polygonscan.com/tx/${entry.tx_hash}`}
               target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors shadow-sm">
               <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Polygon Anchor
            </a>
          )}
        </div>
      )}

      {expanded && (
        <pre className="mt-4 text-xs bg-gray-900 border border-black rounded-xl p-4 overflow-auto max-h-64 whitespace-pre-wrap text-green-400 font-mono shadow-inner">
          {JSON.stringify(vc, null, 2)}
        </pre>
      )}
    </div>
  )
}

export default function ProductPage() {
  const { id } = useParams()
  const decodedId = decodeURIComponent(id)
  const [lifecycle, setLifecycle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get(`/product/${decodedId}/lifecycle`)
      .then(r => setLifecycle(r.data))
      .catch((err) => {
        if (err.response?.status === 404) {
          setError('Product Lifecycle Not Found')
        } else {
          setError('Failed to load lifecycle data.')
        }
      })
      .finally(() => setLoading(false))
  }, [decodedId])

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="animate-spin w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full mb-4"></div>
      <p className="text-gray-500 font-medium">Tracing Product Provenance...</p>
    </div>
  )
  
  if (error) return (
    <div className="max-w-2xl mx-auto flex flex-col items-center justify-center py-24 glass-card rounded-3xl mt-10">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">{error}</h2>
      <p className="text-gray-500 text-center max-w-md mb-6">We could not find any on-chain or off-chain records for <span className="font-mono text-xs break-all bg-gray-100 px-1">{decodedId}</span></p>
      <a href="/dashboard" className="primary-gradient-bg text-white px-5 py-2.5 rounded-xl font-semibold hover:shadow-lg transition-shadow">Return to Dashboard</a>
    </div>
  )

  const entries = lifecycle?.lifecycle || []

  return (
    <div className="max-w-3xl mx-auto">
      <a href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 mb-6 bg-indigo-50 px-3 py-1.5 rounded-full transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        Back to Dashboard
      </a>

      <div className="flex flex-col md:flex-row md:items-start justify-between pb-6 border-b border-gray-200 mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold mb-2 tracking-tight">Lifecycle Traceability</h1>
          <p className="text-xs text-gray-500 font-mono bg-white border border-gray-200 px-2 py-1 rounded inline-block shadow-sm break-all">{decodedId}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <a
            href={`/product/${encodeURIComponent(decodedId)}/add-stage`}
            className="text-sm shadow-md shadow-indigo-500/20 primary-gradient-bg text-white rounded-xl px-4 py-2 hover:shadow-lg transition-all font-semibold flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Stage
          </a>
          <a
            href={`/verify/${encodeURIComponent(decodedId)}`}
            className="text-sm bg-white border border-gray-200 shadow-sm text-gray-700 rounded-xl px-4 py-2 hover:bg-gray-50 transition-colors font-semibold flex items-center gap-1.5"
          >
            <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Verify Cryptography
          </a>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-16 glass rounded-3xl">
          <p className="text-gray-500 font-bold text-lg">Identity exists, but no events are recorded.</p>
          <p className="text-gray-400 mt-2">Be the first to issue a stage to this ledger via "Add Stage".</p>
        </div>
      ) : (
        <div className="relative pl-6 sm:pl-8">
          <div className="absolute left-3.5 sm:left-5 top-4 bottom-4 w-1 bg-gradient-to-b from-indigo-100 via-purple-100 to-transparent rounded-full shadow-inner" />
          
          <div className="flex flex-col gap-8">
            {entries.map((entry, i) => (
              <div key={i} className="relative group">
                <div className="absolute -left-[30px] sm:-left-[35px] top-4 w-8 h-8 rounded-full primary-gradient-bg flex items-center justify-center text-xs text-white font-black shadow-md z-10 ring-4 ring-gray-50 group-hover:scale-110 transition-transform">
                  {i + 1}
                </div>
                <div className="ml-2 pb-2">
                  <CredentialCard entry={entry} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
