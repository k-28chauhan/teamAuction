import {
  pgTable,
  uuid,
  text,
  smallint,
  boolean,
  timestamp,
  jsonb,
  integer,
  bigserial,
  primaryKey,
  index,
  unique,
  customType,
} from 'drizzle-orm/pg-core';
import type { DraftState, Position } from '@/lib/contract/types';

/** citext has no first-class drizzle-orm helper; declare it directly. */
const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: citext('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  position: text('position').notNull().$type<Position>(),
  rating: smallint('rating').notNull().default(5),
  isMaster: boolean('is_master').notNull().default(false),
  isGuest: boolean('is_guest').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  masterPinHash: text('master_pin_hash'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const matchdays = pgTable('matchdays', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: text('status')
    .notNull()
    .$type<'setup' | 'drafting' | 'teams_set' | 'completed' | 'cancelled'>(),
  method: text('method').notNull().$type<'auction' | 'shuffle'>(),
  style: text('style').$type<'price' | 'open' | null>(),
  budget: smallint('budget'),
  roundOrder: text('round_order').array().$type<Position[]>(),
  teamSize: smallint('team_size').notNull(),
  leaderAId: uuid('leader_a_id').references(() => users.id),
  leaderBId: uuid('leader_b_id').references(() => users.id),
  state: jsonb('state').notNull().$type<DraftState>(),
  version: integer('version').notNull().default(0),
  scoreA: smallint('score_a'),
  scoreB: smallint('score_b'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  playedAt: timestamptz('played_at'),
}, (table) => [index('matchdays_status_idx').on(table.status)]);

export const matchdayPlayers = pgTable(
  'matchday_players',
  {
    matchdayId: uuid('matchday_id')
      .notNull()
      .references(() => matchdays.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    team: text('team').$type<'A' | 'B' | null>(),
    price: smallint('price'),
    goals: smallint('goals').notNull().default(0),
    // The role this player is filling for THIS matchday — set at squad
    // selection and may differ from users.position (someone tagged MID on
    // their profile can still be picked to play forward tonight).
    position: text('position').notNull().$type<Position>(),
  },
  (table) => [
    primaryKey({ columns: [table.matchdayId, table.userId] }),
    index('matchday_players_user_id_idx').on(table.userId),
  ]
);

export const draftEvents = pgTable(
  'draft_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    matchdayId: uuid('matchday_id')
      .notNull()
      .references(() => matchdays.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    actorId: uuid('actor_id').references(() => users.id),
    type: text('type')
      .notNull()
      .$type<'nominate' | 'take' | 'pass' | 'raise' | 'autofill' | 'shuffle' | 'lock'>(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('draft_events_matchday_sequence_unique').on(table.matchdayId, table.sequence),
    index('draft_events_matchday_sequence_idx').on(table.matchdayId, table.sequence),
  ]
);
