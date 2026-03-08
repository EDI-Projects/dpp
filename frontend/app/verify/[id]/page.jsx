'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import api, { getStoredActor } from '../../../lib/api'

const TIER_LABELS = { 0: 'Tier 0 Root', 1: 'Tier 1 Verified', 2: 'Tier 2 Dataset-Anchored' }
const TIER_COLORS = { 0: 'bg-red-100 text-red-800', 1: 'bg-blue-100 text-blue-800', 2: 'bg-gray-100 text-gray-700' }
const CONFIDENCE_COLORS = { high: 'text-green-700', medium: 'text-yellow-700', low: 'text-red-600' }

function StatusBadge({ ok }) {
  return ok
    ? <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded font-medium">Valid</span>
    : <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded font-medium">Invalid</span>
}

function TrustSignals({ signals }) {
  const [open, setOpen] = useState(false)
  if (!signals?.field_signals) return null
  const fields = Object.entries(signals.field_signals)
  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <button onClick={() => setOpen(v => !v)} className="text-xs text-gray-400 hover:text-gray-600 underline">
        {open ? 'Hide' : 'Show'} trust signals ({fields.length} fields)
      </button>
      {open && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
          {fields.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-gray-500 capitalize truncate">{k.replace(/_/g, ' ')}</dt>
              <dd className={`${CONFIDENCE_COLORS[v.confidence] || ''} capitalize`}>
                {v.source} · {v.confidence}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

function RevokeButton({ credentialId, onRevoked }) {
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  async function handleRevoke() {
    if (!getStoredActor()) {
      alert('You must sign in first. Use the Sign in selector in the header.')
      return
    }
    if (!window.confirm(`Revoke credential?\n\n${credentialId}\n\nThis cannot be undone.`)) return
    setPending(true)
    try {
      await api.post(`/credentials/${encodeURIComponent(credentialId)}/revoke`, { reason: 'Revoked via UI' })
      setDone(true)
      onRevoked()
    } catch (err) {
      alert(err.response?.data?.detail || 'Revocation failed.')
    } finally {
      setPending(false)
    }
  }

  if (done) return <span className="text-xs text-red-600 font-medium">Revoked</span>
  return (
    <button
      onClick={handleRevoke}
      disabled={pending}
      className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-2 py-0.5 hover:bg-red-50 transition-colors disabled:opacity-50"
    >
      {pending ? 'Revoking…' : 'Revoke'}
    </button>
  )
}

export default function VerifyPage() {
  const { id } = useParams()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  function loadData() {
    setLoading(true)
    setError(null)
    api.get(`/product/${id}/verify`)
      .then(r => setResult(r.data))
      .catch(e => setError(e.response?.data?.detail || 'Verification failed or product not found.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [id])

  if (loading) return <p className="text-gray-500">Verifying…</p>

  return (
    <div className="max-w-2xl">
      <a href="/" className="text-sm text-blue-600 hover:underline mb-4 inline-block">&larr; Back to factories</a>

      <h1 className="text-2xl font-semibold mb-1">Credential Verification</h1>
      <p className="text-xs text-gray-400 font-mono mb-6">{id}</p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      )}

      {result && (
        <>
          <div className={`rounded-lg p-5 border mb-6 ${result.overall_valid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <p className={`font-semibold ${result.overall_valid ? 'text-green-800' : 'text-red-800'}`}>
              {result.overall_valid ? 'All credentials valid' : 'Chain has issues'}
            </p>
            <p className="text-sm text-gray-600 mt-0.5">
              {result.total_credentials} credential{result.total_credentials !== 1 ? 's' : ''} in chain
            </p>
          </div>

          <div className="space-y-3">
            {result.credentials?.map((c, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-sm">{c.stage}</span>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-xs text-gray-400 font-mono truncate max-w-xs">{c.issuer_name || c.issuer}</p>
                      {c.issuer_tier != null && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${TIER_COLORS[c.issuer_tier] || 'bg-gray-100 text-gray-600'}`}>
                          {TIER_LABELS[c.issuer_tier] || `Tier ${c.issuer_tier}`}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-300 font-mono mt-0.5 truncate">{c.issuer}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge ok={c.valid} />
                    {c.credential_id && (
                      <RevokeButton credentialId={c.credential_id} onRevoked={loadData} />
                    )}
                  </div>
                </div>

                {c.checks && (
                  <ul className="mt-2 space-y-1 border-t border-gray-50 pt-2">
                    {Object.entries(c.checks).map(([check, ok]) => (
                      <li key={check} className="flex items-center gap-2 text-xs">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className={`capitalize ${ok ? 'text-gray-600' : 'text-red-600 font-medium'}`}>
                          {check.replace(/_/g, ' ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {c.errors?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {c.errors.map((e, j) => (
                      <li key={j} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">{e}</li>
                    ))}
                  </ul>
                )}

                <TrustSignals signals={c.trust_signals} />

                {c.credential_id && (
                  <p className="mt-2 text-xs text-gray-300 font-mono truncate border-t border-gray-50 pt-2">
                    {c.credential_id}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4">
            <a href={`/product/${id}`} className="text-sm text-blue-600 hover:underline">
              View full lifecycle timeline &rarr;
            </a>
          </div>
        </>
      )}
    </div>
  )
}