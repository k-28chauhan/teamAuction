'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLeaderboard } from '@/lib/api-client';
import { Panel } from '@/components/ui/panel';
import { PositionChip, RatingBadge } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { Award, Trophy, Medal, TrendingUp, Flame } from 'lucide-react';

export default function LeaderboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: getLeaderboard,
  });

  const rows = data?.rows ?? [];
  const topThree = rows.slice(0, 3);

  if (isLoading) {
    return (
      <div className="py-4 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-36 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-36 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="py-4 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          Player Standings
        </h1>
        <p className="text-xs text-slate-500">
          Rankings calculated by win rate, match victories, and goal differential.
        </p>
      </div>

      {rows.length === 0 ? (
        <Panel className="p-10 text-center space-y-2">
          <Award className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="font-bold text-base text-slate-900">No matches recorded yet</h3>
          <p className="text-xs text-slate-500">
            Leaderboard stats will automatically calculate as soon as matches finish.
          </p>
        </Panel>
      ) : (
        <>
          {/* Top 3 Podium Cards */}
          {topThree.length >= 2 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-4 pb-2">
              {/* 2nd Place */}
              {topThree[1] && (
                <Panel className="p-5 text-center space-y-3 order-2 sm:order-1 border-slate-200 bg-gradient-to-b from-white to-slate-50">
                  <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center mx-auto shadow-sm">
                    2
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-bold text-base text-slate-900">
                      {topThree[1].player.displayName}
                    </h3>
                    <PositionChip position={topThree[1].player.position} />
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-2xl font-extrabold text-slate-800">
                      {topThree[1].stats.winRate}%
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      {topThree[1].stats.won}W · {topThree[1].stats.played}P
                    </span>
                  </div>
                </Panel>
              )}

              {/* 1st Place */}
              {topThree[0] && (
                <Panel className="p-6 text-center space-y-3 order-1 sm:order-2 border-emerald-300 bg-gradient-to-b from-emerald-50/50 to-white shadow-md relative sm:-translate-y-2">
                  <div className="w-10 h-10 rounded-full bg-amber-400 text-amber-950 font-extrabold text-sm flex items-center justify-center mx-auto shadow-md">
                    👑 1
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-extrabold text-lg text-slate-900">
                      {topThree[0].player.displayName}
                    </h3>
                    <div className="flex items-center justify-center gap-1.5">
                      <PositionChip position={topThree[0].player.position} />
                      <RatingBadge rating={topThree[0].player.rating} />
                    </div>
                  </div>
                  <div className="pt-2 border-t border-emerald-100">
                    <span className="text-3xl font-extrabold text-emerald-700">
                      {topThree[0].stats.winRate}%
                    </span>
                    <span className="text-xs text-emerald-800/80 font-medium block">
                      {topThree[0].stats.won} Wins / {topThree[0].stats.played} Played
                    </span>
                  </div>
                </Panel>
              )}

              {/* 3rd Place */}
              {topThree[2] && (
                <Panel className="p-5 text-center space-y-3 order-3 border-slate-200 bg-gradient-to-b from-white to-slate-50">
                  <div className="w-8 h-8 rounded-full bg-amber-700/20 text-amber-900 font-bold text-xs flex items-center justify-center mx-auto shadow-sm">
                    3
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-bold text-base text-slate-900">
                      {topThree[2].player.displayName}
                    </h3>
                    <PositionChip position={topThree[2].player.position} />
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-2xl font-extrabold text-slate-800">
                      {topThree[2].stats.winRate}%
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      {topThree[2].stats.won}W · {topThree[2].stats.played}P
                    </span>
                  </div>
                </Panel>
              )}
            </div>
          )}

          {/* Full Standings Table */}
          <Panel className="overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">Rank</th>
                    <th className="py-3 px-4">Player</th>
                    <th className="py-3 px-3 text-center">Played</th>
                    <th className="py-3 px-3 text-center">Won</th>
                    <th className="py-3 px-3 text-center">Drawn</th>
                    <th className="py-3 px-3 text-center">Lost</th>
                    <th className="py-3 px-4 text-center">Goals</th>
                    <th className="py-3 px-4 text-right">Win Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, idx) => {
                    const rank = idx + 1;
                    const isTopThree = rank <= 3;

                    return (
                      <tr key={row.player.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 text-center font-bold text-xs text-slate-500">
                          {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                              {row.player.displayName.charAt(0)}
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 block leading-tight">
                                {row.player.displayName}
                              </span>
                              <span className="text-[11px] text-slate-400 leading-tight">
                                @{row.player.username}
                              </span>
                            </div>
                            <PositionChip position={row.player.position} />
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-center font-semibold text-slate-800">
                          {row.stats.played}
                        </td>
                        <td className="py-3.5 px-3 text-center font-semibold text-emerald-600">
                          {row.stats.won}
                        </td>
                        <td className="py-3.5 px-3 text-center text-slate-500">
                          {row.stats.drawn}
                        </td>
                        <td className="py-3.5 px-3 text-center text-rose-500">
                          {row.stats.lost}
                        </td>

                        <td className="py-3.5 px-4 text-center text-xs text-slate-600 font-medium">
                          {row.stats.goalsFor} : {row.stats.goalsAgainst}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden hidden sm:block">
                              <div
                                className="h-full bg-emerald-600 rounded-full"
                                style={{ width: `${row.stats.winRate}%` }}
                              />
                            </div>
                            <span className="font-extrabold text-slate-900 text-sm">
                              {row.stats.winRate}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
