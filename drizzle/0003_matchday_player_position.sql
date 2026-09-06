ALTER TABLE "matchday_players" ADD COLUMN "position" text;--> statement-breakpoint
UPDATE "matchday_players" mp SET "position" = u."position" FROM "users" u WHERE u."id" = mp."user_id" AND mp."position" IS NULL;--> statement-breakpoint
ALTER TABLE "matchday_players" ALTER COLUMN "position" SET NOT NULL;
