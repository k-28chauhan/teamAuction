'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers';
import { useQuery } from '@tanstack/react-query';
import { getCurrentMatchday } from '@/lib/api-client';
import { Trophy, Users, History, Award, User, LogOut } from 'lucide-react';

const NAV_LINKS = [
  { label: 'Matchday', href: '/', icon: Trophy },
  { label: 'Squad', href: '/squad', icon: Users },
  { label: 'Results', href: '/results', icon: History },
  { label: 'Leaderboard', href: '/leaderboard', icon: Award },
];

export function TopBar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const { data: currentMatchdayData } = useQuery({
    queryKey: ['matchday', 'current'],
    queryFn: getCurrentMatchday,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const isLive = currentMatchdayData?.matchday?.status === 'drafting';

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white shadow-sm shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <span className="font-bold text-lg">⚽</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-slate-900 leading-none">
                  TURF
                </span>
                {isLive && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 animate-pulse border border-amber-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    LIVE
                  </span>
                )}
              </div>
              <span className="text-[11px] font-medium text-slate-400 leading-none mt-0.5">
                Matchday Hub
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((item) => {
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User profile & controls */}
        {user && (
          <div className="flex items-center gap-3">
            <Link
              href="/you"
              className={`flex items-center gap-2.5 p-1.5 sm:px-3 sm:py-1.5 rounded-lg border transition-all ${
                pathname === '/you'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-sm text-slate-700'
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center justify-center font-bold text-xs">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-semibold text-slate-800 leading-tight">
                  {user.displayName}
                </span>
                <span className="text-[10px] text-slate-500 leading-tight">
                  {user.position} · Rating {user.rating}
                </span>
              </div>
              {user.isMaster && (
                <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  Master
                </span>
              )}
            </Link>

            <button
              onClick={() => logout()}
              title="Sign out"
              className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
