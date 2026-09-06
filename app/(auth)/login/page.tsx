'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { login } from '@/lib/api-client';
import { useAuth } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User, KeyRound, ArrowRight, ShieldAlert } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('next') || '/';
  const { refreshUser } = useAuth();

  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter your username.');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      await login(username.trim(), showPin ? pin.trim() : undefined);
      await refreshUser();
      router.push(nextUrl);
      router.refresh();
    } catch (err: any) {
      if (err.code === 'PIN_REQUIRED') {
        setShowPin(true);
        setError(null);
      } else {
        setError(err.message || 'Unable to sign in. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 bg-slate-50 relative overflow-hidden">
      {/* Background ambient decoration */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-100/60 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 items-center justify-center text-white shadow-lg shadow-emerald-500/25 mb-1">
            <span className="text-2xl">⚽</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Sign in to Turf
          </h1>
          <p className="text-sm text-slate-500">
            Enter your handle to access your squad and live matchdays
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200/90 shadow-xl shadow-slate-200/60 rounded-2xl p-6 sm:p-8 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-700">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  placeholder="e.g. alex or master"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={isLoading}
                  autoFocus
                  className="w-full rounded-xl bg-white border border-slate-300 pl-9 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-all focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
                />
              </div>
            </div>

            {showPin && (
              <div className="space-y-1.5 pt-1 transition-all">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Master 4-digit PIN
                  </label>
                  <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 font-medium">
                    Admin access
                  </span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="••••"
                    value={pin}
                    onChange={(e) => {
                      setPin(e.target.value);
                      if (error) setError(null);
                    }}
                    disabled={isLoading}
                    autoFocus
                    className="w-full rounded-xl bg-white border border-slate-300 pl-9 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm tracking-widest transition-all focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Default seeded master PIN is 1234.
                </p>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full py-2.5 rounded-xl text-base font-semibold shadow-md shadow-emerald-600/25 mt-2"
              isLoading={isLoading}
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>

          <div className="pt-2 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500 leading-relaxed">
              Ask your match organiser to add you if your name isn't on the squad roster yet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <LoginForm />
    </Suspense>
  );
}
