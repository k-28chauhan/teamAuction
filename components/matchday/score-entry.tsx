'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { recordResult } from '@/lib/api-client';
import { useAuth } from '@/components/providers';
import type { Matchday, Player } from '@/lib/contract/types';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { PositionChip, RatingBadge } from '@/components/ui/chip';
import { Alert } from '@/components/ui/alert';
import { Trophy, CheckCircle2, Shield, Minus, Plus, Goal } from 'lucide-react';

interface ScoreEntryProps {
  matchday: Matchday;
  onRecorded: () => void;
}

function ScorerStepper({ player, goals, onChange }: { player: Player; goals: number; onChange: (next: number) => void }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-semibold text-slate-800 truncate">{player.displayName}</span>
        <PositionChip position={player.position} />
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, goals - 1))}
          disabled={goals === 0}
          className="w-6 h-6 rounded-md border border-slate-300 bg-white flex items-center justify-center text-slate-500 disabled:opacity-30 hover:bg-slate-100"
          aria-label={`Remove a goal from ${player.displayName}`}
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="w-5 text-center font-bold text-slate-900">{goals}</span>
        <button
          type="button"
          onClick={() => onChange(goals + 1)}
          className="w-6 h-6 rounded-md border border-slate-300 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-100"
          aria-label={`Add a goal to ${player.displayName}`}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

export function ScoreEntry({ matchday, onRecorded }: ScoreEntryProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [scoreA, setScoreA] = useState<number>(0);
  const [scoreB, setScoreB] = useState<number>(0);
  const [goalsByPlayer, setGoalsByPlayer] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const canRecord =
    user?.isMaster ||
    user?.id === matchday.leaderA?.id ||
    user?.id === matchday.leaderB?.id;

  const setGoalsFor = (playerId: string, next: number) => {
    setGoalsByPlayer((prev) => ({ ...prev, [playerId]: next }));
  };

  const sumGoals = (team: Player[]) => team.reduce((sum, p) => sum + (goalsByPlayer[p.id] ?? 0), 0);
  const scorerSumA = sumGoals(matchday.teams.A);
  const scorerSumB = sumGoals(matchday.teams.B);
  const hasAnyScorers = scorerSumA > 0 || scorerSumB > 0;
  const scorersMatchScore = scorerSumA === scoreA && scorerSumB === scoreB;

  const resultMutation = useMutation({
    mutationFn: () => {
      const scorers = hasAnyScorers
        ? Object.entries(goalsByPlayer)
            .filter(([, goals]) => goals > 0)
            .map(([userId, goals]) => ({ userId, goals }))
        : undefined;
      return recordResult(matchday.id, scoreA, scoreB, scorers);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matchday', 'current'] });
      queryClient.invalidateQueries({ queryKey: ['matchdays'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      onRecorded();
    },
    onError: (err: any) => {
      setError(err.message || 'Unable to record score.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (scoreA < 0 || scoreB < 0) {
      setError('Scores cannot be negative.');
      return;
    }
    if (hasAnyScorers && !scorersMatchScore) {
      setError(
        `Goal scorers need to add up to the score — Team A: ${scorerSumA} of ${scoreA}, Team B: ${scorerSumB} of ${scoreB}.`
      );
      return;
    }
    setError(null);
    resultMutation.mutate();
  };

  return (
    <div className="py-4 space-y-6 max-w-4xl mx-auto">
      {/* Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-6 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-xs font-semibold mb-1">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>Match in Progress</span>
          </div>
          <h2 className="text-2xl font-extrabold">Teams Locked & Playing</h2>
          <p className="text-xs text-emerald-100 max-w-md">
            Lineups are set on the turf. Enter and submit the final score when the whistle blows.
          </p>
        </div>

        <div className="text-right self-start sm:self-auto">
          <span className="text-xs text-emerald-100/90 block">Method</span>
          <span className="text-sm font-bold bg-white/10 px-3 py-1 rounded-xl border border-white/20 inline-block mt-0.5">
            {matchday.method === 'auction' ? 'Credit Auction' : 'Balanced Shuffle'}
          </span>
        </div>
      </div>

      {error && <Alert message={error} onDismiss={() => setError(null)} />}

      {/* Duel Lineups */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Team A */}
        <Panel accentTop="team-a" className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-lg text-rose-600">Team A</span>
            <span className="text-xs text-slate-400">{matchday.teams.A.length} players</span>
          </div>

          <div className="space-y-1.5">
            {matchday.teams.A.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">{p.displayName}</span>
                  {p.id === matchday.leaderA?.id && (
                    <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded font-bold">
                      C
                    </span>
                  )}
                  <PositionChip position={p.position} />
                </div>
                <RatingBadge rating={p.rating} />
              </div>
            ))}
          </div>
        </Panel>

        {/* Team B */}
        <Panel accentTop="team-b" className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-lg text-blue-600">Team B</span>
            <span className="text-xs text-slate-400">{matchday.teams.B.length} players</span>
          </div>

          <div className="space-y-1.5">
            {matchday.teams.B.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">{p.displayName}</span>
                  {p.id === matchday.leaderB?.id && (
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">
                      C
                    </span>
                  )}
                  <PositionChip position={p.position} />
                </div>
                <RatingBadge rating={p.rating} />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Score Entry Form */}
      {canRecord ? (
        <Panel className="p-6 space-y-6 bg-white shadow-md border-slate-200">
          <div className="text-center space-y-1">
            <h3 className="text-lg font-bold text-slate-900">Record Final Score</h3>
            <p className="text-xs text-slate-500">
              Enter goals scored by each team to close the session and update the leaderboard.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center justify-center gap-5">
              <div className="text-center space-y-2">
                <label className="text-xs font-bold text-rose-600 uppercase tracking-wider block">
                  Team A
                </label>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={scoreA}
                  onChange={(e) => setScoreA(Math.max(0, Number(e.target.value)))}
                  className="w-24 h-20 rounded-2xl bg-slate-50 border-2 border-slate-300 text-center font-extrabold text-4xl text-slate-900 shadow-inner focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 font-bold text-xs flex items-center justify-center self-center mt-5">
                :
              </div>

              <div className="text-center space-y-2">
                <label className="text-xs font-bold text-blue-600 uppercase tracking-wider block">
                  Team B
                </label>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={scoreB}
                  onChange={(e) => setScoreB(Math.max(0, Number(e.target.value)))}
                  className="w-24 h-20 rounded-2xl bg-slate-50 border-2 border-slate-300 text-center font-extrabold text-4xl text-slate-900 shadow-inner focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Who scored? */}
            <div className="space-y-3 max-w-lg mx-auto">
              <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600">
                <Goal className="w-3.5 h-3.5" />
                <span>Who scored? (optional)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-0.5">
                    <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">Team A</span>
                    <span className={`text-[11px] font-semibold ${scorerSumA === scoreA ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {scorerSumA} / {scoreA}
                    </span>
                  </div>
                  {matchday.teams.A.map((p) => (
                    <ScorerStepper key={p.id} player={p} goals={goalsByPlayer[p.id] ?? 0} onChange={(v) => setGoalsFor(p.id, v)} />
                  ))}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-0.5">
                    <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Team B</span>
                    <span className={`text-[11px] font-semibold ${scorerSumB === scoreB ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {scorerSumB} / {scoreB}
                    </span>
                  </div>
                  {matchday.teams.B.map((p) => (
                    <ScorerStepper key={p.id} player={p} goals={goalsByPlayer[p.id] ?? 0} onChange={(v) => setGoalsFor(p.id, v)} />
                  ))}
                </div>
              </div>

              {hasAnyScorers && !scorersMatchScore && (
                <p className="text-[11px] text-amber-700 text-center">
                  Scorer goals need to add up to the score above before you can submit — or clear them all to skip.
                </p>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={hasAnyScorers && !scorersMatchScore}
              className="w-full py-3 text-base font-bold shadow-md shadow-emerald-600/20"
              isLoading={resultMutation.isPending}
            >
              <span>Record Score & Save Result</span>
              <CheckCircle2 className="w-5 h-5" />
            </Button>
          </form>
        </Panel>
      ) : (
        <div className="p-4 rounded-2xl bg-white border border-slate-200 text-center text-xs text-slate-500">
          The score will be recorded by team captains or the organiser after the game concludes.
        </div>
      )}
    </div>
  );
}
