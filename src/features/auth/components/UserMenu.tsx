'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { Sparkles, User, LogOut, ChevronDown, Coins, ShieldCheck } from 'lucide-react';

export function UserMenu() {
  const { user, credits, logout, openAuthModal, isLoading } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isLoading) {
    return (
      <div className="h-8 w-24 animate-pulse rounded-full bg-[#B08A70]/20" />
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => openAuthModal('login')}
          data-testid="button-open-login"
          className="rounded-full px-3.5 py-1.5 text-xs font-bold text-[#194A49] transition-colors hover:bg-[#B08A70]/20"
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => openAuthModal('signup')}
          data-testid="button-open-signup"
          className="flex items-center gap-1.5 rounded-full bg-[#194A49] px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#133938]"
        >
          <Sparkles size={12} className="text-[#D9BC96]" />
          <span>20 Free Credits</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        data-testid="button-user-menu"
        className="flex items-center gap-2 rounded-full border border-[#B08A70]/40 bg-[#FAF6F0] py-1 pl-3 pr-2.5 shadow-sm transition hover:border-[#194A49]/50"
      >
        {/* Credit badge */}
        <span className="flex items-center gap-1 text-xs font-bold text-[#194A49]">
          <Sparkles size={13} className="text-[#B08A70]" />
          <span data-testid="user-credits-display">{credits}</span>
          <span className="text-[10px] text-[#795548] font-medium">credits</span>
        </span>

        {/* User avatar initial */}
        <span className="grid size-6 place-items-center rounded-full bg-[#194A49] text-[11px] font-bold text-white">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <ChevronDown size={13} className="text-[#795548]" />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-64 origin-top-right rounded-2xl border border-[#B08A70]/30 bg-[#FAF6F0] p-3 shadow-xl z-50">
          {/* User info */}
          <div className="border-b border-[#B08A70]/20 pb-3 mb-2 px-1">
            <p className="text-sm font-bold text-[#194A49] truncate">{user.name}</p>
            <p className="text-[11px] text-[#795548] truncate">{user.email}</p>
          </div>

          {/* Balance card */}
          <div className="rounded-xl border border-[#D9BC96]/60 bg-[#D9BC96]/20 p-2.5 mb-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[#194A49]">
                <Coins size={14} className="text-[#B08A70]" />
                Available Credits
              </span>
              <span className="text-sm font-extrabold text-[#194A49]">{credits}</span>
            </div>
            <p className="mt-1 text-[10px] text-[#795548] leading-tight">
              Used for AI outfit curations, image generation & try-ons.
            </p>
          </div>

          {/* Logout */}
          <button
            type="button"
            onClick={() => {
              setDropdownOpen(false);
              logout();
            }}
            data-testid="button-logout"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors"
          >
            <LogOut size={13} />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
