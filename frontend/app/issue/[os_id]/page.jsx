'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import api, { getStoredActor } from '../../../lib/api'

// Roles allowed to issue birth certificates (matches backend ROLE_PERMISSIONS)
const BIRTH_CERT_ROLES = new Set(['tier0_root', 'tier1_regulator', 'tier2_factory'])

export default function IssuePage() {
  const { os_id } = useParams()
  const [factory, setFactory] = useState(null)
  const [actor, setActor] = useState(null)
  const [credential, setCredential] = useState(null)
  const [loading, setLoading] = useState(true)
  const [issuing, setIssuing] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { setActor(getStoredActor()) }, [])

  useEffect(() => {
    api.get(`/factories/${os_id}`)
      .then(r => setFactory(r.data))
      .catch(() => setError('Factory not found.'))
      .finally(() => setLoading(false))
  }, [os_id])

  const canIssue = actor && BIRTH_CERT_ROLES.has(actor.role)

  async function issueCredential() {
    setIssuing(true)
    setError(null)
    try {
      const r = await api.post(`/issue-birth-certificate/${os_id}`)
      setCredential(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to issue credential.')
    } finally {
      setIssuing(false)
    }
  }

  if (loading) return <p className="text-gray-500">Loading...</p>
  if (error && !factory) return <p className="text-red-600">{error}</p>

  return (
    <div className="max-w-3xl mx-auto">
      <a href="/issue" className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 mb-6 bg-indigo-50 px-3 py-1.5 rounded-full transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        Back to Factory Selection
      </a>

      <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-2">Issue Passport Configuration</h1>
      {factory && (
        <p className="text-gray-500 text-sm mb-6 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          {factory.name} <span className="text-gray-300">|</span> {factory.address}
        </p>
      )}

      {!actor ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8 text-sm text-amber-800 shadow-sm flex items-start gap-3">
          <svg className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          <div>
            You must <strong className="font-bold">sign in</strong> before issuing credentials. Head over to the <a href="/login" className="underline text-indigo-600">Login</a> screen.
          </div>
        </div>
      ) : !canIssue ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-8 text-sm text-red-800 shadow-sm flex items-start gap-3">
          <svg className="w-5 h-5 shrink-0 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <div>
            Your role <strong className="font-bold">{actor.role}</strong> cannot issue birth certificates.<br/>
            Sign in as a strict <strong>Factory</strong>, <strong>Regulator</strong>, or <strong>Root Authority</strong> tier.
          </div>
        </div>
      ) : (
        <div className="glass shadow-sm rounded-xl p-4 mb-8 text-sm text-gray-700 border border-gray-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full primary-gradient-bg flex items-center justify-center text-white shadow-inner">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            </div>
            <span className="font-bold text-gray-900">{actor.name}</span>
          </div>
          <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold border border-indigo-200 uppercase tracking-widest">{actor.role.replace('tier2_', '').replace('tier1_', '').replace('tier0_', '')} Access</span>
        </div>
      )}

      {factory && !credential && (
        <div className="glass-card rounded-3xl p-6 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Automated Extraction Payload
          </h2>
          <div className="bg-white/60 rounded-xl p-4 border border-gray-100 mb-6">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="flex flex-col"><dt className="text-gray-400 font-medium text-xs uppercase tracking-wider mb-0.5">Facility OS-ID</dt><dd className="font-mono text-gray-800 font-semibold">{factory.os_id}</dd></div>
              <div className="flex flex-col"><dt className="text-gray-400 font-medium text-xs uppercase tracking-wider mb-0.5">Category</dt><dd className="font-semibold text-gray-800">{factory.product_category}</dd></div>
              <div className="flex flex-col"><dt className="text-gray-400 font-medium text-xs uppercase tracking-wider mb-0.5">Sector</dt><dd className="font-semibold text-gray-800">{factory.sector}</dd></div>
              <div className="flex flex-col"><dt className="text-gray-400 font-medium text-xs uppercase tracking-wider mb-0.5">Active Workforce</dt><dd className="font-semibold text-gray-800">{factory.number_of_workers ?? 'N/A'}</dd></div>
              <div className="flex flex-col"><dt className="text-gray-400 font-medium text-xs uppercase tracking-wider mb-0.5">Current Status</dt><dd className="font-semibold text-gray-800 flex items-center gap-1.5">{factory.is_closed ? <><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> Closed</> : <><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Operating</>}</dd></div>
              <div className="flex flex-col"><dt className="text-gray-400 font-medium text-xs uppercase tracking-wider mb-0.5">Geographic Location</dt><dd className="font-semibold text-gray-800">{factory.country_name || factory.country_code}</dd></div>
            </dl>
          </div>
          
          <button
            onClick={issueCredential}
            disabled={issuing || !canIssue}
            className="w-full primary-gradient-bg text-white rounded-xl py-3.5 font-bold tracking-wide shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden flex items-center justify-center gap-2"
          >
            <div className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] skew-x-12"></div>
            {issuing ? (
              <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Generating ZK Signature...</>
            ) : !actor ? 'Authentication Required' : !canIssue ? 'Role Not Authorised' : (
              <><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg> Sign & Issue Verifiable Passport</>
            )}
          </button>
          {error && (
            <div className="mt-4 bg-red-50 text-red-700 p-3 rounded-xl border border-red-200 text-sm flex gap-2 items-center">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}
        </div>
      )}

      {credential && (
        <div className="animate-[fadeIn_0.5s_ease-out]">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 mb-6 shadow-sm">
            <div className="flex gap-4 items-start">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              </div>
              <div>
                <h3 className="text-emerald-900 font-bold text-lg mb-1">Passport successfully authored!</h3>
                <p className="text-emerald-700 text-sm mb-3">
                  This product has been digitally anchored to the network.
                </p>
                <div className="bg-white/80 rounded-lg px-3 py-2 border border-emerald-100 flex flex-col gap-1 inline-block">
                  <span className="text-xs text-emerald-600 uppercase tracking-wider font-bold">New Product Identifier</span>
                  <span className="font-mono text-gray-800 text-sm">{credential.product_id}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-8">
            <a
              href={`/product/${encodeURIComponent(credential.product_id)}`}
              className="text-sm shadow-md shadow-indigo-500/20 primary-gradient-bg text-white rounded-xl px-5 py-2.5 hover:shadow-lg transition-all font-semibold"
            >
              Trace Lifecycle Pipeline
            </a>
            <a
              href={`/verify/${encodeURIComponent(credential.product_id)}`}
              className="text-sm bg-white border border-gray-200 shadow-sm text-gray-700 rounded-xl px-5 py-2.5 hover:bg-gray-50 transition-colors font-semibold flex items-center gap-1.5"
            >
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Verify Cryptography
            </a>
          </div>

          <div className="glass-card rounded-2xl overflow-hidden p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
              Raw Signed Payload (JSON-LD)
            </h3>
            <pre className="p-5 text-[11px] md:text-xs overflow-auto bg-gray-900 rounded-xl text-green-400 whitespace-pre-wrap font-mono shadow-inner border border-black/20">
              {JSON.stringify(credential.credential, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
