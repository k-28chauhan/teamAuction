CREATE TABLE "draft_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"matchday_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"actor_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_events_matchday_sequence_unique" UNIQUE("matchday_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "matchday_players" (
	"matchday_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"team" text,
	"price" smallint,
	CONSTRAINT "matchday_players_matchday_id_user_id_pk" PRIMARY KEY("matchday_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "matchdays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text NOT NULL,
	"method" text NOT NULL,
	"style" text,
	"budget" smallint,
	"round_order" text[],
	"team_size" smallint NOT NULL,
	"leader_a_id" uuid,
	"leader_b_id" uuid,
	"state" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"score_a" smallint,
	"score_b" smallint,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"played_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" "citext" NOT NULL,
	"display_name" text NOT NULL,
	"position" text NOT NULL,
	"rating" smallint DEFAULT 5 NOT NULL,
	"is_master" boolean DEFAULT false NOT NULL,
	"is_guest" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"master_pin_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "draft_events" ADD CONSTRAINT "draft_events_matchday_id_matchdays_id_fk" FOREIGN KEY ("matchday_id") REFERENCES "public"."matchdays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_events" ADD CONSTRAINT "draft_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchday_players" ADD CONSTRAINT "matchday_players_matchday_id_matchdays_id_fk" FOREIGN KEY ("matchday_id") REFERENCES "public"."matchdays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchday_players" ADD CONSTRAINT "matchday_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchdays" ADD CONSTRAINT "matchdays_leader_a_id_users_id_fk" FOREIGN KEY ("leader_a_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchdays" ADD CONSTRAINT "matchdays_leader_b_id_users_id_fk" FOREIGN KEY ("leader_b_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchdays" ADD CONSTRAINT "matchdays_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_events_matchday_sequence_idx" ON "draft_events" USING btree ("matchday_id","sequence");--> statement-breakpoint
CREATE INDEX "matchday_players_user_id_idx" ON "matchday_players" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "matchdays_status_idx" ON "matchdays" USING btree ("status");