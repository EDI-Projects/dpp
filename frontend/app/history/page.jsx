'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '../../lib/api'

function truncateMiddle(text, start = 14, end = 12) {
  if (!text || text.length <= start + end + 3) return text || ''
  return `${text.slice(0, start)}...${text.slice(-end)}`
}

export default function ProductHistoryPage() {
  const [productId, setProductId] = useState('')
  const [tokens, setTokens] = useState([])
  const [tokensLoading, setTokensLoading] = useState(true)
  const [statusEntries, setStatusEntries] = useState([])
  const [statusLoading, setStatusLoading] = useState(true)

  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(null)
  const [historyData, setHistoryData] = useState(null)
  const [verifyData, setVerifyData] = useState(null)

  const [credentialLookupId, setCredentialLookupId] = useState('')
  const [credentialLookupLoading, setCredentialLookupLoading] = useState(false)
  const [credentialLookupError, setCredentialLookupError] = useState(null)
  const [credentialLookupResult, setCredentialLookupResult] = useState(null)

  const uniqueProducts = useMemo(() => {
    const seen = new Set()
    const rows = []
    for (const token of tokens) {
      if (!token?.product_id || seen.has(token.product_id)) continue
      seen.add(token.product_id)
      rows.push(token)
    }
    return rows
  }, [tokens])

  const verificationByCredentialId = useMemo(() => {
    const map = new Map()
    for (const credential of verifyData?.credentials || []) {
      if (credential?.credential_id) {
        map.set(credential.credential_id, credential)
      }
    }
    return map
  }, [verifyData])

  const statusSnapshot = useMemo(() => {
    const total = statusEntries.length
    const revoked = statusEntries.filter((entry) => entry.revoked).length
    return {
      total,
      revoked,
      active: total - revoked,
    }
  }, [statusEntries])

  useEffect(() => {
    let cancelled = false

    async function fetchPublicLedger() {
      setTokensLoading(true)
      setStatusLoading(true)
      try {
        const [ledgerResult, statusResult] = await Promise.allSettled([
          api.get('/public/ledger/tokens?limit=200'),
          api.get('/status-list/entries'),
        ])

        if (!cancelled) {
          if (ledgerResult.status === 'fulfilled') {
            setTokens(ledgerResult.value.data?.tokens || [])
          } else {
            setTokens([])
          }

          if (statusResult.status === 'fulfilled') {
            setStatusEntries(Array.isArray(statusResult.value.data) ? statusResult.value.data : [])
          } else {
            setStatusEntries([])
          }
        }
      } catch {
        if (!cancelled) {
          setTokens([])
          setStatusEntries([])
        }
      } finally {
        if (!cancelled) {
          setTokensLoading(false)
          setStatusLoading(false)
        }
      }
    }

    fetchPublicLedger()

    return () => {
      cancelled = true
    }
  }, [])

  async function loadProductHistory(rawProductId) {
    const trimmed = (rawProductId || '').trim()
    if (!trimmed) return

    setHistoryLoading(true)
    setHistoryError(null)
    setHistoryData(null)
    setVerifyData(null)
    setProductId(trimmed)
    setCredentialLookupError(null)
    setCredentialLookupResult(null)

    try {
      const encoded = encodeURIComponent(trimmed)
      const [lifecycleRes, verifyRes] = await Promise.all([
        api.get(`/product/${encoded}/lifecycle`),
        api.get(`/product/${encoded}/verify`),
      ])

      setHistoryData(lifecycleRes.data)
      setVerifyData(verifyRes.data)
    } catch (err) {
      setHistoryError(err.response?.data?.detail || 'Unable to load product history.')
    } finally {
      setHistoryLoading(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    loadProductHistory(productId)
  }

  async function lookupCredentialStatus(rawCredentialId) {
    const trimmed = (rawCredentialId || credentialLookupId || '').trim()
    if (!trimmed) return

    setCredentialLookupId(trimmed)
    setCredentialLookupLoading(true)
    setCredentialLookupError(null)
    setCredentialLookupResult(null)

    try {
      const encoded = encodeURIComponent(trimmed)
      const { data } = await api.get(`/credentials/${encoded}/status`)
      setCredentialLookupResult(data)
    } catch (err) {
      setCredentialLookupError(err.response?.data?.detail || 'Credential status lookup failed.')
    } finally {
      setCredentialLookupLoading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 min-h-[70vh]">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-2">Public Product History</h1>
        <p className="text-slate-400 max-w-3xl">
          Explore public lifecycle records by product ID. Each stage shows credential ID, IPFS CID, and Polygon anchor reference.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="glass-card rounded-2xl border border-cyan-500/20 p-4 md:p-5 mb-8">
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            placeholder="Enter Product ID (e.g. urn:product:...)"
            className="input-dark flex-1 font-mono text-sm"
            suppressHydrationWarning
          />
          <button type="submit" className="btn-primary px-6" disabled={historyLoading}>
            {historyLoading ? 'Loading...' : 'Load History'}
          </button>
        </div>
        <p className="mt-3 text-xs text-cyan-200/80">
          Public fields are visible by design. Avoid storing raw secrets in VC payloads pinned to IPFS.
        </p>
      </form>

      <div className="grid md:grid-cols-4 gap-4 mb-8">
        <div className="glass-card rounded-xl border border-slate-700/60 p-4">
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Status Entries</p>
          <p className="text-2xl font-black text-white">{statusLoading ? '...' : statusSnapshot.total}</p>
        </div>
        <div className="glass-card rounded-xl border border-slate-700/60 p-4">
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Active</p>
          <p className="text-2xl font-black text-emerald-400">{statusLoading ? '...' : statusSnapshot.active}</p>
        </div>
        <div className="glass-card rounded-xl border border-slate-700/60 p-4">
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Revoked</p>
          <p className="text-2xl font-black text-amber-400">{statusLoading ? '...' : statusSnapshot.revoked}</p>
        </div>
        <div className="glass-card rounded-xl border border-slate-700/60 p-4 flex flex-col justify-between">
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Status List VC</p>
          <a href={`${api.defaults.baseURL}/status-list`} target="_blank" rel="noreferrer" className="text-cyan-300 text-sm font-semibold hover:text-cyan-200 transition-colors">Open /status-list</a>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="glass-card rounded-2xl border border-slate-700/60 p-5 lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white">Public Ledger Products</h2>
            <span className="text-xs font-semibold text-slate-400">{uniqueProducts.length}</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">Latest unique products discovered from public token ledger.</p>

          {tokensLoading ? (
            <div className="py-12 flex justify-center">
              <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"></div>
            </div>
          ) : uniqueProducts.length === 0 ? (
            <p className="text-sm text-slate-500 py-8">No products in the public ledger yet.</p>
          ) : (
            <div className="space-y-2 max-h-130 overflow-y-auto pr-1">
              {uniqueProducts.map((token) => {
                const isActive = productId === token.product_id
                return (
                  <button
                    key={`${token.product_id}-${token.token_id}`}
                    type="button"
                    onClick={() => loadProductHistory(token.product_id)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${isActive ? 'border-cyan-400/70 bg-cyan-500/10' : 'border-slate-700/60 hover:border-slate-500'}`}
                  >
                    <div className="text-xs text-cyan-300 font-semibold mb-1">Token #{token.token_id}</div>
                    <div className="text-xs font-mono text-slate-200 break-all mb-1">{token.product_id}</div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{token.material_type}</span>
                      <span>{token.is_burned ? 'burned' : 'active'}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <section className="lg:col-span-2 space-y-5">
          <div className="glass-card rounded-2xl border border-indigo-500/20 p-5">
            <h3 className="text-lg font-bold text-indigo-300 mb-3">Credential Status Lookup</h3>
            <form
              className="flex flex-col md:flex-row gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                lookupCredentialStatus(credentialLookupId)
              }}
            >
              <input
                type="text"
                value={credentialLookupId}
                onChange={(event) => setCredentialLookupId(event.target.value)}
                placeholder="urn:credential:..."
                className="input-dark flex-1 font-mono text-xs"
              />
              <button type="submit" className="btn-primary px-5" disabled={credentialLookupLoading}>
                {credentialLookupLoading ? 'Checking...' : 'Check /credentials/{id}/status'}
              </button>
            </form>

            {credentialLookupError && (
              <p className="mt-3 text-sm text-red-300">{credentialLookupError}</p>
            )}

            {credentialLookupResult && (
              <div className="mt-4 grid md:grid-cols-3 gap-3 text-sm">
                <div className="bg-slate-900/40 border border-slate-700/60 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Credential ID</p>
                  <p className="text-slate-200 font-mono break-all">{credentialLookupResult.credential_id}</p>
                </div>
                <div className="bg-slate-900/40 border border-slate-700/60 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Status Index</p>
                  <p className="text-white font-bold">{credentialLookupResult.status_index}</p>
                </div>
                <div className="bg-slate-900/40 border border-slate-700/60 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Revoked</p>
                  <p className={`font-bold ${credentialLookupResult.revoked ? 'text-amber-300' : 'text-emerald-300'}`}>
                    {String(credentialLookupResult.revoked)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {!historyData && !historyLoading && !historyError && (
            <div className="glass-card rounded-2xl border border-dashed border-slate-700/60 p-10 text-center">
              <p className="text-slate-400">Select a product from the ledger or paste a product ID to view its VC timeline.</p>
            </div>
          )}

          {historyError && (
            <div className="glass-card rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
              <h3 className="text-red-300 font-semibold mb-1">Could not load history</h3>
              <p className="text-sm text-red-200/90">{historyError}</p>
            </div>
          )}

          {historyLoading && (
            <div className="glass-card rounded-2xl border border-slate-700/60 p-14 flex justify-center">
              <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"></div>
            </div>
          )}

          {historyData && !historyLoading && (
            <>
              <div className="glass-card rounded-2xl border border-cyan-500/25 p-5">
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Product ID</p>
                    <p className="text-cyan-200 font-mono break-all">{historyData.product_id}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Lifecycle Stages</p>
                    <p className="text-white font-bold text-2xl">{historyData.total_stages}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Verification</p>
                    <p className={`font-bold text-lg ${verifyData?.overall_valid ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {verifyData?.overall_valid ? 'Valid' : 'Check Required'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {historyData.lifecycle.map((entry, idx) => {
                  const verification = verificationByCredentialId.get(entry.credential_id)
                  const isValid = verification?.valid
                  return (
                    <article key={`${entry.credential_id}-${idx}`} className="glass-card rounded-2xl border border-slate-700/60 p-5">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                        <div>
                          <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Stage {idx + 1}</p>
                          <h3 className="text-white font-bold text-lg">{entry.stage}</h3>
                          <p className="text-sm text-slate-400">{entry.date || 'No date provided'}</p>
                        </div>
                        <div className={`text-sm font-semibold px-3 py-1 rounded-full w-max ${isValid ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'}`}>
                          {verification ? (isValid ? 'verified' : 'issues found') : 'not checked'}
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3 text-sm mb-4">
                        <div>
                          <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Issuer</p>
                          <p className="text-slate-200 font-mono break-all">{entry.issuer_did || entry.issuer || 'unknown'}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Credential ID</p>
                          <p className="text-slate-200 font-mono break-all">{entry.credential_id}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs font-semibold">
                        {entry.ipfs_cid && (
                          <a
                            href={`https://ipfs.io/ipfs/${entry.ipfs_cid}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-lg border border-cyan-500/40 text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/10 transition-colors"
                            title={entry.ipfs_cid}
                          >
                            IPFS: {truncateMiddle(entry.ipfs_cid, 10, 8)}
                          </a>
                        )}
                        {entry.tx_hash && (
                          <a
                            href={`https://amoy.polygonscan.com/tx/${entry.tx_hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-lg border border-blue-500/40 text-blue-300 hover:text-blue-200 hover:bg-blue-500/10 transition-colors"
                            title={entry.tx_hash}
                          >
                            Polygon Tx: {truncateMiddle(entry.tx_hash, 12, 8)}
                          </a>
                        )}
                        {entry.credential_id && (
                          <button
                            type="button"
                            onClick={() => lookupCredentialStatus(entry.credential_id)}
                            className="px-3 py-1.5 rounded-lg border border-indigo-500/40 text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10 transition-colors"
                          >
                            Check Credential Status
                          </button>
                        )}
                      </div>

                      {verification?.errors?.length > 0 && (
                        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                          <p className="text-xs uppercase tracking-widest text-amber-300 mb-2">Verification Notes</p>
                          <p className="text-sm text-amber-100">{verification.errors.join(' | ')}</p>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
