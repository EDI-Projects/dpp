'use client'

import { useState } from 'react'
import api from '../../lib/api'
import Link from 'next/link'

const ROLES = [
  { value: 'factory',   label: 'Factory / Manufacturer',   tier: 2, desc: 'Issue product birth certificates, handle custody transfers and repairs.' },
  { value: 'supplier',  label: 'Material Supplier',         tier: 2, desc: 'Issue material sourcing credentials for raw materials.' },
  { value: 'logistics', label: 'Logistics Provider',        tier: 2, desc: 'Issue custody transfer credentials for shipments.' },
  { value: 'certifier', label: 'Certification Body',        tier: 1, desc: 'Issue independent certification credentials. Requires root authority approval.' },
  { value: 'recycler',  label: 'Recycler / End-of-Life',   tier: 1, desc: 'Issue end-of-life credentials. Requires root authority approval.' },
  { value: 'regulator', label: 'Regulatory Body',           tier: 1, desc: 'Issue compliance credentials and revoke any credential. Requires approval.' },
]

const TIER_NOTE = {
  1: 'Tier 1 roles require approval from the root authority before activation.',
  2: 'Tier 2 roles activate immediately.',
}

export default function RegisterPage() {
  const [step, setStep]         = useState(1)   // 1 = role, 2 = details, 3 = success
  const [role, setRole]         = useState(null)
  const [name, setName]         = useState('')
  const [osId, setOsId]         = useState('')
  const [email, setEmail]       = useState('')
  const [result, setResult]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [copied, setCopied]     = useState(false)

  const roleObj = ROLES.find(r => r.value === role)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await api.post('/register', { role, name, os_id: osId || undefined, email: email || undefined })
      setResult(res.data)
      setStep(3)
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  function copyKey() {
    navigator.clipboard.writeText(result.private_key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Create an account</h1>
          <p className="text-sm text-gray-500 mt-1">Register as an actor in the DPP ecosystem</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                ${step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{s}</div>
              {s < 3 && <div className={`w-12 h-0.5 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {/* Step 1: Role selection */}
          {step === 1 && (
            <div>
              <h2 className="font-semibold text-gray-900 mb-4">Select your role</h2>
              <div className="space-y-2">
                {ROLES.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setRole(r.value)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${role === r.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{r.label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${r.tier === 1 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        Tier {r.tier}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{r.desc}</p>
                  </button>
                ))}
              </div>
              {roleObj && (
                <p className="mt-4 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                  {TIER_NOTE[roleObj.tier]}
                </p>
              )}
              <button
                onClick={() => setStep(2)}
                disabled={!role}
                className="mt-6 w-full bg-blue-600 text-white rounded-lg py-2.5 font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                Continue →
              </button>
            </div>
          )}

          {/* Step 2: Details */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="font-semibold text-gray-900 mb-2">Your details</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organisation name *</label>
                <input
                  value={name} onChange={e => setName(e.target.value)} required
                  placeholder="e.g. Acme Manufacturing Ltd."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {role === 'factory' ? 'Factory OS-ID (optional)' : 'Identifier (optional)'}
                </label>
                <input
                  value={osId} onChange={e => setOsId(e.target.value)}
                  placeholder={role === 'factory' ? 'e.g. DEHAM12345' : 'Unique identifier'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">Used to generate your DID. Leave blank for auto-generated.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email (optional)</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="contact@example.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep(1)}
                  className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm hover:bg-gray-50">
                  ← Back
                </button>
                <button type="submit" disabled={loading || !name}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors">
                  {loading ? 'Registering…' : 'Register'}
                </button>
              </div>
            </form>
          )}

          {/* Step 3: Success */}
          {step === 3 && result && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="text-4xl mb-2">{result.status === 'active' ? '✅' : '⏳'}</div>
                <h2 className="font-bold text-lg text-gray-900">
                  {result.status === 'active' ? 'Registration complete!' : 'Pending approval'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">{result.note}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">DID</span><span className="font-mono text-xs break-all text-right max-w-xs">{result.did}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Role</span><span>{result.role}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={result.status === 'active' ? 'text-green-700 font-medium' : 'text-yellow-700 font-medium'}>{result.status}</span></div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-amber-800 mb-2">Save your private key now</p>
                <p className="text-xs text-amber-700 mb-3">This key is shown once and never stored. You need it to sign credentials.</p>
                <div className="bg-white rounded-lg p-3 font-mono text-xs text-gray-700 break-all border border-amber-200 mb-3">
                  {result.private_key}
                </div>
                <button onClick={copyKey}
                  className="w-full bg-amber-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-amber-700 transition-colors">
                  {copied ? '✓ Copied!' : 'Copy private key'}
                </button>
              </div>
              <div className="flex gap-3">
                {result.status === 'active' && result.token && (
                  <Link href="/explorer"
                    onClick={() => {
                      localStorage.setItem('dpp_token', result.token)
                      localStorage.setItem('dpp_actor', JSON.stringify(result.actor))
                    }}
                    className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium text-center hover:bg-blue-700">
                    Go to console →
                  </Link>
                )}
                <Link href="/" className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm text-center hover:bg-gray-50">
                  Back to home
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
