'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { Sparkles, X, Mail, Lock, User, ArrowRight, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

export function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, authModalTab, login, signup } = useAuth();
  const [tab, setTab] = useState<'login' | 'signup'>(authModalTab);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI states
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setTab(authModalTab);
    setError(null);
    if (isAuthModalOpen && !name) {
      try {
        const saved = localStorage.getItem('letstyle-profile') || localStorage.getItem('skintune-profile');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.name) setName(parsed.name);
        }
      } catch {
        // ignore
      }
    }
  }, [authModalTab, isAuthModalOpen]);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (tab === 'signup') {
      if (!name.trim()) {
        setError('Please enter your name.');
        return;
      }
      if (!email.trim() || !email.includes('@')) {
        setError('Please enter a valid email address.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        setError('Password must contain at least one letter and one number.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      setSubmitting(true);
      const res = await signup({ name, email, password, confirmPassword });
      setSubmitting(false);

      if (!res.success) {
        setError(res.error || 'Failed to create account.');
      }
    } else {
      if (!email.trim() || !email.includes('@')) {
        setError('Please enter your email address.');
        return;
      }
      if (!password) {
        setError('Please enter your password.');
        return;
      }

      setSubmitting(true);
      const res = await login({ email, password });
      setSubmitting(false);

      if (!res.success) {
        setError(res.error || 'Invalid email or password.');
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[#B08A70]/30 bg-[#FAF6F0] p-6 sm:p-8 shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={closeAuthModal}
          data-testid="button-close-auth-modal"
          className="absolute top-5 right-5 grid size-8 place-items-center rounded-full text-[#795548] hover:bg-[#B08A70]/15 hover:text-[#194A49] transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Brand header */}
        <div className="flex items-center gap-2.5 mb-2">
          <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-[#D9BC96] to-[#B08A70] text-[#194A49] shadow-sm">
            <Sparkles size={16} strokeWidth={2.5} />
          </span>
          <span className="font-serif text-xl font-bold tracking-tight text-[#194A49]">
            LetStyle
          </span>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-full bg-[#B08A70]/15 p-1 my-5">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setError(null);
            }}
            data-testid="tab-login"
            className={`flex-1 rounded-full py-2 text-xs font-bold transition-all ${
              tab === 'login'
                ? 'bg-[#194A49] text-white shadow-sm'
                : 'text-[#194A49]/70 hover:text-[#194A49]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('signup');
              setError(null);
            }}
            data-testid="tab-signup"
            className={`flex-1 rounded-full py-2 text-xs font-bold transition-all ${
              tab === 'signup'
                ? 'bg-[#194A49] text-white shadow-sm'
                : 'text-[#194A49]/70 hover:text-[#194A49]'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Title and subtitle */}
        <h2 id="auth-modal-title" className="font-serif text-2xl font-bold text-[#194A49]">
          {tab === 'login' ? 'Welcome Back' : 'Create Your Style Account'}
        </h2>
        <p className="mt-1 text-xs text-[#795548] leading-relaxed">
          {tab === 'login'
            ? 'Sign in to access your saved looks, credits, and personalized edits.'
            : 'Get started with 20 free styling credits for AI outfits and visuals.'}
        </p>

        {/* Free Credits Callout for Signup */}
        {tab === 'signup' && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[#D9BC96] bg-[#D9BC96]/20 p-3 text-xs text-[#194A49]">
            <Sparkles size={16} className="text-[#B08A70] shrink-0" />
            <span>
              <strong>20 Free Credits</strong> granted instantly upon account creation.
            </span>
          </div>
        )}

        {/* Error message banner */}
        {error && (
          <div
            className="mt-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
            role="alert"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {/* Auth form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          {tab === 'signup' && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#795548] mb-1">
                Name
              </label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#795548]/60" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  data-testid="input-signup-name"
                  className="w-full rounded-xl border border-[#B08A70]/30 bg-white py-2.5 pl-10 pr-3 text-sm text-[#194A49] placeholder:text-gray-400 focus:border-[#194A49] focus:outline-none focus:ring-1 focus:ring-[#194A49]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#795548] mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#795548]/60" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                data-testid="input-auth-email"
                className="w-full rounded-xl border border-[#B08A70]/30 bg-white py-2.5 pl-10 pr-3 text-sm text-[#194A49] placeholder:text-gray-400 focus:border-[#194A49] focus:outline-none focus:ring-1 focus:ring-[#194A49]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#795548] mb-1">
              Password
            </label>
            <div className="relative">
              <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#795548]/60" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tab === 'signup' ? 'At least 8 chars with letters & numbers' : 'Enter your password'}
                data-testid="input-auth-password"
                className="w-full rounded-xl border border-[#B08A70]/30 bg-white py-2.5 pl-10 pr-3 text-sm text-[#194A49] placeholder:text-gray-400 focus:border-[#194A49] focus:outline-none focus:ring-1 focus:ring-[#194A49]"
              />
            </div>
          </div>

          {tab === 'signup' && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#795548] mb-1">
                Confirm Password
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#795548]/60" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  data-testid="input-signup-confirm-password"
                  className="w-full rounded-xl border border-[#B08A70]/30 bg-white py-2.5 pl-10 pr-3 text-sm text-[#194A49] placeholder:text-gray-400 focus:border-[#194A49] focus:outline-none focus:ring-1 focus:ring-[#194A49]"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            data-testid="button-auth-submit"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#194A49] py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-[#133938] disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <span>{tab === 'login' ? 'Sign In' : 'Claim 20 Free Credits'}</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {/* Footer switch */}
        <div className="mt-5 text-center text-xs text-[#795548]">
          {tab === 'login' ? (
            <p>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setTab('signup');
                  setError(null);
                }}
                className="font-bold text-[#194A49] underline underline-offset-2 hover:opacity-80"
              >
                Sign up for 20 free credits
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setError(null);
                }}
                className="font-bold text-[#194A49] underline underline-offset-2 hover:opacity-80"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
