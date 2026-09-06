'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shuffle as apiShuffle, lock as apiLock, getMatchdayState, getPlayers, cancelMatchday } from '@/lib/api-client';
import { useAuth } from '@/components/providers';
import type { Matchday, Player } from '@/lib/contract/types';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { PositionChip, RatingBadge } from '@/components/ui/chip';
import { Alert } from '@/components/ui/alert';
import { Shuffle, Check, RefreshCw, Scale } from 'lucide-react';

interface LiveShuffleProps {
  matchday: Matchday;
  onLocked: () => void;
}

export function LiveShuffle({ matchday, onLocked }: LiveShuffleProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // Only meaningful when it was this client's own shuffle that produced the
  // currently-displayed split — the server doesn't persist these two figures.
  const [lastRollStats, setLastRollStats] = useState<{ splitId: string; diff: number; legalCount: number } | null>(null);

  const isLeaderOrMaster =
    user?.isMaster ||
    user?.id === matchday.leaderA?.id ||
    user?.id === matchday.leaderB?.id;

  const { data: playersData } = useQuery({
    queryKey: ['players', 'all'],
    queryFn: () => getPlayers(true),
  });
  const playersById = new Map<string, Player>();
  playersData?.players?.forEach((p) => playersById.set(p.id, p));

  // The single source of truth both captains' phones converge on — same
  // pattern as the live auction screen, and for the same reason: without
  // continuous polling, two people looking at "the same" draft are really
  // just looking at their own local guesses.
  const stateQuery = useQuery({
    queryKey: ['matchday', matchday.id, 'state'],
    queryFn: () => getMatchdayState(matchday.id),
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });
  const pendingSplit = stateQuery.data?.state?.pendingSplit ?? null;

  const shuffleMutation = useMutation({
    mutationFn: () => apiShuffle(matchday.id),
    onSuccess: (data) => {
      setLastRollStats({ splitId: data.splitId, diff: data.diff, legalCount: data.legalCount });
      setError(null);
      stateQuery.refetch();
    },
    onError: (err: any) => {
      setError(err.message || 'Unable to generate fair split.');
    },
  });

  const lockMutation = useMutation({
    mutationFn: (splitId: string) => apiLock(matchday.id, splitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matchday', 'current'] });
      onLocked();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to lock teams. Try re-rolling.');
      stateQuery.refetch();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelMatchday(matchday.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matchday', 'current'] });
    },
  });

  // Propose the first split once we know for certain the server has none yet
  // — gated on the initial poll landing, so two captains opening this screen
  // at the same moment don't each fire off their own uncoordinated shuffle.
  useEffect(() => {
    if (stateQuery.isSuccess && !pendingSplit && isLeaderOrMaster && !shuffleMutation.isPending) {
      shuffleMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateQuery.isSuccess, pendingSplit, isLeaderOrMaster]);

  const teamAPlayers = pendingSplit?.teamAIds.map((id) => playersById.get(id)!).filter(Boolean) ?? [];
  const teamBPlayers = pendingSplit?.teamBIds.map((id) => playersById.get(id)!).filter(Boolean) ?? [];

  const totalRatingA = teamAPlayers.reduce((sum, p) => sum + p.rating, 0);
  const totalRatingB = teamBPlayers.reduce((sum, p) => sum + p.rating, 0);
  const ratingGap = Math.abs(totalRatingA - totalRatingB);

  const rollStatsMatchCurrent = lastRollStats && lastRollStats.splitId === pendingSplit?.splitId ? lastRollStats : null;

  return (
    <div className="py-4 space-y-6 max-w-4xl mx-auto">
      {/* Header banner */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 font-bold">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                Balanced Shuffle
              </span>
              {pendingSplit && (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Rating gap: {ratingGap} pt{ratingGap === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              Algorithmically Balanced Lineups
            </h2>
          </div>
        </div>

        {rollStatsMatchCurrent && (
          <span className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            {rollStatsMatchCurrent.legalCount} fair splits evaluated
          </span>
        )}
      </div>

      {error && <Alert message={error} onDismiss={() => setError(null)} />}

      {!pendingSplit && !isLeaderOrMaster && (
        <Panel className="p-8 text-center text-sm text-slate-500">
          Waiting for a captain to propose a split.
        </Panel>
      )}

      {/* Duel Team Lineups */}
      {pendingSplit && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Team A */}
          <Panel accentTop="team-a" className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-extrabold text-lg text-rose-600 block">Team A</span>
                <span className="text-xs text-slate-400">Total Skill Rating: {totalRatingA}</span>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                {teamAPlayers.length} Players
              </span>
            </div>

            <div className="space-y-2">
              {teamAPlayers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700">
                      {p.displayName.charAt(0)}
                    </div>
                    <span className="font-semibold text-slate-900">{p.displayName}</span>
                    <PositionChip position={p.position} />
                  </div>
                  <RatingBadge rating={p.rating} />
                </div>
              ))}
            </div>
          </Panel>

          {/* Team B */}
          <Panel accentTop="team-b" className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-extrabold text-lg text-blue-600 block">Team B</span>
                <span className="text-xs text-slate-400">Total Skill Rating: {totalRatingB}</span>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {teamBPlayers.length} Players
              </span>
            </div>

            <div className="space-y-2">
              {teamBPlayers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700">
                      {p.displayName.charAt(0)}
                    </div>
                    <span className="font-semibold text-slate-900">{p.displayName}</span>
                    <PositionChip position={p.position} />
                  </div>
                  <RatingBadge rating={p.rating} />
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* Control Actions */}
      {isLeaderOrMaster ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          <Button
            variant="secondary"
            size="lg"
            isLoading={shuffleMutation.isPending}
            onClick={() => shuffleMutation.mutate()}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="w-4 h-4 text-slate-500" />
            <span>Re-roll Lineup</span>
          </Button>

          <Button
            variant="primary"
            size="lg"
            disabled={!pendingSplit}
            isLoading={lockMutation.isPending}
            onClick={() => pendingSplit && lockMutation.mutate(pendingSplit.splitId)}
            className="w-full sm:w-auto shadow-md shadow-emerald-600/20 px-8"
          >
            <Check className="w-4 h-4" />
            <span>Lock In Teams</span>
          </Button>
        </div>
      ) : (
        <p className="text-xs text-slate-500 text-center py-3">
          Waiting for captains to review and lock the balanced split.
        </p>
      )}
    </div>
  );
}
