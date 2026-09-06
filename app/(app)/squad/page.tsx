'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPlayers,
  createPlayer,
  updatePlayer,
  deletePlayer,
  transferMaster,
} from '@/lib/api-client';
import { useAuth } from '@/components/providers';
import type { Player, Position } from '@/lib/contract/types';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PositionChip, RatingBadge } from '@/components/ui/chip';
import { Alert } from '@/components/ui/alert';
import { SquadSkeleton } from '@/components/ui/skeleton';
import {
  Users,
  Search,
  UserPlus,
  Edit2,
  Trash2,
  Crown,
  ChevronDown,
  ChevronUp,
  Star,
  Shield,
} from 'lucide-react';

export default function SquadPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isMaster = !!user?.isMaster;

  const [searchQuery, setSearchQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState<'ALL' | Position>('ALL');

  // Modals & Sheets
  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState('');
  const [addUsername, setAddUsername] = useState('');
  const [addPosition, setAddPosition] = useState<Position>('MID');
  const [addRating, setAddRating] = useState<number>(6);
  const [addError, setAddError] = useState<string | null>(null);

  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [editName, setEditName] = useState('');
  const [editPosition, setEditPosition] = useState<Position>('MID');
  const [editRating, setEditRating] = useState<number>(6);
  const [editError, setEditError] = useState<string | null>(null);

  const [transferTarget, setTransferTarget] = useState<Player | null>(null);
  const [transferPin, setTransferPin] = useState('');
  const [transferError, setTransferError] = useState<string | null>(null);

  const [guestsOpen, setGuestsOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['players', 'squad-view'],
    queryFn: () => getPlayers(true),
  });

  const allPlayers = data?.players ?? [];
  const regularPlayers = allPlayers.filter((p) => !p.isGuest && p.isActive);
  const guestPlayers = allPlayers.filter((p) => p.isGuest && p.isActive);

  // Counts
  const totalGK = regularPlayers.filter((p) => p.position === 'GK').length;
  const totalDEF = regularPlayers.filter((p) => p.position === 'DEF').length;
  const totalMID = regularPlayers.filter((p) => p.position === 'MID').length;
  const totalFWD = regularPlayers.filter((p) => p.position === 'FWD').length;
  const avgRating =
    regularPlayers.length > 0
      ? (
          regularPlayers.reduce((sum, p) => sum + p.rating, 0) /
          regularPlayers.length
        ).toFixed(1)
      : '0';

  const filteredRegulars = regularPlayers.filter((p) => {
    const matchesSearch =
      p.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.username.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPos = positionFilter === 'ALL' || p.position === positionFilter;
    return matchesSearch && matchesPos;
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createPlayer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      setShowAddModal(false);
      setAddName('');
      setAddUsername('');
      setAddRating(6);
    },
    onError: (err: any) => {
      setAddError(err.message || 'Failed to add player.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) => updatePlayer(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      setEditingPlayer(null);
    },
    onError: (err: any) => {
      setEditError(err.message || 'Failed to update player.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePlayer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      setEditingPlayer(null);
    },
  });

  const transferMutation = useMutation({
    mutationFn: ({ id, pin }: { id: string; pin?: string }) => transferMaster(id, pin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      setTransferTarget(null);
      setTransferPin('');
      window.location.reload();
    },
    onError: (err: any) => {
      setTransferError(err.message || 'Failed to transfer master access.');
    },
  });

  if (isLoading) {
    return <SquadSkeleton />;
  }

  return (
    <div className="py-4 space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Squad Roster
          </h1>
          <p className="text-xs text-slate-500">
            Manage your registered squad members, skill ratings, and guest players.
          </p>
        </div>

        {isMaster && (
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              setShowAddModal(true);
              setAddError(null);
            }}
            className="self-start sm:self-auto shadow-sm shadow-emerald-600/20"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Player</span>
          </Button>
        )}
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Panel className="p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total Squad
          </span>
          <span className="text-2xl font-extrabold text-slate-900">{regularPlayers.length}</span>
        </Panel>

        <Panel className="p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider block">
            Keepers
          </span>
          <span className="text-2xl font-extrabold text-slate-900">{totalGK}</span>
        </Panel>

        <Panel className="p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-violet-600 uppercase tracking-wider block">
            Defenders
          </span>
          <span className="text-2xl font-extrabold text-slate-900">{totalDEF}</span>
        </Panel>

        <Panel className="p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider block">
            Midfielders
          </span>
          <span className="text-2xl font-extrabold text-slate-900">{totalMID}</span>
        </Panel>

        <Panel className="p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider block">
            Forwards
          </span>
          <span className="text-2xl font-extrabold text-slate-900">{totalFWD}</span>
        </Panel>

        <Panel className="p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Avg Rating
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-2xl font-extrabold text-slate-900">{avgRating}</span>
            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
          </div>
        </Panel>
      </div>

      {/* Add Player Modal */}
      {showAddModal && (
        <Panel className="p-5 border-emerald-200 bg-emerald-50/30 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold text-slate-900">Add New Squad Member</h3>
            <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 text-sm">
              ✕
            </button>
          </div>

          {addError && <Alert message={addError} onDismiss={() => setAddError(null)} />}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!addName.trim()) {
                setAddError('Enter a display name.');
                return;
              }
              createMutation.mutate({
                displayName: addName.trim(),
                username: addUsername.trim() || undefined,
                position: addPosition,
                rating: Number(addRating),
              });
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Full Name"
                placeholder="e.g. Marcus"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                autoFocus
              />
              <Input
                label="Username (Login Handle)"
                placeholder="e.g. marcus"
                value={addUsername}
                onChange={(e) => setAddUsername(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Position
                </label>
                <select
                  value={addPosition}
                  onChange={(e) => setAddPosition(e.target.value as Position)}
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
                  value={addRating}
                  onChange={(e) => setAddRating(Number(e.target.value))}
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" isLoading={createMutation.isPending}>
                Save Player
              </Button>
            </div>
          </form>
        </Panel>
      )}

      {/* Edit Player Sheet */}
      {editingPlayer && (
        <Panel className="p-5 border-slate-300 bg-slate-50 space-y-4 shadow-md">
          <div className="flex justify-between items-center border-b border-slate-200 pb-2">
            <h3 className="text-base font-bold text-slate-900">
              Edit Player: {editingPlayer.displayName}
            </h3>
            <button onClick={() => setEditingPlayer(null)} className="text-slate-400 hover:text-slate-600 text-sm">
              ✕
            </button>
          </div>

          {editError && <Alert message={editError} onDismiss={() => setEditError(null)} />}

          <div className="space-y-3">
            <Input
              label="Display Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Position
                </label>
                <select
                  value={editPosition}
                  onChange={(e) => setEditPosition(e.target.value as Position)}
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
                  Rating (1–10)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={editRating}
                  onChange={(e) => setEditRating(Number(e.target.value))}
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-200">
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Remove ${editingPlayer.displayName} from the squad?`)) {
                      deleteMutation.mutate(editingPlayer.id);
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Deactivate</span>
                </Button>

                {!editingPlayer.isMaster && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTransferTarget(editingPlayer);
                      setEditingPlayer(null);
                    }}
                  >
                    <Crown className="w-3.5 h-3.5 text-amber-500" />
                    <span>Make Master</span>
                  </Button>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditingPlayer(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={updateMutation.isPending}
                  onClick={() => {
                    updateMutation.mutate({
                      id: editingPlayer.id,
                      patch: {
                        displayName: editName.trim(),
                        position: editPosition,
                        rating: Number(editRating),
                      },
                    });
                  }}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* Transfer Master Modal */}
      {transferTarget && (
        <Panel className="p-5 border-amber-300 bg-amber-50/50 space-y-4">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-600" />
            <h3 className="text-base font-bold text-slate-900">
              Transfer Master Access to {transferTarget.displayName}
            </h3>
          </div>
          <p className="text-xs text-slate-600">
            This will transfer all administrative permissions to @{transferTarget.username}. Enter the new 4-digit master PIN.
          </p>

          {transferError && <Alert message={transferError} onDismiss={() => setTransferError(null)} />}

          <div className="space-y-3 max-w-sm">
            <Input
              label="New 4-digit Master PIN"
              type="password"
              maxLength={4}
              placeholder="e.g. 1234"
              value={transferPin}
              onChange={(e) => setTransferPin(e.target.value)}
            />

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setTransferTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={transferMutation.isPending}
                onClick={() => {
                  transferMutation.mutate({
                    id: transferTarget.id,
                    pin: transferPin || undefined,
                  });
                }}
              >
                Confirm Transfer
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name or handle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl bg-white border border-slate-200 pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map((pos) => (
            <button
              key={pos}
              onClick={() => setPositionFilter(pos)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                positionFilter === pos
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {pos === 'ALL' ? 'All Roles' : pos}
            </button>
          ))}
        </div>
      </div>

      {/* Players List / Grid */}
      <div className="space-y-2">
        {filteredRegulars.length === 0 ? (
          <Panel className="p-8 text-center text-slate-500 text-sm">
            No players found matching your criteria.
          </Panel>
        ) : (
          filteredRegulars.map((player) => (
            <Panel
              key={player.id}
              hoverable={isMaster}
              className={`p-3.5 flex items-center justify-between transition-all ${
                isMaster ? 'cursor-pointer' : ''
              }`}
              onClick={() => {
                if (isMaster) {
                  setEditingPlayer(player);
                  setEditName(player.displayName);
                  setEditPosition(player.position);
                  setEditRating(player.rating);
                  setEditError(null);
                }
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 border border-slate-200 font-bold flex items-center justify-center text-sm shrink-0">
                  {player.displayName.charAt(0)}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">
                      {player.displayName}
                    </span>
                    {player.isMaster && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <Crown className="w-3 h-3 text-amber-600" />
                        <span>Master</span>
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">@{player.username}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <PositionChip position={player.position} />
                <RatingBadge rating={player.rating} />

                {isMaster && (
                  <button className="text-xs text-slate-400 hover:text-emerald-700 font-medium pl-1 flex items-center gap-1">
                    <Edit2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                )}
              </div>
            </Panel>
          ))
        )}
      </div>

      {/* Guests Collapsible Section */}
      {guestPlayers.length > 0 && (
        <section className="pt-4 border-t border-slate-200 space-y-3">
          <div
            onClick={() => setGuestsOpen(!guestsOpen)}
            className="flex items-center justify-between cursor-pointer py-1 text-slate-600 hover:text-slate-900 select-none"
          >
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-800">
                Temporary Guest Players ({guestPlayers.length})
              </span>
              <span className="text-xs text-slate-400">Hidden from regular match pickers</span>
            </div>
            {guestsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>

          {guestsOpen && (
            <div className="space-y-2 pt-1">
              {guestPlayers.map((p) => (
                <Panel key={p.id} className="p-3 flex items-center justify-between bg-slate-50/70">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm text-slate-800">{p.displayName}</span>
                    <PositionChip position={p.position} />
                    <RatingBadge rating={p.rating} />
                  </div>

                  {isMaster && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        updateMutation.mutate({
                          id: p.id,
                          patch: { isGuest: false },
                        });
                      }}
                    >
                      Promote to Regular
                    </Button>
                  )}
                </Panel>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
