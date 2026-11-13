import React from 'react';
import { Star, Coins } from 'lucide-react';
import type { Position, Team } from '@/lib/contract/types';

export function PositionChip({ position }: { position: Position }) {
  const styles: Record<Position, string> = {
    GK: 'bg-amber-50 text-amber-700 border-amber-200',
    DEF: 'bg-violet-50 text-violet-700 border-violet-200',
    MID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    FWD: 'bg-blue-50 text-blue-700 border-blue-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tracking-wide border ${styles[position]}`}
    >
      {position}
    </span>
  );
}

export function RatingBadge({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700">
      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
      <span>{rating}</span>
    </span>
  );
}

export function TeamBadge({ team }: { team: Team }) {
  const isA = team === 'A';
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
        isA
          ? 'bg-rose-50 text-rose-700 border-rose-200'
          : 'bg-blue-50 text-blue-700 border-blue-200'
      }`}
    >
      Team {team}
    </span>
  );
}

export function PriceChip({ price }: { price: number }) {
  if (price === 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-500 font-semibold text-xs">
        auto-fill
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-bold text-xs">
      <Coins className="w-3 h-3 text-amber-600" />
      <span>{price} cr</span>
    </span>
  );
}
