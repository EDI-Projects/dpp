'use client'

import Link from 'next/link'

export default function RegisterPage() {
  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4">
      <div className="w-full max-w-2xl glass-card rounded-3xl p-8 md:p-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-white mb-3">
          Wallet Onboarding Enabled
        </h1>
        <p className="text-slate-300 mb-6 leading-relaxed">
          Manual account creation has been removed. To join the platform, connect MetaMask and sign the
          challenge message. Your wallet address becomes your decentralized identifier.
        </p>

        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-200 mb-8">
          First-time wallets are auto-provisioned as actors on successful signature verification.
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/login"
            className="flex-1 text-center primary-gradient-bg text-white rounded-xl py-3 font-bold"
          >
            Continue to Wallet Sign-In
          </Link>
          <Link
            href="/"
            className="flex-1 text-center border border-slate-600 text-slate-200 rounded-xl py-3 font-semibold hover:bg-slate-800/50 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
