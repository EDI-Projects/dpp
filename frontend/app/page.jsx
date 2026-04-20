'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import api, { getStoredActor } from '../lib/api'

export default function LandingPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [liveStatus, setLiveStatus] = useState(null)
  const [liveError, setLiveError] = useState(null)
  const [walletDid] = useState(() => {
    const actor = getStoredActor()
    return actor?.did?.startsWith('did:ethr:') ? actor.did : null
  })
  const [walletChainId, setWalletChainId] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function fetchLiveStatus() {
      try {
        const { data } = await api.get('/system/live-status')
        if (!cancelled) {
          setLiveStatus(data)
          setLiveError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setLiveError(err.response?.data?.detail || 'Live status unavailable')
        }
      }
    }

    fetchLiveStatus()
    const timer = setInterval(fetchLiveStatus, 15000)

    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.request({ method: 'eth_chainId' })
        .then((hex) => {
          const parsed = Number.parseInt(String(hex), 16)
          if (!Number.isNaN(parsed)) {
            setWalletChainId(parsed)
          }
        })
        .catch(() => {
          setWalletChainId(null)
        })
    }

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  function handleSearch(e) {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/explorer?id=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  return (
    <div className="max-w-7xl mx-auto w-full animate-fade-in">
      <section className="section-shell subtle-ring overflow-hidden relative mb-8 md:mb-10">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-blue-500/20 blur-3xl"></div>
          <div className="absolute -bottom-24 -right-20 w-80 h-80 rounded-full bg-cyan-500/20 blur-3xl"></div>
        </div>

        <div className="relative px-6 md:px-10 py-12 md:py-16 grid lg:grid-cols-2 gap-10 items-start">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-bold mb-6">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
              LIVE PROVENANCE ENGINE ON POLYGON AMOY
            </div>

            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-5 text-white leading-[1.05]">
              Product Passport
              <span className="block gradient-text">Built For Trust</span>
            </h1>

            <p className="text-base md:text-lg text-slate-300/90 max-w-2xl mb-8 leading-relaxed">
              End-to-end material provenance with verifiable credentials, immutable anchors, and public history views that are understandable by operations teams and regulators.
            </p>

            <form onSubmit={handleSearch} className="max-w-2xl">
              <div className="relative flex flex-col sm:flex-row sm:items-center glass rounded-2xl p-2 gap-2 border border-slate-700/70">
                <input
                  type="text"
                  placeholder="Enter Product URN (e.g. urn:product:...)"
                  className="flex-1 bg-transparent border-none text-white focus:ring-0 text-base placeholder-slate-500 outline-none px-3 py-2"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  suppressHydrationWarning
                />
                <button type="submit" className="btn-primary py-2.5 px-5 text-sm md:text-base whitespace-nowrap">
                  Trace Product
                </button>
              </div>
            </form>

            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                className="tag tag-cyan"
                onClick={() => router.push('/history')}
              >
                Open Public History
              </button>
              <button
                type="button"
                className="tag tag-purple"
                onClick={() => router.push('/console')}
              >
                Open Console
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="glass-card rounded-xl p-4 border border-slate-700/70">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Auth Mode</p>
              <p className="text-white font-semibold">{liveStatus?.auth?.mode || 'wallet-siwe'}</p>
              <p className="text-slate-500 text-xs mt-2">Chain: {liveStatus?.auth?.chain_id ?? 80002}</p>
            </div>
            <div className="glass-card rounded-xl p-4 border border-slate-700/70">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Wallet Session</p>
              <p className="text-white font-semibold font-mono text-xs break-all" suppressHydrationWarning>{walletDid || 'Not connected'}</p>
              <p className="text-slate-500 text-xs mt-2">Client chain: {walletChainId || 'unknown'}</p>
            </div>
            <div className="glass-card rounded-xl p-4 border border-slate-700/70">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Ledger</p>
              <p className="text-white font-semibold">Products: {liveStatus?.ledger?.total_products ?? 0}</p>
              <p className="text-white font-semibold">Active tokens: {liveStatus?.ledger?.active_tokens ?? 0}</p>
            </div>
            <div className="glass-card rounded-xl p-4 border border-slate-700/70">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Integrations</p>
              <p className="text-white font-semibold">Pinata: {liveStatus?.integrations?.ipfs_pinata ? 'online' : 'offline'}</p>
              <p className="text-white font-semibold">Polygon: {liveStatus?.integrations?.polygon_amoy ? 'online' : 'offline'}</p>
            </div>
            <div className="glass-card rounded-xl p-4 border border-slate-700/70 col-span-2">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Latest Anchors</p>
              <div className="grid md:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-slate-500 mb-1">Polygon tx</p>
                  {liveStatus?.ledger?.latest_tx_hash ? (
                    <a
                      href={`https://amoy.polygonscan.com/tx/${liveStatus.ledger.latest_tx_hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-300 hover:text-blue-200 font-mono break-all"
                    >
                      {liveStatus.ledger.latest_tx_hash}
                    </a>
                  ) : (
                    <p className="text-slate-500">No confirmed tx yet</p>
                  )}
                </div>
                <div>
                  <p className="text-slate-500 mb-1">IPFS CID</p>
                  {liveStatus?.latest_credential?.ipfs_cid ? (
                    <a
                      href={`https://ipfs.io/ipfs/${liveStatus.latest_credential.ipfs_cid}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-300 hover:text-emerald-200 font-mono break-all"
                    >
                      {liveStatus.latest_credential.ipfs_cid}
                    </a>
                  ) : (
                    <p className="text-slate-500">No credential pinned yet</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {liveError && (
          <div className="relative border-t border-red-500/25 bg-red-500/10 px-6 md:px-10 py-3 text-sm text-red-200">
            {liveError}
          </div>
        )}
      </section>

      <section className="grid md:grid-cols-3 gap-4 md:gap-5 mb-10">
        <div className="glass-card p-5 rounded-2xl border border-blue-500/25">
          <div className="w-10 h-10 rounded-lg bg-blue-500/15 text-blue-300 flex items-center justify-center mb-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Tokenized Materials</h3>
          <p className="text-sm text-slate-400">Raw material batches are minted and transformed into composed products through ERC-1155 lineage operations.</p>
        </div>

        <div className="glass-card p-5 rounded-2xl border border-cyan-500/25">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/15 text-cyan-300 flex items-center justify-center mb-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Verifiable Credentials</h3>
          <p className="text-sm text-slate-400">Lifecycle events are emitted as W3C VCs and pinned to IPFS in JSON-LD format for interoperability.</p>
        </div>

        <div className="glass-card p-5 rounded-2xl border border-emerald-500/25">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/15 text-emerald-300 flex items-center justify-center mb-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Public Audit Surface</h3>
          <p className="text-sm text-slate-400">Product history and provenance are explorable publicly with direct links to on-chain and IPFS evidence.</p>
        </div>
      </section>

      <section className="section-shell subtle-ring p-6 md:p-8 mb-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Quick Start</p>
            <h2 className="text-2xl md:text-3xl font-bold text-white">Suggested Demo Flow</h2>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.push('/console')} className="btn-primary text-sm px-4 py-2">Go To Console</button>
            <button type="button" onClick={() => router.push('/history')} className="btn-ghost text-sm px-4 py-2">Open History</button>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <p className="text-xs text-slate-500 mb-2">Step 1</p>
            <p className="text-sm text-slate-200">Connect wallet and mint a raw material token.</p>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <p className="text-xs text-slate-500 mb-2">Step 2</p>
            <p className="text-sm text-slate-200">Compose product tokens and issue lifecycle credentials.</p>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <p className="text-xs text-slate-500 mb-2">Step 3</p>
            <p className="text-sm text-slate-200">Trace lineage in Explorer and view aggregation metrics.</p>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <p className="text-xs text-slate-500 mb-2">Step 4</p>
            <p className="text-sm text-slate-200">Share public history with Polygon tx and IPFS links.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
