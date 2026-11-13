'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { recordResult } from '@/lib/api-client';
import type { Matchday, Player } from '@/lib/contract/types';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { PositionChip } from '@/components/ui/chip';
import { Check, Minus, Plus, X } from 'lucide-react';

function GoalStepper({
  player,
  goals,
  onChange,
}: {
  player: Player;
  goals: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/80 text-xs shadow-sm">
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

/**
 * Master-only editor for a finished match. The score can't be typed in — it is
 * always the sum of each team's player goals, so the two can never disagree.
 * Saves through POST /result, which only lets the master touch a completed match.
 */
export function MatchEditor({ matchday, onClose }: { matchday: Matchday; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [goalsByPlayer, setGoalsByPlayer] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const s of matchday.scorers ?? []) initial[s.userId] = s.goals;
    return initial;
  });
  const [error, setError] = useState<string | null>(null);

  const sumFor = (team: Player[], goals: Record<string, number>) =>
    team.reduce((sum, p) => sum + (goals[p.id] ?? 0), 0);

  const goalsSumA = sumFor(matchday.teams.A, goalsByPlayer);
  const goalsSumB = sumFor(matchday.teams.B, goalsByPlayer);

  const mutation = useMutation({
    mutationFn: () => {
      const scorers = Object.entries(goalsByPlayer)
        .filter(([, goals]) => goals > 0)
        .map(([userId, goals]) => ({ userId, goals }));
      return recordResult(matchday.id, goalsSumA, goalsSumB, scorers);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matchdays'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['player-stats'] });
      onClose();
    },
    onError: (err: Error) => setError(err.message || 'Unable to save changes.'),
  });

  const setGoalsFor = (playerId: string, next: number) =>
    setGoalsByPlayer((prev) => ({ ...prev, [playerId]: next }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700">Edit goals per player</span>
        <span className="text-xs text-slate-500">The match score updates automatically</span>
      </div>

      {error && <Alert message={error} onDismiss={() => setError(null)} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(['A', 'B'] as const).map((t) => (
          <div key={t} className="space-y-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span
                className={`text-[11px] font-bold uppercase tracking-wider ${
                  t === 'A' ? 'text-rose-600' : 'text-blue-600'
                }`}
              >
                Team {t}
              </span>
              <span className="text-[11px] font-semibold text-slate-600">
                {t === 'A' ? goalsSumA : goalsSumB} goals
              </span>
            </div>
            {matchday.teams[t].map((p) => (
              <GoalStepper
                key={p.id}
                player={p}
                goals={goalsByPlayer[p.id] ?? 0}
                onChange={(v) => setGoalsFor(p.id, v)}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-slate-500">
          Will save as{' '}
          <strong className="text-slate-900">
            {goalsSumA} : {goalsSumB}
          </strong>
        </span>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={mutation.isPending}>
            <X className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            isLoading={mutation.isPending}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
          >
            <Check className="w-3.5 h-3.5" />
            <span>Save changes</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
