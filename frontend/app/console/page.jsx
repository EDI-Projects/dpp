'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import api, { getStoredActor } from '../../lib/api'

export default function SupplyChainConsole() {
  const router = useRouter()
  const [actor, setActor] = useState(null)
  const [activeTab, setActiveTab] = useState('mint') // 'mint' or 'compose'
  
  // Mint state
  const [mintData, setMintData] = useState({ type: 'Organic Cotton', qty: 1000 })
  const [mintLoading, setMintLoading] = useState(false)
  const [mintResult, setMintResult] = useState(null)
  
  // Compose state
  const [availableTokens, setAvailableTokens] = useState([])
  const [selectedTokens, setSelectedTokens] = useState([])
  const [composeData, setComposeData] = useState({ type: 'Cotton Fabric', qty: 500 })
  const [composeLoading, setComposeLoading] = useState(false)
  const [composeResult, setComposeResult] = useState(null)

  useEffect(() => {
    const user = getStoredActor()
    if (!user) router.push('/')
    else setActor(user)
    
    fetchTokens()
  }, [router])

  async function fetchTokens() {
    try {
      const res = await api.get('/material-tokens')
      setAvailableTokens(res.data)
    } catch(err) {
      console.error(err)
    }
  }

  async function handleMint(e) {
    e.preventDefault()
    setMintLoading(true)
    try {
      const res = await api.post('/mint-raw-material', {
        material_type: mintData.type,
        quantity_kg: Number(mintData.qty)
      })
      setMintResult(res.data)
      fetchTokens() // refresh available tokens for compose
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to mint')
    } finally {
      setMintLoading(false)
    }
  }

  async function handleCompose(e) {
    e.preventDefault()
    if (selectedTokens.length === 0) return alert('Select at least one material to burn')
    
    setComposeLoading(true)
    try {
      const res = await api.post('/compose-product', {
        new_product_type: composeData.type,
        new_quantity: Number(composeData.qty),
        consumed_token_ids: selectedTokens.map(t => t.token_id),
        consumed_amounts: selectedTokens.map(t => t.quantity) // Burning 100% of selected tokens for simplicity
      })
      setComposeResult(res.data)
      setSelectedTokens([])
      fetchTokens()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to compose')
    } finally {
      setComposeLoading(false)
    }
  }

  if (!actor) return null

  return (
    <div className="max-w-4xl mx-auto min-h-[70vh]">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-white mb-2">Supply Chain Console</h1>
        <p className="text-slate-400">Perform on-chain material transformations. You are logged in as {actor.name}.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 bg-[#0f172a]/50 p-1 rounded-xl w-max">
        <button 
          onClick={() => {setActiveTab('mint'); setMintResult(null)}}
          className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'mint' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
        >
          1. Extract / Mint
        </button>
        <button 
          onClick={() => {setActiveTab('compose'); setComposeResult(null)}}
          className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'compose' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
        >
          2. Assemble / Compose
        </button>
      </div>

      {/* MINT UI */}
      {activeTab === 'mint' && (
        <div className="animate-fade-in stagger-1">
          <form onSubmit={handleMint} className="glass-card p-6 md:p-8 rounded-2xl">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span className="w-8 h-8 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm">1</span>
              Tokenize Physical Extractions
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Material Type</label>
                <select value={mintData.type} onChange={e => setMintData({...mintData, type: e.target.value})} className="input-dark">
                  <option>Organic Cotton</option>
                  <option>Raw Wool</option>
                  <option>Recycled Polyester</option>
                  <option>Lithium Ore</option>
                  <option>Natural Rubber</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Quantity (units/kg)</label>
                <input type="number" min="1" value={mintData.qty} onChange={e => setMintData({...mintData, qty: e.target.value})} className="input-dark" suppressHydrationWarning />
              </div>
            </div>
            
            <div className="mb-8 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
              <p className="text-sm text-blue-200">
                VC metadata is now generated and uploaded to Pinata IPFS automatically at mint time.
              </p>
              <p className="text-xs text-blue-300/80 mt-1">
                The resulting ipfs://CID is used as the token metadata URI on Polygon.
              </p>
            </div>

            <button type="submit" disabled={mintLoading} className="btn-primary w-full py-4 text-lg">
              {mintLoading ? 'Writing to Polygon Amoy...' : 'Mint ERC-1155 Material Tokens'}
            </button>
          </form>

          {mintResult && (
            <div className="mt-8 glass p-6 rounded-2xl border-emerald-500/30 animate-fade-in-up">
              <h3 className="text-emerald-400 font-bold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Material Minted Successfully
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm font-mono bg-slate-900/50 p-4 rounded-xl">
                <div className="text-slate-500">Token ID</div><div className="text-white text-right">{mintResult.token_id}</div>
                <div className="text-slate-500">Product URN</div><div className="text-emerald-300 text-right text-xs truncate" title={mintResult.product_id}>{mintResult.product_id}</div>
                <div className="text-slate-500">IPFS CID</div><div className="text-emerald-300 text-right text-xs truncate" title={mintResult.ipfs_cid}>{mintResult.ipfs_cid}</div>
              </div>
              <div className="mt-4 flex gap-3 text-xs font-semibold">
                {mintResult.tx_hash && (
                  <a href={`https://amoy.polygonscan.com/tx/${mintResult.tx_hash}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">
                    View Polygon Tx
                  </a>
                )}
                {mintResult.metadata_uri && (
                  <a href={mintResult.metadata_uri.replace('ipfs://', 'https://ipfs.io/ipfs/')} target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300">
                    View IPFS VC
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* COMPOSE UI */}
      {activeTab === 'compose' && (
        <div className="animate-fade-in stagger-1">
          
          <div className="grid md:grid-cols-2 gap-8">
            {/* Left Col: Token Selection */}
            <div>
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">Select Inputs to BURN</h2>
              <div className="space-y-3 h-100 overflow-y-auto pr-2">
                {availableTokens.length === 0 ? (
                  <p className="text-slate-500 text-sm">No live tokens available to burn. Mint some first.</p>
                ) : (
                  availableTokens.map(t => {
                    const isSelected = selectedTokens.some(st => st.token_id === t.token_id)
                    return (
                      <div 
                        key={t.token_id} 
                        onClick={() => {
                          if (isSelected) setSelectedTokens(prev => prev.filter(st => st.token_id !== t.token_id))
                          else setSelectedTokens(prev => [...prev, t])
                        }}
                        className={`cursor-pointer p-4 rounded-xl border transition-all ${isSelected ? 'bg-red-500/10 border-red-500/50 shadow-[inset_0_0_15px_rgba(239,68,68,0.1)]' : 'glass-card hover:border-slate-500'}`}
                      >
                         <div className="flex justify-between items-center mb-2">
                           <span className="font-bold text-slate-200">{t.material_type}</span>
                           <span className="font-mono text-xs px-2 py-0.5 bg-slate-800 rounded">ID: {t.token_id}</span>
                         </div>
                         <div className="text-xs text-slate-400">Qty: <span className="text-white font-medium">{t.quantity}</span></div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Right Col: Output Configuration */}
            <div>
              <form onSubmit={handleCompose} className="glass-card p-6 rounded-2xl h-full flex flex-col justify-between border-purple-500/20">
                <div>
                  <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">Configure Output MINT</h2>
                  
                  <div className="space-y-5 mb-8">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">New Product Type</label>
                      <input type="text" value={composeData.type} onChange={e => setComposeData({...composeData, type: e.target.value})} className="input-dark" suppressHydrationWarning />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">New Quantity (units)</label>
                      <input type="number" min="1" value={composeData.qty} onChange={e => setComposeData({...composeData, qty: e.target.value})} className="input-dark" suppressHydrationWarning />
                    </div>
                  </div>
                </div>

                <div className="bg-[#0f172a]/80 p-4 rounded-xl border border-slate-700/50 mb-6">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Transaction Preview</div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-red-400 line-through">Burn {selectedTokens.length} tokens</span>
                    <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                    <span className="text-emerald-400 font-bold">Mint 1 new token</span>
                  </div>
                </div>

                <button type="submit" disabled={composeLoading || selectedTokens.length === 0} className={`btn-primary w-full py-4 text-lg ${selectedTokens.length===0?'opacity-50 cursor-not-allowed':''}`} style={{backgroundImage: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)'}}>
                  {composeLoading ? 'Executing Assembly...' : 'Burn & Mint Assembly'}
                </button>
              </form>
            </div>
          </div>

          {composeResult && (
            <div className="mt-8 glass p-6 rounded-2xl border-purple-500/30 animate-fade-in-up">
               <h3 className="text-purple-400 font-bold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                Assembly Successful
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm font-mono bg-slate-900/50 p-4 rounded-xl mb-4">
                <div className="text-slate-500">New Token ID</div><div className="text-white text-right">{composeResult.token_id}</div>
                <div className="text-slate-500">Product URN</div><div className="text-purple-300 text-right text-xs truncate" title={composeResult.product_id}>{composeResult.product_id}</div>
                <div className="text-slate-500">IPFS CID</div><div className="text-purple-300 text-right text-xs truncate" title={composeResult.ipfs_cid}>{composeResult.ipfs_cid}</div>
              </div>
              <div className="mb-4 flex gap-3 text-xs font-semibold">
                {composeResult.tx_hash && (
                  <a href={`https://amoy.polygonscan.com/tx/${composeResult.tx_hash}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">
                    View Polygon Tx
                  </a>
                )}
                {composeResult.metadata_uri && (
                  <a href={composeResult.metadata_uri.replace('ipfs://', 'https://ipfs.io/ipfs/')} target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300">
                    View IPFS VC
                  </a>
                )}
              </div>
              <a href={`/explorer?id=${encodeURIComponent(composeResult.product_id)}`} className="text-center block w-full py-2 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 rounded-lg text-sm font-bold transition-colors">
                View DAG in Provenance Explorer →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
