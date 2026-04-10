'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import api, { getStoredActor } from '../../../../lib/api'

const ELEVATED_REVOKE_ROLES = new Set(['tier0_root', 'tier1_regulator'])

function canRevoke(actor, credentialIssuerId) {
  if (!actor) return false
  if (ELEVATED_REVOKE_ROLES.has(actor?.role)) return true
  return actor?.did === credentialIssuerId
}

function CheckRow({ name, ok, detail }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg ${ok ? 'bg-green-50' : 'bg-red-50'}`}>
      <span className={`w-4 h-4 rounded-full shrink-0 mt-0.5 ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      <div>
        <p className={`text-sm font-medium capitalize ${ok ? 'text-green-800' : 'text-red-800'}`}>
          {name.replace(/_/g, ' ')}
        </p>
        {detail && <p className="text-xs text-gray-500 mt-0.5">{detail}</p>}
      </div>
      <span className={`ml-auto text-xs font-bold ${ok ? 'text-green-700' : 'text-red-700'}`}>
        {ok ? 'PASS' : 'FAIL'}
      </span>
    </div>
  )
}

function RevokePanel({ cred, actor, onRevoked }) {
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  if (!canRevoke(actor, cred?.issuer)) return null
  if (done) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
      <p className="text-red-800 font-semibold">Credential Revoked</p>
    </div>
  )

  return (
    <div className="bg-white border border-red-200 rounded-xl p-4">
      <h3 className="font-semibold text-red-800 mb-3">Revoke Credential</h3>
      <input
        value={reason} onChange={e => setReason(e.target.value)}
        placeholder="Reason for revocation (optional)"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-red-400"
      />
      <button
        disabled={pending}
        onClick={async () => {
          if (!window.confirm('Revoke this credential? This action cannot be undone.')) return
          setPending(true)
          try {
            await api.post(`/credentials/${encodeURIComponent(cred.credential_id)}/revoke`, { reason: reason || 'Revoked by auditor' })
            setDone(true)
            onRevoked?.()
          } catch (err) {
            alert(err.response?.data?.detail || 'Revocation failed.')
          } finally {
            setPending(false)
          }
        }}
        className="w-full bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
      >
        {pending ? 'Revoking…' : 'Revoke credential'}
      </button>
    </div>
  )
}

export default function AuditPage() {
  const { id } = useParams()
  const [actor, setActor]     = useState(null)
  const [verifyData, setVerify] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const isProductId = !id?.includes('urn:')

  useEffect(() => { setActor(getStoredActor()) }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/product/${encodeURIComponent(isProductId ? id : id)}/verify`)
      setVerify(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Could not load audit data for this ID.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [id])

  if (loading) return (
    <div className="max-w-2xl mx-auto mt-16 text-center">
      <p className="text-gray-500">Loading audit data…</p>
    </div>
  )

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap gap-4 mb-4">
        <a href="/dashboard" className="text-sm text-blue-600 hover:underline">← Dashboard</a>
        <a href={`/verify/${encodeURIComponent(id)}`} className="text-sm text-blue-600 hover:underline">← Product Passport</a>
        <a href={`/product/${encodeURIComponent(id)}`} className="text-sm text-blue-600 hover:underline">← Lifecycle Timeline</a>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Technical Audit Report</h1>
      <p className="text-xs text-gray-400 font-mono mb-6 break-all">{id}</p>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm mb-6">{error}</div>
      )}

      {verifyData && (
        <div className="space-y-6">
          {/* Summary */}
          <div className={`rounded-xl p-5 border ${verifyData.overall_valid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-3">
              <div>
                <p className={`font-bold ${verifyData.overall_valid ? 'text-green-800' : 'text-red-800'}`}>
                  {verifyData.overall_valid ? 'Credential chain VALID' : 'Credential chain INVALID'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {verifyData.total_credentials} credential{verifyData.total_credentials !== 1 ? 's' : ''} ·
                  Verified at {new Date().toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* EU Compliance note */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            <p className="font-semibold mb-1">EU ESPR Compliance (Ecodesign for Sustainable Products Regulation)</p>
            <ul className="space-y-1 text-xs">
              <li className={verifyData.overall_valid ? 'text-green-700' : 'text-red-600'}>
                {verifyData.overall_valid ? '✓' : '✗'} Verifiable credential chain integrity
              </li>
              <li className="text-blue-700">ℹ Issuer accreditation status: See individual credentials below</li>
              <li className="text-blue-700">ℹ Product traceability: {verifyData.total_credentials} lifecycle stages recorded</li>
            </ul>
          </div>

          {/* Per-credential breakdown */}
          {verifyData.credentials?.map((c, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{c.stage}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{c.issuer_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {c.issuer_tier != null && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Tier {c.issuer_tier}</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${c.valid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {c.valid ? 'VALID' : 'INVALID'}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-400 font-mono mt-2 break-all">{c.issuer}</p>
                {c.credential_id && <p className="text-xs text-gray-300 font-mono mt-0.5 break-all">{c.credential_id}</p>}
              </div>

              <div className="px-5 py-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Verification Checks</p>
                {c.checks && Object.entries(c.checks).map(([check, ok]) => (
                  <CheckRow key={check} name={check} ok={ok} />
                ))}
              </div>

              {/* IPFS + Polygon anchoring details */}
              {(c.ipfs_cid || c.tx_hash || c.polygon_anchor) && (
                <div className="px-5 pb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">On-Chain Anchoring</p>
                  <div className="space-y-2">
                    {c.ipfs_cid && (
                      <div className="flex items-center gap-2 bg-blue-50 rounded-lg p-3">
                        <span className="text-xs text-gray-500 shrink-0">IPFS CID:</span>
                        <a href={`https://gateway.pinata.cloud/ipfs/${c.ipfs_cid}`}
                           target="_blank" rel="noopener noreferrer"
                           className="text-xs text-blue-600 hover:underline font-mono truncate">
                          {c.ipfs_cid}
                        </a>
                      </div>
                    )}
                    {c.tx_hash && (
                      <div className="flex items-center gap-2 bg-purple-50 rounded-lg p-3">
                        <span className="text-xs text-gray-500 shrink-0">Polygon Tx:</span>
                        <a href={`https://amoy.polygonscan.com/tx/${c.tx_hash}`}
                           target="_blank" rel="noopener noreferrer"
                           className="text-xs text-purple-600 hover:underline font-mono truncate">
                          {c.tx_hash}
                        </a>
                      </div>
                    )}
                    {c.polygon_anchor && (
                      <div className={`rounded-lg p-3 ${c.polygon_anchor.revoked ? 'bg-red-50' : 'bg-green-50'}`}>
                        <p className="text-xs font-medium">
                          {c.polygon_anchor.revoked
                            ? `⚠️ Revoked on-chain: ${c.polygon_anchor.revoke_reason || 'No reason provided'}`
                            : `✅ Anchored on-chain at block timestamp ${c.polygon_anchor.anchored_at}`
                          }
                        </p>
                        {c.polygon_anchor.ipfs_cid && c.ipfs_cid && c.polygon_anchor.ipfs_cid !== c.ipfs_cid && (
                          <p className="text-xs text-red-600 font-bold mt-1">
                            🚨 CID MISMATCH: On-chain CID ({c.polygon_anchor.ipfs_cid}) differs from local ({c.ipfs_cid})
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Trust signals */}
              {c.trust_signals?.field_signals && (
                <div className="px-5 pb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Trust Signals</p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {Object.entries(c.trust_signals.field_signals).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-xs text-gray-400 capitalize">{k.replace(/_/g, ' ')}</dt>
                        <dd className={`text-xs font-medium capitalize ${v.confidence === 'high' ? 'text-green-700' : v.confidence === 'medium' ? 'text-yellow-700' : 'text-red-600'}`}>
                          {v.source} · {v.confidence}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {/* Revoke panel */}
              {c.credential_id && (
                <div className="px-5 pb-5">
                  <RevokePanel cred={c} actor={actor} onRevoked={loadData} />
                </div>
              )}
            </div>
          ))}

          <div className="text-sm text-gray-400">
            <a href={`/verify/${encodeURIComponent(id)}`} className="text-blue-600 hover:underline">
              View consumer-facing report →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
