'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { didLogin, getStoredActor } from '../../lib/api'

const DEMO_ACTORS = [
  { did: 'did:dpp:root-authority',         label: 'Root Authority (Tier 0 Admin)',             role: 'tier0_root'       },
  { did: 'did:dpp:certifier-intertek',     label: 'Intertek Certification (Certifier)',         role: 'tier1_certifier'  },
  { did: 'did:dpp:certifier-tuv',          label: 'TUV SUD (Certifier)',                        role: 'tier1_certifier'  },
  { did: 'did:dpp:recycler-veolia',        label: 'Veolia Recycling (Recycler)',                role: 'tier1_recycler'   },
  { did: 'did:dpp:regulator-eu-espr',      label: 'EU ESPR Regulator',                         role: 'tier1_regulator'  },
  { did: 'did:dpp:supplier-rawmat',        label: 'Raw Material Supplier',                     role: 'tier2_supplier'   },
  { did: 'did:dpp:logistics-dhl',          label: 'DHL Supply Chain (Logistics)',               role: 'tier2_logistics'  },
  { did: 'did:dpp:factory-alpha',          label: 'Alpha Manufacturing Co. (Factory)',          role: 'tier2_factory'    },
  { did: 'did:dpp:factory-beta',           label: 'Beta Industries Ltd. (Factory)',             role: 'tier2_factory'    },
]

const ROLE_BADGE = {
  tier0_root:       'bg-red-100 text-red-800',
  tier1_certifier:  'bg-blue-100 text-blue-800',
  tier1_recycler:   'bg-green-100 text-green-800',
  tier1_regulator:  'bg-purple-100 text-purple-800',
  tier2_factory:    'bg-gray-100 text-gray-700',
  tier2_supplier:   'bg-orange-100 text-orange-800',
  tier2_logistics:  'bg-yellow-100 text-yellow-800',
}

export default function LoginPage() {
  const router   = useRouter()
  const [selected, setSelected] = useState(DEMO_ACTORS[0].did)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  const actor = DEMO_ACTORS.find(a => a.did === selected)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await didLogin(selected)
      router.push('/dashboard')
    } catch (err) {
      setError(err.response?.data?.detail || 'Sign in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Sign in to DPP</h1>
          <p className="text-sm text-gray-500 mt-1">Digital Product Passport platform</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select your actor identity
            </label>
            <select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {DEMO_ACTORS.map(a => (
                <option key={a.did} value={a.did}>{a.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Demo mode: all keys are held server-side.</p>
          </div>

          {actor && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Role</span>
                <span className={`px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[actor.role] || 'bg-gray-100 text-gray-600'}`}>
                  {actor.role}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-500 shrink-0">DID</span>
                <span className="font-mono text-gray-700 break-all">{actor.did}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign in with DID'}
          </button>

          <p className="text-xs text-center text-gray-400">
            Not registered?{' '}
            <a href="/register" className="text-blue-600 hover:underline">Create an account →</a>
          </p>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Authentication uses Ed25519 DIDAuth — no passwords stored.
        </p>
      </div>
    </div>
  )
}
