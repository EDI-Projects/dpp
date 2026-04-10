'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '../../../lib/api'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Map raw VC type names to consumer-friendly labels */
const STAGE_LABELS = {
  ProductBirthCertificate:    'Manufactured',
  MaterialSourcingCredential: 'Materials Sourced',
  CertificationCredential:    'Certified',
  CustodyTransferCredential:  'Shipped',
  OwnershipCredential:        'Received by Retailer',
  RepairCredential:           'Repaired',
  EndOfLifeCredential:        'Recycled',
}

/** Extract a short, jargon-free summary from a credentialSubject */
function summarise(vcType, subject = {}) {
  switch (vcType) {
    case 'ProductBirthCertificate':
      return [subject.manufacturer?.name, subject.manufacturer?.country, subject.manufacture_date]
        .filter(Boolean).join(' · ') || 'Factory record'
    case 'MaterialSourcingCredential':
      return [subject.raw_material || subject.raw_material_id, subject.origin_country]
        .filter(Boolean).join(' from ') || 'Material record'
    case 'CertificationCredential':
      return [subject.certifying_body, subject.certification_standard]
        .filter(Boolean).join(' · ') || 'Certification record'
    case 'CustodyTransferCredential': {
      const route = [subject.from_city || subject.from_actor_name, subject.to_city || subject.to_actor_name]
        .filter(Boolean).join(' → ')
      const co2 = subject.carbon_emissions_kg != null ? `${subject.carbon_emissions_kg} kg CO2` : null
      return [route, co2].filter(Boolean).join('  ·  ') || 'Shipping record'
    }
    case 'OwnershipCredential':
      return subject.country_of_use ? `In use in ${subject.country_of_use}` : 'Ownership record'
    case 'RepairCredential':
      return [subject.service_type, subject.service_provider].filter(Boolean).join(' by ') || 'Repair record'
    case 'EndOfLifeCredential':
      return [subject.recycling_method, subject.recycler_name, subject.recycler_country]
        .filter(Boolean).join(' · ') || 'End-of-life record'
    default:
      return vcType || 'Record'
  }
}

/** Extract all interesting detail rows from credentialSubject */
function detailRows(vcType, subject = {}) {
  const skip = new Set(['product_id', 'id'])
  return Object.entries(subject)
    .filter(([k]) => !skip.has(k) && subject[k] != null && subject[k] !== '')
    .map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: String(v) }))
}

/** Trust colour coding */
function trustLevel(cred) {
  const checks = cred.checks || {}
  const allPass = Object.values(checks).every(Boolean)
  if (!allPass) return 'fail'
  return cred.issuer_tier <= 1 ? 'verified' : 'self'
}

const TRUST_STYLE = {
  verified: { bar: 'bg-green-500',  badge: 'bg-green-100 text-green-800', dot: '🟢', label: 'Independently certified' },
  self:     { bar: 'bg-blue-400',   badge: 'bg-blue-100 text-blue-800',   dot: '🔵', label: 'Self-reported'          },
  fail:     { bar: 'bg-red-400',    badge: 'bg-red-100 text-red-800',     dot: '🔴', label: 'Verification failed'     },
}

// ── Sub-components ─────────────────────────────────────────────────────────

function TamperAlert({ credentials }) {
  const failed = credentials.filter(c => trustLevel(c) === 'fail')
  if (!failed.length) return null
  return (
    <div className="rounded-xl border border-red-300 bg-red-50 p-4 mb-6 flex gap-3">
      <div>
        <p className="font-semibold text-red-800">Verification failure detected</p>
        <p className="text-sm text-red-700 mt-1">
          {failed.length} step{failed.length > 1 ? 's' : ''} in this product&apos;s journey could not be verified.
          The data may have been altered. Do not rely on this product's claims.
        </p>
        <ul className="mt-2 space-y-0.5">
          {failed.map((c, i) => (
            <li key={i} className="text-xs text-red-700">
              • {STAGE_LABELS[c.stage] || c.stage || 'Unknown step'} — {Object.entries(c.checks || {}).filter(([, v]) => !v).map(([k]) => k.replace(/_/g,' ')).join(', ')}
            </li>
          ))}
        </ul>
        <Link href={`/dashboard/audit/${failed[0]?.credential_id || ''}`} className="mt-2 inline-block text-xs text-red-700 underline">
          View auditor report →
        </Link>
      </div>
    </div>
  )
}

function StepCard({ cred, lifecycleEntry, index, total }) {
  const [expanded, setExpanded] = useState(false)
  const trust  = trustLevel(cred)
  const style  = TRUST_STYLE[trust]
  const vcType = cred.type || cred.stage
  const label  = STAGE_LABELS[vcType] || vcType || 'Step'
  const subj   = lifecycleEntry?.credential?.credentialSubject || {}
  const summary     = summarise(vcType, subj)
  const details     = detailRows(vcType, subj)
  const isLast      = index === total - 1

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0 pt-1">
        <div className={`w-3 h-3 rounded-full border-2 border-white ring-2 ${trust === 'fail' ? 'ring-red-400 bg-red-400' : trust === 'verified' ? 'ring-green-500 bg-green-500' : 'ring-blue-400 bg-blue-400'}`} />
        {!isLast && <div className="w-0.5 flex-1 bg-gray-200 mt-1" />}
      </div>
      <div className={`flex-1 mb-4 rounded-xl border ${trust === 'fail' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'} overflow-hidden`}>
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-gray-900">{label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
                  {style.dot} {style.label}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{summary}</p>
              {cred.issuer_name && <p className="text-xs text-gray-400 mt-0.5">By {cred.issuer_name}</p>}
            </div>
            <span className="text-gray-400 shrink-0 text-sm mt-1">{expanded ? '▲' : '▼'}</span>
          </div>
        </button>
        {expanded && (
          <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-4">
            {details.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                {details.map(({ label: l, value: v }) => (
                  <div key={l} className="contents">
                    <dt className="text-xs text-gray-400 capitalize">{l}</dt>
                    <dd className="text-xs text-gray-700 font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {/* IPFS + Polygon anchoring info */}
            {(cred.ipfs_cid || cred.tx_hash || cred.polygon_anchor) && (
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-600">🔗 On-chain anchoring</p>
                {cred.ipfs_cid && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">IPFS:</span>
                    <a href={`https://gateway.pinata.cloud/ipfs/${cred.ipfs_cid}`}
                       target="_blank" rel="noopener noreferrer"
                       className="text-xs text-blue-600 hover:underline font-mono truncate">
                      {cred.ipfs_cid}
                    </a>
                  </div>
                )}
                {cred.tx_hash && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">Polygon:</span>
                    <a href={`https://amoy.polygonscan.com/tx/${cred.tx_hash}`}
                       target="_blank" rel="noopener noreferrer"
                       className="text-xs text-purple-600 hover:underline font-mono truncate">
                      {cred.tx_hash.slice(0, 10)}…{cred.tx_hash.slice(-8)}
                    </a>
                  </div>
                )}
                {cred.checks?.polygon_verified != null && (
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-medium ${cred.checks.polygon_verified ? 'text-green-700' : 'text-red-600'}`}>
                      {cred.checks.polygon_verified ? 'On-chain verified' : 'On-chain mismatch'}
                    </span>
                  </div>
                )}
              </div>
            )}
            {trust === 'fail' && cred.checks && (
              <div>
                <p className="text-xs font-semibold text-red-700 mb-1">Failed checks</p>
                <ul className="space-y-1">
                  {Object.entries(cred.checks).filter(([,ok]) => !ok).map(([check]) => (
                    <li key={check} className="text-xs text-red-600 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                      {check.replace(/_/g, ' ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {cred.credential_id && (
              <a href={`/dashboard/audit/${encodeURIComponent(cred.credential_id)}`}
                className="text-xs text-gray-400 hover:text-blue-600 underline block">
                View full technical audit →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function VerifyPage() {
  const { id } = useParams()
  const [verifyData, setVerifyData]       = useState(null)
  const [lifecycleData, setLifecycleData] = useState(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [vRes, lRes] = await Promise.all([
        api.get(`/product/${id}/verify`),
        api.get(`/product/${id}/lifecycle`).catch(() => ({ data: { lifecycle: [] } })),
      ])
      setVerifyData(vRes.data)
      setLifecycleData(lRes.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Verification failed or product not found.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [id])

  if (loading) return (
    <div className="max-w-lg mx-auto mt-16 text-center">
      <div className="text-4xl mb-3 animate-pulse">🔍</div>
      <p className="text-gray-500">Checking product records…</p>
    </div>
  )

  const creds     = verifyData?.credentials || []
  const lifecycle = lifecycleData?.lifecycle || []
  const allValid  = verifyData?.overall_valid

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <Link href="/" className="text-sm text-blue-600 hover:underline mb-4 inline-block">&larr; Back to factories</Link>
        <h1 className="text-2xl font-bold text-gray-900">Product Passport</h1>
        <p className="text-sm text-gray-500 mt-1 font-mono truncate">{id}</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm mb-6">{error}</div>
      )}

      {verifyData && (
        <>
          <div className={`rounded-xl p-5 border mb-6 ${allValid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-3">
              <div>
                <p className={`font-bold text-lg ${allValid ? 'text-green-800' : 'text-red-800'}`}>
                  {allValid ? 'Authentic product' : 'Verification issues found'}
                </p>
                <p className={`text-sm mt-0.5 ${allValid ? 'text-green-700' : 'text-red-700'}`}>
                  {allValid
                    ? `${creds.length} step${creds.length !== 1 ? 's' : ''} in this product's journey are verified.`
                    : 'One or more records could not be verified. See details below.'}
                </p>
              </div>
            </div>
            <div className={`mt-4 pt-4 border-t ${allValid ? 'border-green-200' : 'border-red-200'} flex flex-wrap gap-4 text-xs text-gray-600`}>
              {Object.values(TRUST_STYLE).map(s => (
                <span key={s.label}>{s.dot} {s.label}</span>
              ))}
            </div>
          </div>

          <TamperAlert credentials={creds} />

          {creds.length > 0 && (
            <div className="mb-6">
              <h2 className="font-semibold text-gray-700 mb-4">Product Journey</h2>
              {creds.map((c, i) => (
                <StepCard key={i} cred={c} lifecycleEntry={lifecycle[i]} index={i} total={creds.length} />
              ))}
            </div>
          )}

          <div className="text-sm text-gray-400 flex flex-wrap gap-4">
            <Link href={`/product/${id}`} className="text-blue-600 hover:underline">View full timeline →</Link>
            <Link href={`/dashboard/audit/${encodeURIComponent(id)}`} className="hover:underline">Technical audit report</Link>
          </div>
        </>
      )}
    </div>
  )
}