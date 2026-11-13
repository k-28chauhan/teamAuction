'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMatchdays, deleteMatchday } from '@/lib/api-client';
import { useAuth } from '@/components/providers';
import type { Matchday, Player } from '@/lib/contract/types';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { PositionChip, RatingBadge, PriceChip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { MatchEditor } from '@/components/matchday/match-editor';
import { Calendar, ChevronDown, ChevronUp, History, Pencil, Trash2 } from 'lucide-react';

/** What a player was won for at auction in this match (undefined for captains and shuffle matches). */
function priceById(m: Matchday, playerId: string): number | undefined {
  return m.prices?.find((p) => p.userId === playerId)?.price;
}

export default function ResultsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isMaster = !!user?.isMaster;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['matchdays', 'results'],
    queryFn: () => getMatchdays(20),
  });

  const invalidateAfterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['matchdays'] });
    queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
  };

  const deleteMutation = useMutation({
    mutationFn: (matchdayId: string) => deleteMatchday(matchdayId),
    onSuccess: invalidateAfterChange,
    onError: (err: any) => setActionError(err.message || 'Unable to delete matchday.'),
  });

  // Opening the editor also opens the card, since the editor lives in its drawer.
  const startEditing = (m: Matchday) => {
    setEditingId(m.id);
    setExpandedId(m.id);
    setActionError(null);
  };

  const matchdays = data?.matchdays?.filter((m) => m.status === 'completed') ?? [];

  if (isLoading) {
    return (
      <div className="py-4 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    );
  }

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="py-4 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Results Archive
          </h1>
          <p className="text-xs text-slate-500">
            Historical matchday scores, winning teams, and player auction records.
          </p>
        </div>

        <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 shadow-sm self-start sm:self-auto">
          {matchdays.length} Matches Logged
        </span>
      </div>

      {actionError && <Alert message={actionError} onDismiss={() => setActionError(null)} />}

      {matchdays.length === 0 ? (
        <Panel className="p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <History className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-base text-slate-900">No match records yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Once a live matchday is completed and the score is entered, it will be archived here.
          </p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {matchdays.map((m) => {
            const isExpanded = expandedId === m.id;
            const scoreA = m.scoreA ?? 0;
            const scoreB = m.scoreB ?? 0;
            const isDraw = scoreA === scoreB;
            const winner = scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : null;

            const dateStr = m.playedAt || m.createdAt;
            const formattedDate = new Date(dateStr).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            });

            return (
              <Panel
                key={m.id}
                hoverable
                className="overflow-hidden cursor-pointer transition-all"
                onClick={() => toggleExpand(m.id)}
              >
                {/* Main Summary Row */}
                <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{formattedDate}</span>
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {m.method === 'auction' ? 'Credit Auction' : 'Balanced Shuffle'}
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold text-base sm:text-lg ${
                            winner === 'A' ? 'text-rose-600' : 'text-slate-700'
                          }`}
                        >
                          Team A
                        </span>
                        {m.leaderA && (
                          <span className="text-xs text-slate-400">({m.leaderA.displayName})</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-100 font-extrabold text-xl sm:text-2xl text-slate-900">
                        <span>{scoreA}</span>
                        <span className="text-slate-400 font-normal">:</span>
                        <span>{scoreB}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold text-base sm:text-lg ${
                            winner === 'B' ? 'text-blue-600' : 'text-slate-700'
                          }`}
                        >
                          Team B
                        </span>
                        {m.leaderB && (
                          <span className="text-xs text-slate-400">({m.leaderB.displayName})</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-full border ${
                        isDraw
                          ? 'border-slate-200 text-slate-600 bg-slate-50'
                          : winner === 'A'
                          ? 'border-rose-200 text-rose-700 bg-rose-50'
                          : 'border-blue-200 text-blue-700 bg-blue-50'
                      }`}
                    >
                      {isDraw ? 'Draw' : `Team ${winner} Victory`}
                    </span>

                    {(
                      <div className="flex items-center gap-1">
                        {isMaster && (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => startEditing(m)}
                              className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-emerald-600 hover:border-emerald-300 flex items-center justify-center"
                              aria-label="Edit match"
                              title="Edit match (score & goals)"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Delete this matchday (${scoreA}:${scoreB})? This cannot be undone.`)) {
                                  deleteMutation.mutate(m.id);
                                }
                              }}
                              disabled={deleteMutation.isPending}
                              className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-rose-600 hover:border-rose-300 flex items-center justify-center disabled:opacity-50"
                              aria-label="Delete matchday"
                              title="Delete matchday"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <div className="text-slate-400 hover:text-slate-600 flex items-center gap-1 text-xs">
                          <span className="hidden sm:inline">{isExpanded ? 'Hide' : 'Lineups'}</span>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded Lineup Drawer */}
                {isExpanded && (
                  <div
                    className="border-t border-slate-100 bg-slate-50/70 p-5 space-y-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isMaster && editingId === m.id ? (
                      <MatchEditor matchday={m} onClose={() => setEditingId(null)} />
                    ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Team A List */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                          <span className="text-xs font-bold uppercase tracking-wider text-rose-600">
                            Team A Lineup
                          </span>
                          <span className="text-xs text-slate-400">
                            {m.teams.A.length} players
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {m.teams.A.map((player: Player) => (
                            <div
                              key={player.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/80 text-xs shadow-sm"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-800">
                                  {player.displayName}
                                </span>
                                {player.id === m.leaderA?.id && (
                                  <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-1 rounded font-bold">
                                    Captain
                                  </span>
                                )}
                                <PositionChip position={player.position} />
                                {(m.scorers?.find((s) => s.userId === player.id)?.goals ?? 0) > 0 && (
                                  <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1 rounded font-bold">
                                    ⚽ {m.scorers.find((s) => s.userId === player.id)!.goals}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                {priceById(m, player.id) !== undefined && <PriceChip price={priceById(m, player.id)!} />}
                                <RatingBadge rating={player.rating} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Team B List */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                          <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                            Team B Lineup
                          </span>
                          <span className="text-xs text-slate-400">
                            {m.teams.B.length} players
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {m.teams.B.map((player: Player) => (
                            <div
                              key={player.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/80 text-xs shadow-sm"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-800">
                                  {player.displayName}
                                </span>
                                {player.id === m.leaderB?.id && (
                                  <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1 rounded font-bold">
                                    Captain
                                  </span>
                                )}
                                <PositionChip position={player.position} />
                                {(m.scorers?.find((s) => s.userId === player.id)?.goals ?? 0) > 0 && (
                                  <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1 rounded font-bold">
                                    ⚽ {m.scorers.find((s) => s.userId === player.id)!.goals}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                {priceById(m, player.id) !== undefined && <PriceChip price={priceById(m, player.id)!} />}
                                <RatingBadge rating={player.rating} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    )}

                    {!(isMaster && editingId === m.id) && (m.prices?.length ?? 0) > 0 && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                            Bidding record
                          </span>
                          <span className="text-xs text-slate-400">
                            {m.prices.reduce((sum, p) => sum + p.price, 0)} cr spent in total
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {[...m.prices]
                            .sort((a, b) => b.price - a.price)
                            .map((pr) => {
                              const player = [...m.teams.A, ...m.teams.B].find((p) => p.id === pr.userId);
                              if (!player) return null;
                              const team = m.teams.A.some((p) => p.id === pr.userId) ? 'A' : 'B';
                              return (
                                <div
                                  key={pr.userId}
                                  className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/80 text-xs shadow-sm"
                                >
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-[10px] font-bold px-1.5 rounded border ${
                                        team === 'A'
                                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                                          : 'bg-blue-50 text-blue-700 border-blue-200'
                                      }`}
                                    >
                                      {team}
                                    </span>
                                    <span className="font-semibold text-slate-800">{player.displayName}</span>
                                  </div>
                                  <PriceChip price={pr.price} />
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
