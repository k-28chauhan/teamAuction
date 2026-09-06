import { describe, expect, it } from 'vitest';
import { enumerateSplits, findLegalSplits, type SplitPlayer } from '@/lib/draft/splits';

function player(id: string, position: SplitPlayer['position'], rating: number): SplitPlayer {
  return { id, position, rating };
}

function squadOfTwelve(keepers: number): SplitPlayer[] {
  const players: SplitPlayer[] = [];
  for (let i = 0; i < keepers; i++) players.push(player(`gk${i}`, 'GK', 5));
  const remaining = 12 - keepers;
  const mids = Math.ceil(remaining / 2);
  const fwds = remaining - mids;
  for (let i = 0; i < mids; i++) players.push(player(`mid${i}`, 'MID', 5 + (i % 3)));
  for (let i = 0; i < fwds; i++) players.push(player(`fwd${i}`, 'FWD', 4 + (i % 3)));
  return players;
}

describe('enumerateSplits', () => {
  it('yields C(11,5) = 462 raw candidates for twelve players, having fixed player 0 into team A', () => {
    // The contract (00-shared-contract.md, section 5) cites "924 combinations" as the
    // size of the naive search space (C(12,6)) to justify brute force, then instructs
    // fixing player index 0 into team A specifically to avoid enumerating each split
    // twice. Doing that halves the raw space to C(11,5) = 462 distinct candidates.
    const players = squadOfTwelve(2);
    expect(enumerateSplits(players)).toHaveLength(462);
  });

  it('returns an empty list for an odd player count', () => {
    const players = squadOfTwelve(1).slice(0, 11);
    expect(enumerateSplits(players)).toEqual([]);
  });
});

function squadWithDefenders(): SplitPlayer[] {
  return [
    player('gk0', 'GK', 5),
    player('gk1', 'GK', 5),
    player('def0', 'DEF', 6),
    player('def1', 'DEF', 6),
    player('def2', 'DEF', 6),
    player('mid0', 'MID', 7),
    player('mid1', 'MID', 7),
    player('mid2', 'MID', 7),
    player('fwd0', 'FWD', 8),
    player('fwd1', 'FWD', 8),
    player('fwd2', 'FWD', 8),
    player('fwd3', 'FWD', 8),
  ];
}

describe('findLegalSplits', () => {
  it('enforces defender counts differing by at most one', () => {
    const players = squadWithDefenders();
    const splits = findLegalSplits(players);
    expect(splits.length).toBeGreaterThan(0);
    for (const split of splits) {
      const defA = split.teamAIds.filter((id) => id.startsWith('def')).length;
      const defB = split.teamBIds.filter((id) => id.startsWith('def')).length;
      expect(Math.abs(defA - defB)).toBeLessThanOrEqual(1);
    }
  });


  it('filters correctly with two keepers available: both teams must have one', () => {
    const players = squadOfTwelve(2);
    const splits = findLegalSplits(players);
    expect(splits.length).toBeGreaterThan(0);
    for (const split of splits) {
      const aHasKeeper = split.teamAIds.some((id) => id.startsWith('gk'));
      const bHasKeeper = split.teamBIds.some((id) => id.startsWith('gk'));
      expect(aHasKeeper).toBe(true);
      expect(bHasKeeper).toBe(true);
    }
  });

  it('filters correctly with three keepers available: both teams still need at least one', () => {
    const players = squadOfTwelve(3);
    const splits = findLegalSplits(players);
    expect(splits.length).toBeGreaterThan(0);
    for (const split of splits) {
      const aKeepers = split.teamAIds.filter((id) => id.startsWith('gk')).length;
      const bKeepers = split.teamBIds.filter((id) => id.startsWith('gk')).length;
      expect(aKeepers).toBeGreaterThanOrEqual(1);
      expect(bKeepers).toBeGreaterThanOrEqual(1);
    }
  });

  it('still returns splits when the squad has zero keepers', () => {
    const players = squadOfTwelve(0);
    const splits = findLegalSplits(players);
    expect(splits.length).toBeGreaterThan(0);
  });

  it('filters correctly with exactly one keeper available: no requirement is enforced', () => {
    const players = squadOfTwelve(1);
    const splits = findLegalSplits(players);
    expect(splits.length).toBeGreaterThan(0);
    // With only one keeper in existence, some legal splits necessarily leave one side without one.
    const someoneShort = splits.some((split) => {
      const aKeepers = split.teamAIds.filter((id) => id.startsWith('gk')).length;
      const bKeepers = split.teamBIds.filter((id) => id.startsWith('gk')).length;
      return aKeepers === 0 || bKeepers === 0;
    });
    expect(someoneShort).toBe(true);
  });

  it('sorts results by ascending rating gap', () => {
    const players = squadOfTwelve(2);
    const splits = findLegalSplits(players);
    for (let i = 1; i < splits.length; i++) {
      expect(splits[i].ratingGap).toBeGreaterThanOrEqual(splits[i - 1].ratingGap);
    }
  });

  it('enforces forward and midfield counts differing by at most one', () => {
    const players = squadOfTwelve(2);
    const splits = findLegalSplits(players);
    for (const split of splits) {
      const fwdA = split.teamAIds.filter((id) => id.startsWith('fwd')).length;
      const fwdB = split.teamBIds.filter((id) => id.startsWith('fwd')).length;
      expect(Math.abs(fwdA - fwdB)).toBeLessThanOrEqual(1);

      const midA = split.teamAIds.filter((id) => id.startsWith('mid')).length;
      const midB = split.teamBIds.filter((id) => id.startsWith('mid')).length;
      expect(Math.abs(midA - midB)).toBeLessThanOrEqual(1);
    }
  });
});
