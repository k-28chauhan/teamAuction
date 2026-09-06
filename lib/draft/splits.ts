import type { Position } from '@/lib/contract/types';

export type SplitPlayer = { id: string; position: Position; rating: number };

export type Split = {
  teamAIds: string[];
  teamBIds: string[];
  ratingGap: number;
};

function combinationsOf<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > items.length) return [];
  const [head, ...rest] = items;
  const withHead = combinationsOf(rest, k - 1).map((combo) => [head, ...combo]);
  const withoutHead = combinationsOf(rest, k);
  return [...withHead, ...withoutHead];
}

function sumRating(players: SplitPlayer[]): number {
  return players.reduce((total, p) => total + p.rating, 0);
}

function countByPosition(players: SplitPlayer[], position: Position): number {
  return players.filter((p) => p.position === position).length;
}

function isLegal(teamA: SplitPlayer[], teamB: SplitPlayer[], totalKeepers: number): boolean {
  if (totalKeepers >= 2) {
    if (countByPosition(teamA, 'GK') === 0 || countByPosition(teamB, 'GK') === 0) return false;
  }
  if (Math.abs(countByPosition(teamA, 'FWD') - countByPosition(teamB, 'FWD')) > 1) return false;
  if (Math.abs(countByPosition(teamA, 'MID') - countByPosition(teamB, 'MID')) > 1) return false;
  if (Math.abs(countByPosition(teamA, 'DEF') - countByPosition(teamB, 'DEF')) > 1) return false;
  return true;
}

/**
 * Every raw candidate split, fixing players[0] into team A so each distinct
 * split is enumerated once rather than twice (once per team-A/team-B swap).
 * Unfiltered — see findLegalSplits for the legality-filtered, sorted result.
 */
export function enumerateSplits(players: SplitPlayer[]): Split[] {
  if (players.length === 0 || players.length % 2 !== 0) return [];
  const half = players.length / 2;
  const [anchor, ...rest] = players;
  const combos = combinationsOf(rest, half - 1);

  return combos.map((partners) => {
    const teamA = [anchor, ...partners];
    const partnerIds = new Set(partners.map((p) => p.id));
    const teamB = rest.filter((p) => !partnerIds.has(p.id));
    return {
      teamAIds: teamA.map((p) => p.id),
      teamBIds: teamB.map((p) => p.id),
      ratingGap: Math.abs(sumRating(teamA) - sumRating(teamB)),
    };
  });
}

/** Pure split search: legal, balanced divisions of `players` into two equal sides, best gap first. */
export function findLegalSplits(players: SplitPlayer[]): Split[] {
  const totalKeepers = countByPosition(players, 'GK');
  const byId = new Map(players.map((p) => [p.id, p]));

  return enumerateSplits(players)
    .filter((split) => {
      const teamA = split.teamAIds.map((id) => byId.get(id)!);
      const teamB = split.teamBIds.map((id) => byId.get(id)!);
      return isLegal(teamA, teamB, totalKeepers);
    })
    .sort((a, b) => a.ratingGap - b.ratingGap);
}
