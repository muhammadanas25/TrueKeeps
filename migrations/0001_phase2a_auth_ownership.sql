-- Phase 2A: better-auth identity tables, owned projects, real FKs + indexes,
-- timestamptz everywhere, versioned builder document, soft delete.
--
-- Hand-edited after `drizzle-kit generate`: the DATA BACKFILL blocks below
-- were inserted so this runs cleanly on a database that already has
-- ownerless projects / orphan rows (the pre-auth prototype).
--
-- Every statement is idempotent-safe under drizzle's migrator (it runs
-- each file exactly once, inside a transaction).

CREATE TABLE "accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_username_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_anonymous" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "marketing_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- ── DATA BACKFILL 1: a system owner for rows created before auth existed ──
-- Pre-Phase-2 projects have user_id NULL (or a dangling id). They belong to
-- nobody; we park them under a non-login "legacy" user so NOT NULL + FK can
-- apply. They can be purged later (no real customer data — the site had no
-- accounts). The password-era columns go first so the insert can omit them.
ALTER TABLE "users" DROP COLUMN IF EXISTS "username";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "password";--> statement-breakpoint
INSERT INTO "users" ("id", "email", "name", "is_anonymous", "role")
SELECT '00000000-0000-4000-8000-00000000000a', 'legacy@guest.thetruekeeps.com', 'Legacy (pre-auth)', true, 'customer'
WHERE NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = '00000000-0000-4000-8000-00000000000a');--> statement-breakpoint
UPDATE "projects" SET "user_id" = '00000000-0000-4000-8000-00000000000a'
WHERE "user_id" IS NULL OR NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "projects"."user_id");
--> statement-breakpoint
ALTER TABLE "page_photos" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "page_photos" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "page_photos" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "project_pages" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_pages" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "project_pages" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "themes" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "themes" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "themes" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
-- ── DATA BACKFILL 2: uploads inherit their project's owner; orphans go ──
DELETE FROM "uploaded_photos" WHERE "project_id" IS NULL
   OR NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."id" = "uploaded_photos"."project_id");--> statement-breakpoint
UPDATE "uploaded_photos" up SET "user_id" = p."user_id" FROM "projects" p
WHERE p."id" = up."project_id" AND (up."user_id" IS NULL OR up."user_id" <> p."user_id");--> statement-breakpoint
DELETE FROM "project_pages" WHERE NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."id" = "project_pages"."project_id");--> statement-breakpoint
DELETE FROM "page_photos" WHERE NOT EXISTS (SELECT 1 FROM "project_pages" pg WHERE pg."id" = "page_photos"."page_id");
--> statement-breakpoint
ALTER TABLE "uploaded_photos" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "uploaded_photos" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "uploaded_photos" ALTER COLUMN "uploaded_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "uploaded_photos" ALTER COLUMN "uploaded_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "uploaded_photos" ALTER COLUMN "uploaded_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "source" text DEFAULT 'builder' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "occasion" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "vibe" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "theme_key" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "binding" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "cover_style" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "density" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "document" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "document_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "claim_token_hash" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_reminder_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "reminder_stage" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "uploaded_photos" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_unique" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_unique" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
ALTER TABLE "page_photos" ADD CONSTRAINT "page_photos_page_id_project_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."project_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_pages" ADD CONSTRAINT "project_pages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_photos" ADD CONSTRAINT "uploaded_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_photos" ADD CONSTRAINT "uploaded_photos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_photos_page_idx" ON "page_photos" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "project_pages_project_idx" ON "project_pages" USING btree ("project_id","page_number");--> statement-breakpoint
CREATE INDEX "projects_user_updated_idx" ON "projects" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "projects_draft_updated_idx" ON "projects" USING btree ("updated_at") WHERE "projects"."status" = 'draft' AND "projects"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "uploaded_photos_project_idx" ON "uploaded_photos" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "uploaded_photos_user_idx" ON "uploaded_photos" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");
