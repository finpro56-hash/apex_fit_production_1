/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { auth, googleProvider, signInWithPopup } from '../firebase/config';
import { Dumbbell, ShieldCheck, Sparkles, Flame, UserCheck } from 'lucide-react';

interface AuthScreenProps {
  onContinueGuest?: () => void;
}

export function AuthScreen({ onContinueGuest }: AuthScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 sm:p-12 selection:bg-emerald-500 selection:text-white">
      <div className="max-w-md mx-auto w-full pt-12 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-3xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-6 shadow-2xl shadow-emerald-950 shrink-0">
          <Dumbbell className="w-8 h-8 text-emerald-400 shrink-0" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
          Apex Fit
        </h1>
        <p className="text-slate-400 text-sm sm:text-base max-w-sm mb-10 leading-relaxed">
          The intelligent fitness and diet tracker powered by multimodal Gemini AI and secure Firebase persistence.
        </p>

        <div className="w-full space-y-4 mb-8">
          <div className="flex items-center gap-3 text-left p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
            <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-slate-200">Multimodal AI Food Analysis</p>
              <p className="text-slate-400">Scan food photos or log via voice instantly.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-left p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
            <Flame className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-slate-200">Precision Workout Logging</p>
              <p className="text-slate-400">Track sets, reps, weight, and volume progression.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-left p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
            <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-slate-200">Secure Firebase UID Isolation</p>
              <p className="text-slate-400">Your account data is isolated to your Firebase user account.</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="w-full p-3 mb-4 rounded-xl bg-red-950/50 border border-red-800 text-red-300 text-xs text-left">
            {error}
          </div>
        )}

        <div className="w-full space-y-3">
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full h-12 rounded-xl bg-white text-slate-950 font-semibold text-sm flex items-center justify-center gap-3 shadow-lg hover:bg-slate-200 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.19v3.15C3.17 21.36 7.25 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.19C.43 8.13 0 9.87 0 12s.43 3.87 1.19 5.42l4.09-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.25 0 3.17 2.64 1.19 6.58l4.09 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            {loading ? 'Signing in...' : 'Sign in with Google'}
          </button>

          {onContinueGuest && (
            <button
              type="button"
              onClick={onContinueGuest}
              className="w-full h-12 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-medium text-sm flex items-center justify-center gap-2 hover:bg-slate-800 hover:text-white active:scale-[0.98] transition-all"
            >
              <UserCheck className="w-4 h-4 text-emerald-400" />
              Continue as Guest
            </button>
          )}
        </div>
      </div>

      <div className="text-center text-xs text-slate-500 pb-4 space-y-2">
        <p>Apex Fit &bull; Powered by Firebase & Gemini</p>
        <p>
          <a href="/privacy.html" className="hover:text-slate-300 underline">Privacy</a>
          <span className="mx-2">·</span>
          <a href="/terms.html" className="hover:text-slate-300 underline">Terms</a>
          <span className="mx-2">·</span>
          <a href="/safety.html" className="hover:text-slate-300 underline">Health & AI Safety</a>
        </p>
      </div>
    </div>
  );
}
