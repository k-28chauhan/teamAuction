'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Trophy, Users, History, Award, User } from 'lucide-react';

const TABS = [
  { label: 'Matchday', href: '/', icon: Trophy },
  { label: 'Squad', href: '/squad', icon: Users },
  { label: 'Results', href: '/results', icon: History },
  { label: 'Board', href: '/leaderboard', icon: Award },
  { label: 'You', href: '/you', icon: User },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-[0_-2px_10px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-around h-16 px-1">
        {TABS.map((tab) => {
          const isActive =
            tab.href === '/'
              ? pathname === '/'
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors select-none ${
                isActive ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <div className={`p-1 rounded-lg ${isActive ? 'bg-emerald-50 text-emerald-600' : ''}`}>
                <Icon className="w-5 h-5" />
              </div>
              <span
                className={`text-[11px] mt-0.5 ${
                  isActive ? 'font-bold text-emerald-700' : 'font-medium text-slate-500'
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
