'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMatchdays, getPlayers } from '@/lib/api-client';
import { Panel } from '@/components/ui/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Calendar, Sparkles } from 'lucide-react';

export function QuietState() {
  const { data: matchdaysData, isLoading: loadingMatchdays } = useQuery({
    queryKey: ['matchdays', 'recent'],
    queryFn: () => getMatchdays(1),
  });

  const { data: playersData, isLoading: loadingPlayers } = useQuery({
    queryKey: ['players'],
    queryFn: () => getPlayers(false),
  });

  if (loadingMatchdays || loadingPlayers) {
    return (
      <div className="py-6 space-y-4">
        <Skeleton className="h-44 w-full rounded-2xl" />
      </div>
    );
  }

  const lastMatch = matchdaysData?.matchdays?.[0];
  const master = playersData?.players?.find((p) => p.isMaster);

  const formattedDate = lastMatch?.playedAt
    ? new Date(lastMatch.playedAt).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : lastMatch?.createdAt
    ? new Date(lastMatch.createdAt).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div className="py-6 space-y-6 max-w-2xl mx-auto">
      {/* Hero Welcome Card */}
      <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-3xl p-8 text-white shadow-xl shadow-emerald-700/15 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />

        <div className="space-y-3 relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs font-semibold text-emerald-100 border border-white/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Ready for Kickoff</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            No live draft running right now
          </h2>
          <p className="text-emerald-100/90 text-sm max-w-md leading-relaxed">
            The pitch is quiet. As soon as the matchday organiser starts the team split, the live auction room will appear here automatically.
          </p>
        </div>
      </div>

      {/* Last Match Score Summary */}
      {lastMatch && (
        <Panel className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Last Matchday {formattedDate ? `· ${formattedDate}` : ''}</span>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {lastMatch.method === 'auction' ? 'Auction Split' : 'Shuffle Split'}
            </span>
          </div>

          <div className="flex items-center justify-around py-3">
            <div className="text-center space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600 block">
                Team A
              </span>
              <span className="text-4xl font-extrabold text-slate-900">
                {lastMatch.scoreA ?? 0}
              </span>
            </div>

            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-400">
              VS
            </div>

            <div className="text-center space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block">
                Team B
              </span>
              <span className="text-4xl font-extrabold text-slate-900">
                {lastMatch.scoreB ?? 0}
              </span>
            </div>
          </div>
        </Panel>
      )}

      {/* Organiser prompt */}
      {master && (
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-sm shrink-0">
            {master.displayName.charAt(0)}
          </div>
          <div>
            <p className="text-xs text-slate-500">Match Organiser</p>
            <p className="text-sm font-semibold text-slate-800">
              {master.displayName} has master access. Nudge them when everyone has arrived!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
