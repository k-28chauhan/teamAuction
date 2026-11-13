'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlayers, createPlayer, createMatchday, startMatchday } from '@/lib/api-client';
import { STARTING_BID } from '@/lib/draft/engine';
import type { Player, Position } from '@/lib/contract/types';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RatingBadge } from '@/components/ui/chip';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Shuffle,
  Gavel,
  Search,
  UserPlus,
  Check,
  X,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';

export function SetupWizard({ onStarted }: { onStarted: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // How many play + who (step 1) — a flat roster, no roles or tags
  const [totalPlayers, setTotalPlayers] = useState<number>(12);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const [leaderAId, setLeaderAId] = useState<string>('');
  const [leaderBId, setLeaderBId] = useState<string>('');

  // Settings
  const [method, setMethod] = useState<'auction' | 'shuffle'>('auction');
  const [style, setStyle] = useState<'price' | 'open'>('price');
  const [budgetOverride, setBudgetOverride] = useState<number | null>(null);

  // Guest modal state
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPosition, setGuestPosition] = useState<Position>('FWD');
  const [guestRating, setGuestRating] = useState<number>(5);
  const [guestError, setGuestError] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const { data: playersData, isLoading: loadingPlayers } = useQuery({
    queryKey: ['players', 'setup'],
    queryFn: () => getPlayers(true),
  });

  const allPlayers = playersData?.players ?? [];

  // Enough for every selected player at the flat starting bid, plus 50% headroom to actually bid —
  // mirrors the backend's default (see app/api/matchdays/route.ts) so the field starts sensible either way.
  const suggestedBudget = useMemo(() => {
    if (selectedIds.length < 2) return 100;
    const teamSizeGuess = Math.floor(selectedIds.length / 2);
    return Math.max(1, Math.ceil(teamSizeGuess * STARTING_BID * 1.5));
  }, [selectedIds]);

  // Tracks the squad's suggested budget until the master types their own number.
  const budget = budgetOverride ?? suggestedBudget;

  const selectedCount = selectedIds.length;
  const isValidCount = selectedCount >= 4 && selectedCount === totalPlayers && selectedCount % 2 === 0;
  const sideSize = selectedCount / 2;
  const maxPlayers = Math.max(4, Math.floor(allPlayers.length / 2) * 2);

  // Change how many are playing, trimming the selection if it no longer fits.
  const handleSetTotal = (n: number) => {
    const next = Math.min(maxPlayers, Math.max(4, Math.round(n / 2) * 2));
    setTotalPlayers(next);
    setSelectedIds((prev) => prev.slice(0, next));
  };

  const togglePlayer = (playerId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(playerId)) return prev.filter((id) => id !== playerId);
      if (prev.length >= totalPlayers) return prev;
      return [...prev, playerId];
    });
  };

  const candidates = allPlayers.filter(
    (p) =>
      p.displayName.toLowerCase().includes(search.toLowerCase()) ||
      p.username.toLowerCase().includes(search.toLowerCase())
  );

  const handleContinueToCaptains = () => {
    if (!isValidCount) {
      setFormError(`Pick exactly ${totalPlayers} players to continue.`);
      return;
    }
    setFormError(null);
    if (!selectedIds.includes(leaderAId)) setLeaderAId('');
    if (!selectedIds.includes(leaderBId)) setLeaderBId('');
    setStep(2);
  };

  // Add guest mutation
  const guestMutation = useMutation({
    mutationFn: createPlayer,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      setSelectedIds((prev) =>
        prev.includes(res.player.id) || prev.length >= totalPlayers ? prev : [...prev, res.player.id]
      );
      setShowGuestModal(false);
      setGuestName('');
      setGuestRating(5);
    },
    onError: (err: any) => {
      setGuestError(err.message || 'Unable to add guest player.');
    },
  });

  const handleAddGuest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) {
      setGuestError('Enter a name for the guest.');
      return;
    }
    setGuestError(null);
    guestMutation.mutate({
      displayName: guestName.trim(),
      position: guestPosition,
      rating: Number(guestRating),
      isGuest: true,
    });
  };

  // Start matchday
  const handleStart = async () => {
    setFormError(null);
    setIsStarting(true);
    try {
      const res = await createMatchday({
        playerIds: selectedIds,
        leaderAId,
        leaderBId,
        method,
        style: method === 'auction' ? style : undefined,
        budget: method === 'auction' ? budget : undefined,
      });

      await startMatchday(res.matchday.id);
      await queryClient.invalidateQueries({ queryKey: ['matchday', 'current'] });
      onStarted();
    } catch (err: any) {
      setFormError(err.message || 'Failed to start matchday.');
    } finally {
      setIsStarting(false);
    }
  };

  if (loadingPlayers) {
    return (
      <div className="py-6 space-y-4">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="py-4 space-y-6 max-w-4xl mx-auto">
      {/* Modern Segmented Stepper */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3 shadow-sm flex items-center justify-between gap-2">
        <button
          onClick={() => setStep(1)}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            step === 1
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center font-bold">
            1
          </span>
          <span>Select Squad</span>
        </button>

        <span className="text-slate-300 font-bold">→</span>

        <button
          onClick={() => isValidCount && setStep(2)}
          disabled={!isValidCount}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            step === 2
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm'
              : isValidCount
              ? 'text-slate-500 hover:text-slate-900'
              : 'text-slate-300 cursor-not-allowed'
          }`}
        >
          <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold ${step === 2 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
            2
          </span>
          <span>Appoint Captains</span>
        </button>

        <span className="text-slate-300 font-bold">→</span>

        <button
          onClick={() => isValidCount && leaderAId && leaderBId && setStep(3)}
          disabled={!isValidCount || !leaderAId || !leaderBId}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            step === 3
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm'
              : isValidCount && leaderAId && leaderBId
              ? 'text-slate-500 hover:text-slate-900'
              : 'text-slate-300 cursor-not-allowed'
          }`}
        >
          <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold ${step === 3 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
            3
          </span>
          <span>Split Rules</span>
        </button>
      </div>

      {formError && <Alert message={formError} onDismiss={() => setFormError(null)} />}

      {/* STEP 1: HOW MANY PLAY + WHO */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Who's at the turf today?</h2>
              <p className="text-xs text-slate-500">
                Choose how many are playing, then tick exactly that many from the roster.
              </p>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowGuestModal(true)}
              className="self-start sm:self-auto"
            >
              <UserPlus className="w-4 h-4 text-emerald-600" />
              <span>Add Guest Player</span>
            </Button>
          </div>

          {/* Guest Modal */}
          {showGuestModal && (
            <Panel className="p-5 border-emerald-200 bg-emerald-50/40 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-bold text-slate-900">Add Guest Player</h3>
                <button
                  onClick={() => setShowGuestModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-sm"
                >
                  ✕
                </button>
              </div>

              {guestError && <Alert message={guestError} onDismiss={() => setGuestError(null)} />}

              <form onSubmit={handleAddGuest} className="space-y-3">
                <Input
                  label="Player Name"
                  placeholder="e.g. Liam (Guest)"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  autoFocus
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Position
                    </label>
                    <select
                      value={guestPosition}
                      onChange={(e) => setGuestPosition(e.target.value as Position)}
                      className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:border-emerald-500"
                    >
                      <option value="GK">Goalkeeper (GK)</option>
                      <option value="DEF">Defender (DEF)</option>
                      <option value="MID">Midfield (MID)</option>
                      <option value="FWD">Forward (FWD)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Skill Rating (1–10)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={guestRating}
                      onChange={(e) => setGuestRating(Number(e.target.value))}
                      className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowGuestModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={guestMutation.isPending}
                  >
                    Add & Select
                  </Button>
                </div>
              </form>
            </Panel>
          )}

          {/* How many are playing today? */}
          <Panel className="p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">How many are playing today?</span>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                {totalPlayers / 2}-a-side
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[8, 10, 12, 14].filter((n) => n <= maxPlayers).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleSetTotal(n)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    totalPlayers === n
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {n} players
                </button>
              ))}
              <input
                type="number"
                min={4}
                max={maxPlayers}
                step={2}
                value={totalPlayers}
                onChange={(e) => handleSetTotal(Number(e.target.value))}
                className="w-20 rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 shadow-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
          </Panel>

          {/* Selection progress */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Pick the squad</h3>
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                selectedCount === totalPlayers
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {selectedCount} / {totalPlayers} selected
            </span>
          </div>

          {/* Selected chips */}
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedIds.map((id) => {
                const p = allPlayers.find((x) => x.id === id);
                if (!p) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => togglePlayer(id)}
                    className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold hover:bg-emerald-100"
                  >
                    <span>{p.displayName}</span>
                    <X className="w-3 h-3" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search players..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl bg-white border border-slate-200 pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Whole roster */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[42vh] overflow-y-auto pr-1">
            {candidates.length === 0 ? (
              <div className="col-span-full text-center text-xs text-slate-400 py-8">
                {allPlayers.length === 0
                  ? 'No players on the roster yet — add one as a guest above.'
                  : 'No one matches that search.'}
              </div>
            ) : (
              candidates.map((player) => {
                const isSelected = selectedIds.includes(player.id);
                const full = !isSelected && selectedCount >= totalPlayers;
                return (
                  <div
                    key={player.id}
                    onClick={() => !full && togglePlayer(player.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border select-none transition-all ${
                      isSelected
                        ? 'bg-emerald-50 border-emerald-400 cursor-pointer'
                        : full
                        ? 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed'
                        : 'bg-white border-slate-200/80 hover:border-emerald-300 cursor-pointer'
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span
                        className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center ${
                          isSelected ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-slate-900 truncate">
                            {player.displayName}
                          </span>
                          {player.isGuest && (
                            <span className="text-[10px] text-slate-400 font-medium">guest</span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400 block truncate">@{player.username}</span>
                      </div>
                    </div>
                    <RatingBadge rating={player.rating} />
                  </div>
                );
              })
            )}
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-md flex items-center justify-end">
            <Button variant="primary" disabled={!isValidCount} onClick={handleContinueToCaptains}>
              <span>Continue to Captains</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: APPOINT CAPTAINS */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Appoint the two captains</h2>
            <p className="text-xs text-slate-500">
              Each team captain will either run the auction bidding or head their balanced side.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Captain A */}
            <Panel accentTop="team-a" className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-600 block">
                    Team A Captain
                  </span>
                  <p className="text-xs text-slate-500">Red team leader</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-sm">
                  A
                </div>
              </div>

              <select
                value={leaderAId}
                onChange={(e) => {
                  const val = e.target.value;
                  setLeaderAId(val);
                  if (val === leaderBId) setLeaderBId('');
                }}
                className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 font-medium shadow-sm focus:outline-none focus:border-rose-500"
              >
                <option value="">Select Captain A</option>
                {selectedIds
                  .map((id) => allPlayers.find((p) => p.id === id)!)
                  .filter(Boolean)
                  .map((p) => (
                    <option key={p.id} value={p.id} disabled={p.id === leaderBId}>
                      {p.displayName} (Rating {p.rating})
                    </option>
                  ))}
              </select>
            </Panel>

            {/* Captain B */}
            <Panel accentTop="team-b" className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block">
                    Team B Captain
                  </span>
                  <p className="text-xs text-slate-500">Blue team leader</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                  B
                </div>
              </div>

              <select
                value={leaderBId}
                onChange={(e) => {
                  const val = e.target.value;
                  setLeaderBId(val);
                  if (val === leaderAId) setLeaderAId('');
                }}
                className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 font-medium shadow-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">Select Captain B</option>
                {selectedIds
                  .map((id) => allPlayers.find((p) => p.id === id)!)
                  .filter(Boolean)
                  .map((p) => (
                    <option key={p.id} value={p.id} disabled={p.id === leaderAId}>
                      {p.displayName} (Rating {p.rating})
                    </option>
                  ))}
              </select>
            </Panel>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Button>
            <Button
              variant="primary"
              disabled={!leaderAId || !leaderBId || leaderAId === leaderBId}
              onClick={() => setStep(3)}
            >
              <span>Continue to Split Method</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: SPLIT METHOD & SETTINGS */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Choose team split method</h2>
            <p className="text-xs text-slate-500">
              Decide whether leaders will live auction the squad or use the balanced rating shuffle.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Method 1: Auction */}
            <div
              onClick={() => setMethod('auction')}
              className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                method === 'auction'
                  ? 'bg-emerald-50/50 border-emerald-500 shadow-md shadow-emerald-500/10'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Gavel className="w-5 h-5" />
                </div>
                {method === 'auction' && (
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
                    ✓
                  </span>
                )}
              </div>
              <h3 className="font-bold text-base text-slate-900 mb-1">Live Credit Auction</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                The group favourite. Captains bid credits per player in turns with budget caps. Takes 3–5 minutes.
              </p>
            </div>

            {/* Method 2: Shuffle */}
            <div
              onClick={() => setMethod('shuffle')}
              className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                method === 'shuffle'
                  ? 'bg-emerald-50/50 border-emerald-500 shadow-md shadow-emerald-500/10'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center">
                  <Shuffle className="w-5 h-5" />
                </div>
                {method === 'shuffle' && (
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
                    ✓
                  </span>
                )}
              </div>
              <h3 className="font-bold text-base text-slate-900 mb-1">Balanced Shuffle</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Instant. Algorithmic balance ensuring equal goalkeepers, balanced ratings, and even positions.
              </p>
            </div>
          </div>

          {/* Auction Settings Panel */}
          {method === 'auction' && (
            <Panel className="p-5 space-y-4 bg-slate-50/80">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Auction Configurations
              </h4>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Bidding Style
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setStyle('price')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        style === 'price'
                          ? 'bg-white border-emerald-500 text-emerald-900 shadow-sm font-semibold'
                          : 'bg-white/60 border-slate-200 text-slate-600'
                      }`}
                    >
                      <span className="block text-sm">Name Your Price (Default)</span>
                      <span className="block text-[11px] text-slate-400 mt-0.5">
                        Leader names a price; other takes or passes.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStyle('open')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        style === 'open'
                          ? 'bg-white border-emerald-500 text-emerald-900 shadow-sm font-semibold'
                          : 'bg-white/60 border-slate-200 text-slate-600'
                      }`}
                    >
                      <span className="block text-sm">Open Bidding</span>
                      <span className="block text-[11px] text-slate-400 mt-0.5">
                        Opens at 5 credits; raises by +1 or +5.
                      </span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Credits per Captain
                    </label>
                    <input
                      type="number"
                      min={sideSize * 2}
                      value={budget}
                      onChange={(e) => setBudgetOverride(Number(e.target.value))}
                      className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      {budgetOverride !== null
                        ? `Suggested for this squad: ${suggestedBudget}cr`
                        : `Based on the flat starting bid, with room to actually bid.`}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      How it works
                    </label>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700">
                      Captains take turns picking any player — every player starts at {STARTING_BID}cr.
                    </div>
                  </div>
                </div>
              </div>
            </Panel>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button variant="secondary" onClick={() => setStep(2)}>
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Button>

            <Button
              variant="primary"
              size="lg"
              isLoading={isStarting}
              onClick={handleStart}
              className="px-8 shadow-lg shadow-emerald-600/25"
            >
              <span>Launch Matchday</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
