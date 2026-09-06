'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCurrentMatchday } from '@/lib/api-client';
import { useAuth } from '@/components/providers';
import { MatchdaySkeleton } from '@/components/ui/skeleton';
import { QuietState } from '@/components/matchday/quiet-state';
import { SetupWizard } from '@/components/matchday/setup-wizard';
import { LiveAuction } from '@/components/matchday/live-auction';
import { LiveShuffle } from '@/components/matchday/live-shuffle';
import { ScoreEntry } from '@/components/matchday/score-entry';

export default function MatchdayPage() {
  const { user } = useAuth();

  const {
    data,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['matchday', 'current'],
    queryFn: getCurrentMatchday,
    refetchInterval: 3000,
    // See live-auction.tsx: this drives which screen renders, so a captain
    // who glances away for a few seconds shouldn't come back to a stale one.
    refetchIntervalInBackground: true,
  });

  if (isLoading) {
    return <MatchdaySkeleton />;
  }

  const matchday = data?.matchday;

  // Case 1: No active matchday
  if (!matchday) {
    if (user?.isMaster) {
      return <SetupWizard onStarted={() => refetch()} />;
    }
    return <QuietState />;
  }

  // Case 2: Active matchday in setup status
  if (matchday.status === 'setup') {
    if (user?.isMaster) {
      return <SetupWizard onStarted={() => refetch()} />;
    }
    return <QuietState />;
  }

  // Case 3: Live drafting
  if (matchday.status === 'drafting') {
    if (matchday.method === 'auction') {
      return <LiveAuction matchday={matchday} onFinished={() => refetch()} />;
    }
    return <LiveShuffle matchday={matchday} onLocked={() => refetch()} />;
  }

  // Case 4: Teams set, waiting for score
  if (matchday.status === 'teams_set') {
    return <ScoreEntry matchday={matchday} onRecorded={() => refetch()} />;
  }

  return <QuietState />;
}
