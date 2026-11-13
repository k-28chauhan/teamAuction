'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMatchdayState,
  getPlayers,
  nominate as apiNominate,
  respond as apiRespond,
  bid as apiBid,
  cancelMatchday,
} from '@/lib/api-client';
import { useAuth } from '@/components/providers';
import type { Matchday, Player, Team } from '@/lib/contract/types';
import { STARTING_BID, maxBid as engineMaxBid, type DraftContext } from '@/lib/draft/engine';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { PositionChip, RatingBadge, PriceChip } from '@/components/ui/chip';
import { Alert } from '@/components/ui/alert';
import {
  Gavel,
  Coins,
  Clock,
  CheckCircle2,
  Users,
  AlertTriangle,
  ArrowUpRight,
  Shield,
} from 'lucide-react';

interface LiveAuctionProps {
  matchday: Matchday;
  onFinished: () => void;
}

export function LiveAuction({ matchday, onFinished }: LiveAuctionProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [staleNote, setStaleNote] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pollFailures, setPollFailures] = useState(0);

  // Price inputs for nomination
  const [nominatePrices, setNominatePrices] = useState<Record<string, number>>({});

  // Polling state
  const stateQuery = useQuery({
    queryKey: ['matchday', matchday.id, 'state'],
    queryFn: async () => {
      try {
        const res = await getMatchdayState(matchday.id);
        setPollFailures(0);
        return res;
      } catch (err) {
        setPollFailures((prev) => prev + 1);
        throw err;
      }
    },
    refetchInterval: 2000,
    // Keep polling even when this tab isn't the focused one. TanStack Query
    // pauses refetchInterval on document.hidden by default, which is fine for
    // most screens but wrong here: a captain glancing at another app or a
    // second tab for a few seconds would otherwise see a frozen auction until
    // they tap back in. A live turn-based screen has to actually stay live.
    refetchIntervalInBackground: true,
  });

  // Players lookup — the matchday's own roster (from /state) carries each
  // player's role for TONIGHT, which can differ from their profile position
  // (see matchdayPlayers.position); fall back to profile data only for the
  // instant before the first poll lands.
  const { data: playersData } = useQuery({
    queryKey: ['players', 'all'],
    queryFn: () => getPlayers(true),
  });
  const roster = stateQuery.data?.roster ?? playersData?.players ?? [];
  const prices = stateQuery.data?.prices ?? {};
  const playersById = new Map<string, Player>();
  roster.forEach((p) => playersById.set(p.id, p));

  // The exact same pure logic the server enforces — imported, not re-derived,
  // so the "max bid" shown here can never drift from what the API accepts.
  const ctx: DraftContext = useMemo(
    () => ({ teamSize: matchday.teamSize, style: (matchday.style ?? 'price') as 'price' | 'open' }),
    [matchday.teamSize, matchday.style]
  );

  const state = stateQuery.data?.state ?? (matchday as any).state;
  const version = stateQuery.data?.version ?? 1;
  const permissions = stateQuery.data?.permissions ?? {
    isMaster: !!user?.isMaster,
    isLeader: user?.id === matchday.leaderA?.id || user?.id === matchday.leaderB?.id,
    team: user?.id === matchday.leaderA?.id ? 'A' : user?.id === matchday.leaderB?.id ? 'B' : null,
    canAct: false,
  };

  useEffect(() => {
    if (state?.phase === 'complete') {
      onFinished();
    }
  }, [state?.phase, onFinished]);

  const cancelMutation = useMutation({
    mutationFn: () => cancelMatchday(matchday.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matchday', 'current'] });
    },
  });

  const calculateMaxBid = (team: Team, excludePlayerId?: string) => {
    if (!state) return 0;
    return engineMaxBid(state.teams[team], ctx, state.poolIds, excludePlayerId);
  };

  // Actions
  const [isNominating, setIsNominating] = useState(false);
  const handleNominate = async (playerId: string) => {
    const price = nominatePrices[playerId] || STARTING_BID;
    setActionError(null);
    setStaleNote(null);
    setIsNominating(true);

    try {
      await apiNominate(matchday.id, version, playerId, price);
      await stateQuery.refetch();
    } catch (err: any) {
      if (err.code === 'STALE_VERSION') {
        setStaleNote('Someone just made a move — refreshed to latest state.');
        await stateQuery.refetch();
      } else {
        setActionError(err.message || 'Unable to nominate.');
      }
    } finally {
      setIsNominating(false);
    }
  };

  const [isResponding, setIsResponding] = useState(false);
  const handleRespond = async (action: 'take' | 'pass') => {
    setActionError(null);
    setStaleNote(null);
    setIsResponding(true);

    try {
      await apiRespond(matchday.id, version, action);
      await stateQuery.refetch();
    } catch (err: any) {
      if (err.code === 'STALE_VERSION') {
        setStaleNote('Someone just made a move — refreshed to latest state.');
        await stateQuery.refetch();
      } else {
        setActionError(err.message || 'Unable to respond.');
      }
    } finally {
      setIsResponding(false);
    }
  };

  const [isBidding, setIsBidding] = useState(false);
  const handleBid = async (action: 'raise' | 'pass', amount?: 1 | 5) => {
    setActionError(null);
    setStaleNote(null);
    setIsBidding(true);

    try {
      await apiBid(matchday.id, version, action, amount);
      await stateQuery.refetch();
    } catch (err: any) {
      if (err.code === 'STALE_VERSION') {
        setStaleNote('Someone just made a move — refreshed to latest state.');
        await stateQuery.refetch();
      } else {
        setActionError(err.message || 'Unable to place bid.');
      }
    } finally {
      setIsBidding(false);
    }
  };

  if (!state) {
    return (
      <div className="py-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Panel className="h-40" />
          <Panel className="h-40" />
        </div>
      </div>
    );
  }

  const poolPlayers = state.poolIds.map((id: string) => playersById.get(id)!).filter(Boolean);
  const initialBudget = matchday.budget || matchday.teamSize * 3;

  return (
    <div className="space-y-6 py-2 max-w-5xl mx-auto">
      {/* Alert bars */}
      {pollFailures >= 3 && (
        <Alert message="Reconnecting to draft server..." variant="reconnecting" />
      )}
      {staleNote && <Alert message={staleNote} variant="info" onDismiss={() => setStaleNote(null)} />}
      {actionError && <Alert message={actionError} variant="error" onDismiss={() => setActionError(null)} />}

      {/* Draft Status Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold">
            <Gavel className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Live Credit Auction
              </span>
              <span className="text-xs text-slate-400">
                {matchday.style === 'open' ? 'Open Bidding' : 'Name Your Price'}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              {state.phase === 'complete' ? 'Draft complete' : 'Pick any player'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
            {poolPlayers.length} Unsold Players in Pool
          </span>
        </div>
      </div>

      {/* TOP: TEAM DECKS (Side-by-side) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(['A', 'B'] as Team[]).map((t) => {
          const teamState = state.teams[t];
          const isA = t === 'A';
          const leader = isA ? matchday.leaderA : matchday.leaderB;
          const spent = Math.max(0, initialBudget - teamState.budget);
          const spentPct = Math.min(100, Math.round((spent / initialBudget) * 100));
          const players = teamState.playerIds.map((id: string) => playersById.get(id)!).filter(Boolean);
          const emptySlots = Math.max(0, matchday.teamSize - players.length);
          const isTurn = state.turn === t && state.phase === 'nominate';

          return (
            <Panel
              key={t}
              accentTop={isA ? 'team-a' : 'team-b'}
              className={`p-5 space-y-4 transition-all ${
                isTurn ? 'ring-2 ring-emerald-500/40 shadow-md' : ''
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-extrabold text-xl ${
                        isA ? 'text-rose-600' : 'text-blue-600'
                      }`}
                    >
                      Team {t}
                    </span>
                    {leader && (
                      <span className="text-xs font-medium text-slate-500">
                        ({leader.displayName})
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">
                    Max allowed bid: <strong>{calculateMaxBid(t)} cr</strong>
                  </span>
                </div>

                <div className="text-right">
                  <div className="flex items-center justify-end gap-1 text-slate-900 font-extrabold text-2xl">
                    <Coins className="w-5 h-5 text-amber-500" />
                    <span>{teamState.budget}</span>
                    <span className="text-xs font-normal text-slate-400">cr</span>
                  </div>
                  <span className="text-[11px] text-slate-400">budget remaining</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Spent: {spent}cr</span>
                  <span>{players.length} / {matchday.teamSize} filled</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isA ? 'bg-rose-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${spentPct}%` }}
                  />
                </div>
              </div>

              {/* Squad list & empty slot placeholders */}
              <div className="space-y-1.5 pt-1">
                {players.map((p: Player) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <PositionChip position={p.position} />
                      <span className="font-semibold text-slate-800">{p.displayName}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {p.id === teamState.leaderId ? (
                        <span className="text-[10px] font-bold text-slate-500">Captain</span>
                      ) : prices[p.id] !== undefined ? (
                        <PriceChip price={prices[p.id]!} />
                      ) : null}
                      <RatingBadge rating={p.rating} />
                    </div>
                  </div>
                ))}

                {Array.from({ length: emptySlots }).map((_, idx) => (
                  <div
                    key={`empty-${idx}`}
                    className="flex items-center justify-center py-2 rounded-lg border border-dashed border-slate-200 text-xs text-slate-400 bg-slate-50/50"
                  >
                    Empty Slot {players.length + idx + 1}
                  </div>
                ))}
              </div>
            </Panel>
          );
        })}
      </div>

      {/* CENTER: ACTION ARENA */}
      <Panel className="p-6 border-slate-200/90 shadow-md space-y-5 bg-gradient-to-b from-white to-slate-50/50">
        {/* PHASE 1: NOMINATE */}
        {state.phase === 'nominate' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 block">
                  Nomination Turn
                </span>
                <h3 className="text-xl font-extrabold text-slate-900">
                  Team {state.turn} to put a player up for bid
                </h3>
              </div>

              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                Team {state.turn} Max Bid: {calculateMaxBid(state.turn)} cr
              </span>
            </div>

            {permissions.canAct ? (
              <div className="space-y-2.5 max-h-[42vh] overflow-y-auto pr-1">
                {poolPlayers.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">
                    No players left in the pool.
                  </p>
                ) : (
                  poolPlayers.map((player: Player) => {
                    const startingPrice = STARTING_BID;
                    const price = nominatePrices[player.id] ?? startingPrice;
                    const maxAllowed = calculateMaxBid(state.turn, player.id);
                    const isOpenStyle = matchday.style === 'open';

                    return (
                      <div
                        key={player.id}
                        className="flex items-center justify-between p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-sm hover:border-slate-300 transition-all gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
                            {player.displayName.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-sm text-slate-900 block truncate">
                              {player.displayName}
                            </span>
                            <span className="text-xs text-slate-400 block">
                              @{player.username}
                            </span>
                          </div>
                          <PositionChip position={player.position} />
                          <RatingBadge rating={player.rating} />
                          <span className="text-[11px] text-slate-400 whitespace-nowrap">from {startingPrice}cr</span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {!isOpenStyle && (
                            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                              <input
                                type="number"
                                min={startingPrice}
                                max={maxAllowed}
                                value={price}
                                onChange={(e) => {
                                  const val = Math.max(startingPrice, Math.min(maxAllowed, Number(e.target.value)));
                                  setNominatePrices((prev) => ({ ...prev, [player.id]: val }));
                                }}
                                className="w-12 bg-transparent text-center font-bold text-sm text-slate-900 focus:outline-none"
                              />
                              <span className="text-xs text-slate-500 font-medium">cr</span>
                            </div>
                          )}

                          <Button
                            variant="primary"
                            size="sm"
                            isLoading={isNominating}
                            onClick={() => handleNominate(player.id)}
                            className="shadow-sm shadow-emerald-600/20 font-semibold"
                          >
                            <span>{isOpenStyle ? 'Nominate' : 'Offer Player'}</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="text-center py-8 space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-2">
                  <Clock className="w-6 h-6 animate-pulse text-emerald-600" />
                </div>
                <p className="text-base font-bold text-slate-900">
                  Waiting for Team {state.turn}
                </p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Team {state.turn} captain is reviewing the available squad and selecting the next nominee.
                </p>
              </div>
            )}
          </div>
        )}

        {/* PHASE 2: RESPOND (Name your price) */}
        {state.phase === 'respond' && state.nomination && (
          <div className="space-y-6">
            {(() => {
              const nom = state.nomination;
              const player = playersById.get(nom.playerId);
              const respondingTeam: Team = nom.nominatedBy === 'A' ? 'B' : 'A';
              const responderMax = calculateMaxBid(respondingTeam, nom.playerId);
              const cannotAfford = nom.price > responderMax;
              const cannotTake = cannotAfford;

              return (
                <div className="space-y-5">
                  <div className="text-center space-y-2 py-2">
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 inline-block">
                      Offered by Team {nom.nominatedBy}
                    </span>

                    <div className="flex items-center justify-center gap-2 pt-1">
                      {player && <PositionChip position={player.position} />}
                      <h3 className="text-3xl font-extrabold text-slate-900">
                        {player?.displayName ?? 'Player'}
                      </h3>
                      {player && <RatingBadge rating={player.rating} />}
                    </div>

                    <div className="inline-flex items-center gap-2 px-6 py-2 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-3xl font-extrabold shadow-sm mt-1">
                      <Coins className="w-7 h-7 text-amber-600" />
                      <span>{nom.price}</span>
                      <span className="text-base font-semibold text-amber-700">credits</span>
                    </div>
                  </div>

                  {permissions.canAct ? (
                    <div className="space-y-3 max-w-md mx-auto">
                      {cannotAfford && (
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 text-center">
                          Team {respondingTeam} cannot afford {nom.price}cr (max bid {responderMax}cr) and must pass.
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          variant="primary"
                          size="lg"
                          disabled={cannotTake}
                          isLoading={isResponding}
                          onClick={() => handleRespond('take')}
                          className="py-3 font-bold shadow-md shadow-emerald-600/20"
                        >
                          <span>Take ({nom.price}cr)</span>
                        </Button>

                        <Button
                          variant="secondary"
                          size="lg"
                          isLoading={isResponding}
                          onClick={() => handleRespond('pass')}
                          className="py-3 font-semibold"
                        >
                          <span>Pass to Team {nom.nominatedBy}</span>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm font-semibold text-slate-700">
                        Waiting for Team {respondingTeam} captain to take or pass.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* PHASE 3: BIDDING (Open style) */}
        {state.phase === 'bidding' && state.nomination && (
          <div className="space-y-5">
            {(() => {
              const nom = state.nomination;
              const player = playersById.get(nom.playerId);
              const otherTeam: Team = nom.highTeam === 'A' ? 'B' : 'A';
              const otherMax = calculateMaxBid(otherTeam, nom.playerId);

              return (
                <div className="space-y-5">
                  <div className="text-center space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      {player && <PositionChip position={player.position} />}
                      <h3 className="text-2xl font-extrabold text-slate-900">
                        {player?.displayName ?? 'Player'}
                      </h3>
                      {player && <RatingBadge rating={player.rating} />}
                    </div>

                    <div className="inline-flex items-center gap-2 px-5 py-2 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-3xl font-extrabold shadow-sm">
                      <Coins className="w-6 h-6 text-amber-600" />
                      <span>{nom.price}</span>
                      <span className="text-base font-semibold text-amber-700">cr</span>
                    </div>

                    <p className="text-xs text-slate-500">
                      Currently held by <strong className="text-slate-900">Team {nom.highTeam}</strong>
                    </p>
                  </div>

                  {permissions.canAct ? (
                    <div className="space-y-3 max-w-md mx-auto">
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          variant="primary"
                          disabled={nom.price + 1 > otherMax}
                          isLoading={isBidding}
                          onClick={() => handleBid('raise', 1)}
                        >
                          Raise +1 ({nom.price + 1}cr)
                        </Button>
                        <Button
                          variant="primary"
                          disabled={nom.price + 5 > otherMax}
                          isLoading={isBidding}
                          onClick={() => handleBid('raise', 5)}
                        >
                          Raise +5 ({nom.price + 5}cr)
                        </Button>
                      </div>

                      <Button
                        variant="secondary"
                        className="w-full"
                        isLoading={isBidding}
                        onClick={() => handleBid('pass')}
                      >
                        Pass — Team {nom.highTeam} wins him for {nom.price}cr
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm font-semibold text-slate-700">
                        Waiting for Team {otherTeam} captain.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </Panel>

      {/* DRAFT ACTIVITY FEED */}
      <Panel className="p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Live Draft Log
          </span>
          <span className="text-xs text-slate-400">Realtime events</span>
        </div>

        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
          {state.log && state.log.length > 0 ? (
            state.log.slice(0, 8).map((entry: any, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0"
              >
                <div className="flex items-center gap-2 text-slate-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>{entry.text}</span>
                </div>
                <span className="text-slate-400 shrink-0 ml-2">
                  {entry.at ? new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-400 text-center py-3">Draft has just kicked off.</p>
          )}
        </div>
      </Panel>

      {/* Master emergency cancel button */}
      {user?.isMaster && (
        <div className="text-center pt-2">
          <Button
            variant="danger"
            size="sm"
            isLoading={cancelMutation.isPending}
            onClick={() => {
              if (confirm('Are you sure you want to cancel this matchday draft?')) {
                cancelMutation.mutate();
              }
            }}
          >
            Cancel draft
          </Button>
        </div>
      )}
    </div>
  );
}
