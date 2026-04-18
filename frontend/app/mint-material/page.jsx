'use client'

import { useState } from 'react'
import api from '../../lib/api'

export default function MintMaterialPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successData, setSuccessData] = useState(null)
  
  const [formData, setFormData] = useState({
    material_type: 'Organic Cotton',
    quantity_kg: 1000,
    metadata_uri: 'ipfs://QmMockMetadataUri123'
  })

  async function handleMint(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccessData(null)
    
    try {
      const res = await api.post('/mint-raw-material', {
        material_type: formData.material_type,
        quantity_kg: Number(formData.quantity_kg),
        metadata_uri: formData.metadata_uri
      })
      setSuccessData(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
          Tokenize Raw Materials
        </h1>
        <p className="text-gray-500 mt-2">
          Step 1: Extractors (Farms/Mines) mint physical commodities into trackable **ERC-1155** tokens on Polygon Amoy.
        </p>
      </div>

      <div className="glass rounded-2xl p-8 border border-white/40 shadow-xl shadow-indigo-100/50 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
        
        <form onSubmit={handleMint} className="flex flex-col gap-6">
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-700">Material Type</label>
              <select 
                value={formData.material_type}
                onChange={e => setFormData({...formData, material_type: e.target.value})}
                className="px-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 backdrop-blur-sm"
              >
                <option>Organic Cotton</option>
                <option>Lithium Ore</option>
                <option>Recycled Polyester</option>
                <option>Natural Rubber</option>
              </select>
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-700">Quantity (kg/units)</label>
              <input 
                type="number" 
                value={formData.quantity_kg}
                onChange={e => setFormData({...formData, quantity_kg: e.target.value})}
                className="px-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 backdrop-blur-sm"
              />
            </div>
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">ESG Metadata URI</label>
            <input 
              type="text" 
              value={formData.metadata_uri}
              onChange={e => setFormData({...formData, metadata_uri: e.target.value})}
              className="px-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono text-sm backdrop-blur-sm"
              placeholder="ipfs://..."
            />
            <p className="text-xs text-gray-500">Attach compliance certificates (e.g., Fairtrade, Conflict-Free) directly to the tokens.</p>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
              <div className="font-semibold mb-1">Minting Failed</div>
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className={`mt-4 w-full py-4 rounded-xl text-white font-bold text-lg shadow-lg transition-all ${
              loading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'primary-gradient-bg hover:shadow-indigo-500/30 hover:-translate-y-0.5'
            }`}
          >
            {loading ? 'Minting Tokens on Polygon...' : 'Mint ERC-1155 Tokens'}
          </button>
        </form>
      </div>

      {successData && (
        <div className="mt-8 glass rounded-2xl p-8 border border-green-200 shadow-xl shadow-green-100/50" style={{ animation: "fadeIn 0.4s ease-out forwards" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Success!</h2>
          </div>
          
          <div className="bg-white/60 rounded-xl p-4 border border-gray-100 text-sm flex flex-col gap-3">
            <div className="flex justify-between border-b pb-2">
              <span className="text-gray-500">ERC-1155 Token ID</span>
              <span className="font-mono font-medium text-indigo-700">{successData.token_id}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-gray-500">Transaction Hash</span>
              <span className="font-mono text-xs">{successData.tx_hash}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-gray-500">Product Lineage URN</span>
              <span className="font-mono text-xs truncate max-w-[60%]">{successData.product_id}</span>
            </div>
            
            <a 
              href={`/product/${encodeURIComponent(successData.product_id)}`}
              className="mt-2 text-center py-2 bg-indigo-50 text-indigo-700 font-semibold rounded-lg hover:bg-indigo-100 transition-colors"
            >
              View Composition Graph →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
