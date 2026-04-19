/* eslint-disable react-hooks/exhaustive-deps */
'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import api from '../../lib/api'

// We need an intermediate component to use useSearchParams
function ExplorerContent() {
  const searchParams = useSearchParams()
  const initialId = searchParams.get('id') || ''
  
  const [productId, setProductId] = useState(initialId)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Auto-search if ID is in URL
  useEffect(() => {
    if (initialId) {
      handleSearch(initialId)
    }
  }, [])

  async function handleSearch(targetId) {
    const id = targetId || productId
    if (!id.trim()) return

    setLoading(true)
    setError(null)
    setData(null)

    try {
      // Get the provenance tree
      const res = await api.get(`/product/${encodeURIComponent(id)}/provenance-tree`)
      setData(res.data)
    } catch (err) {
      if (err.response?.status === 404) {
        setError('No composition DAG found for this Material/Product ID.')
      } else {
        setError(err.response?.data?.detail || 'Failed to trace provenance.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Recursive component to render the DAG tree
  function TreeNode({ node, isRoot = false }) {
    const isLeaf = node.is_raw_material
    const isBurned = node.is_burned

    return (
      <div className="relative pl-8 py-3">
        {/* Tree Line Connector */}
        {!isRoot && (
          <>
            <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-700/50"></div>
            <div className="absolute left-0 top-1/2 w-6 h-px bg-slate-700/50"></div>
          </>
        )}
        
        <div className={`glass-card p-4 rounded-2xl relative z-10 transition-all ${
          isRoot ? 'border-purple-500/40 shadow-lg shadow-purple-500/10' : 
          isLeaf ? 'border-emerald-500/30' : 'border-blue-500/30'
        }`}>
          {/* Status Badges */}
          <div className="absolute -top-3 -right-2 flex gap-2">
            {isRoot && <span className="tag tag-purple shadow-sm">FINAL PRODUCT</span>}
            {isLeaf && <span className="tag tag-emerald shadow-sm">RAW ORIGIN</span>}
            {isBurned && <span className="tag tag-amber shadow-sm">TOKEN BURNED</span>}
            {node.tx_hash && <span className="tag tag-blue shadow-sm">ON-CHAIN</span>}
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-2">
            <div>
              <h3 className="text-xl font-bold text-white mb-1">{node.material_type}</h3>
              <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                <span className="bg-slate-800/80 px-2 py-1 rounded text-slate-300 border border-slate-700/50">
                  ID: {node.token_id}
                </span>
                <span className="truncate max-w-[200px]" title={node.product_id}>{node.product_id}</span>
              </div>
            </div>
            
            <div className="flex flex-col items-start md:items-end gap-1">
              <div className="text-lg font-bold text-white">
                {node.quantity} <span className="text-sm font-medium text-slate-400">units/kg</span>
              </div>
              <div className="text-xs text-slate-500">
                Owner: <span className="font-mono text-slate-400">{node.owner_did.split(':').pop()}</span>
              </div>
            </div>
          </div>

          {/* Links Row */}
          {(node.tx_hash || node.metadata_uri) && (
            <div className="mt-4 pt-3 border-t border-slate-700/50 flex gap-4 text-xs font-semibold">
              {node.tx_hash && (
                <a href={`https://amoy.polygonscan.com/tx/${node.tx_hash}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  PolygonScan
                </a>
              )}
              {node.metadata_uri && (
                <a href={node.metadata_uri.replace('ipfs://', 'https://ipfs.io/ipfs/')} target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Compliance VC (IPFS)
                </a>
              )}
            </div>
          )}
        </div>

        {/* Render Children Recursively */}
        {node.children && node.children.length > 0 && (
          <div className="mt-2 relative">
            <div className="absolute left-0 top-0 bottom-4 w-px bg-slate-700/50"></div>
            {node.children.map(child => (
              <TreeNode key={child.token_id} node={child} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto min-h-[70vh]">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Provenance Explorer</h1>
          <p className="text-sm text-slate-400">Trace product DAGs back to their physical root nodes via ERC-1155.</p>
        </div>
        
        <div className="flex bg-[#0f172a] rounded-xl border border-slate-700/50 p-1 w-full md:w-96">
          <input
            type="text"
            value={productId}
            onChange={e => setProductId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="urn:product:..."
            className="flex-1 bg-transparent border-none text-white text-sm focus:ring-0 px-3 outline-none"
            suppressHydrationWarning
          />
          <button 
            onClick={() => handleSearch()}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            Trace
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
        </div>
      )}

      {error && !loading && (
        <div className="glass-card border-red-500/30 bg-red-500/5 p-6 rounded-2xl flex flex-col items-center text-center">
          <svg className="w-12 h-12 text-red-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          <h3 className="text-lg font-bold text-white mb-2">Trace Failed</h3>
          <p className="text-slate-400 text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <div className="animate-fade-in-up">
          {/* Metadata Card */}
          <div className="glass p-6 rounded-2xl mb-8 flex flex-wrap gap-6 justify-between items-center border-b border-blue-500/30 shadow-[inset_0_-2px_10px_rgba(59,130,246,0.1)]">
            <div>
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Graph Depth</h2>
              <p className="text-3xl font-black text-white">{data.total_depth} <span className="text-sm text-slate-400 font-medium">tiers</span></p>
            </div>
            <div>
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Raw Material Roots</h2>
              <p className="text-3xl font-black text-emerald-400">{data.raw_materials?.length || 0} <span className="text-sm text-slate-400 font-medium">sources</span></p>
            </div>
            <div>
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">VC Inheritance Check</h2>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <p className="text-sm font-bold text-emerald-400">CRYPTOGRAPHICALLY VERIFIED</p>
              </div>
            </div>
          </div>

          <div className="bg-[#0f172a]/50 p-6 rounded-3xl border border-slate-800 backdrop-blur overflow-x-auto">
            <div className="min-w-[600px] -ml-8">
              <TreeNode node={data.tree} isRoot={true} />
            </div>
          </div>
        </div>
      )}

      {!loading && !error && !data && (
        <div className="text-center py-24 glass-card rounded-2xl border-dashed">
          <svg className="w-16 h-16 text-slate-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          <p className="text-slate-400 text-lg font-medium">Enter a Product URN to view its on-chain material DAG.</p>
        </div>
      )}
    </div>
  )
}

export default function ExplorerPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-slate-400">Loading trace system...</div>}>
      <ExplorerContent />
    </Suspense>
  )
}
