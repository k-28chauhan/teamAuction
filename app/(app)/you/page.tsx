'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPlayerStats } from '@/lib/api-client';
import { useAuth } from '@/components/providers';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { PositionChip, RatingBadge } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Flame, LogOut, Shield, ArrowRight, Calendar } from 'lucide-react';

export default function YouPage() {
  const { user, logout } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['player-stats', user?.id],
    queryFn: () => (user ? getPlayerStats(user.id) : Promise.reject('No user')),
    enabled: !!user?.id,
  });

  if (isLoading || !user) {
    return (
      <div className="py-4 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-4 gap-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
        <Skeleton className="h-44 w-full rounded-2xl" />
      </div>
    );
  }

  const stats = data?.stats ?? {
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    winRate: 0,
  };
  const matches = data?.matches ?? [];

  return (
    <div className="py-4 space-y-6 max-w-4xl mx-auto">
      {/* Player Hero Card */}
      <Panel className="p-6 bg-gradient-to-r from-white via-slate-50 to-emerald-50/30 border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white font-extrabold text-2xl flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
              {user.displayName.charAt(0).toUpperCase()}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold text-slate-900">
                  {user.displayName}
                </h1>
                {user.isMaster && (
                  <span className="text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                    Organiser
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">@{user.username}</span>
                <span className="text-slate-300">·</span>
                <PositionChip position={user.position} />
              </div>
            </div>
          </div>

          <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Skill Rating
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-3xl font-extrabold text-slate-900">{user.rating}</span>
              <span className="text-xs text-slate-400 font-medium">/ 10</span>
            </div>
          </div>
        </div>
      </Panel>

      {/* 4 Primary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Panel className="p-4 text-center space-y-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            Matches Played
          </span>
          <span className="text-3xl font-extrabold text-slate-900 block">
            {stats.played}
          </span>
        </Panel>

        <Panel className="p-4 text-center space-y-1 bg-emerald-50/40 border-emerald-200">
          <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider block">
            Victories
          </span>
          <span className="text-3xl font-extrabold text-emerald-700 block">
            {stats.won}
          </span>
        </Panel>

        <Panel className="p-4 text-center space-y-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            Draws
          </span>
          <span className="text-3xl font-extrabold text-slate-600 block">
            {stats.drawn}
          </span>
        </Panel>

        <Panel className="p-4 text-center space-y-1 bg-rose-50/40 border-rose-200">
          <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider block">
            Defeats
          </span>
          <span className="text-3xl font-extrabold text-rose-700 block">
            {stats.lost}
          </span>
        </Panel>
      </div>

      {/* Secondary Performance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Panel className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Win Rate</span>
            <span className="text-xl font-extrabold text-emerald-600">{stats.winRate}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all duration-500"
              style={{ width: `${stats.winRate}%` }}
            />
          </div>
          <p className="text-xs text-slate-400">
            Won {stats.won} of {stats.played} appearances
          </p>
        </Panel>

        <Panel className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Goal Record</span>
            <span className="text-xl font-extrabold text-slate-900">
              {stats.goalsFor} : {stats.goalsAgainst}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100">
            <span>Goal difference:</span>
            <strong className={`font-bold ${stats.goalsFor - stats.goalsAgainst >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {stats.goalsFor - stats.goalsAgainst >= 0 ? `+${stats.goalsFor - stats.goalsAgainst}` : stats.goalsFor - stats.goalsAgainst}
            </strong>
          </div>
        </Panel>
      </div>

      {/* Match History with Own Team Score First */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Personal Match History</h2>

        {matches.length === 0 ? (
          <Panel className="p-8 text-center text-slate-400 text-sm">
            You haven't participated in any completed matchdays yet.
          </Panel>
        ) : (
          <div className="space-y-2">
            {matches.map((m, idx) => {
              const myTeam = m.team;
              const myScore = myTeam === 'A' ? m.scoreA ?? 0 : m.scoreB ?? 0;
              const oppScore = myTeam === 'A' ? m.scoreB ?? 0 : m.scoreA ?? 0;
              const isWin = myScore > oppScore;
              const isDraw = myScore === oppScore;

              const dateStr = m.playedAt;
              const formattedDate = dateStr
                ? new Date(dateStr).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })
                : 'Match';

              return (
                <Panel key={m.matchdayId || idx} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center ${
                        isWin
                          ? 'bg-emerald-100 text-emerald-800'
                          : isDraw
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {isWin ? 'W' : isDraw ? 'D' : 'L'}
                    </span>

                    <div>
                      <span className="text-sm font-semibold text-slate-900 block">
                        Team {myTeam} vs Team {myTeam === 'A' ? 'B' : 'A'}
                      </span>
                      <span className="text-xs text-slate-400">{formattedDate}</span>
                    </div>
                  </div>

                  <div className="font-extrabold text-xl text-slate-900">
                    <span className={isWin ? 'text-emerald-600' : isDraw ? 'text-slate-800' : 'text-rose-600'}>
                      {myScore}
                    </span>
                    <span className="text-slate-300 font-normal mx-1">:</span>
                    <span className="text-slate-400">{oppScore}</span>
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </div>

      {/* Sign Out Card */}
      <div className="pt-2 text-center">
        <Button
          variant="secondary"
          onClick={() => logout()}
          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-slate-200"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out of Account</span>
        </Button>
      </div>
    </div>
  );
}
