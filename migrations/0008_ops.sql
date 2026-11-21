CREATE TABLE "analytics_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"anon_id" text,
	"user_id" varchar,
	"visit_id" text,
	"path" text,
	"props" jsonb,
	"device" text,
	"os" text,
	"browser" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" varchar,
	"actor_email" text,
	"actor_role" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"detail" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" text NOT NULL,
	"channel" text NOT NULL,
	"audience" text NOT NULL,
	"recipient" text NOT NULL,
	"order_id" varchar,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notify_rules" (
	"event" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"staff_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"staff_whatsapp" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"customer_email" boolean DEFAULT false NOT NULL,
	"customer_whatsapp" boolean DEFAULT false NOT NULL,
	"staff_template" text,
	"customer_template" text,
	"template_lang" text DEFAULT 'en' NOT NULL,
	"updated_by" varchar,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"version" integer NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"files" jsonb,
	"page_count" integer,
	"low_dpi_count" integer DEFAULT 0 NOT NULL,
	"problems" jsonb,
	"state_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_at" timestamp with time zone,
	"requested_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_metrics" (
	"minute" timestamp with time zone NOT NULL,
	"route" text NOT NULL,
	"instance" text NOT NULL,
	"count" integer NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"sum_ms" bigint NOT NULL,
	"max_ms" integer NOT NULL,
	"buckets" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_elevations" (
	"session_id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_factors" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"secret_enc" text NOT NULL,
	"backup_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enrolled_at" timestamp with time zone,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_step" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_invites" (
	"email" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"invited_by" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_elevations" ADD CONSTRAINT "staff_elevations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_elevations" ADD CONSTRAINT "staff_elevations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_factors" ADD CONSTRAINT "staff_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_name_created_idx" ON "analytics_events" USING btree ("name","created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_anon_idx" ON "analytics_events" USING btree ("anon_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_unique" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_order_idx" ON "notifications" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "notifications_provider_idx" ON "notifications" USING btree ("provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "print_jobs_order_version_unique" ON "print_jobs" USING btree ("order_id","version");--> statement-breakpoint
CREATE INDEX "print_jobs_state_idx" ON "print_jobs" USING btree ("state","state_changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "request_metrics_unique" ON "request_metrics" USING btree ("minute","route","instance");--> statement-breakpoint
CREATE INDEX "request_metrics_minute_idx" ON "request_metrics" USING btree ("minute");--> statement-breakpoint
CREATE INDEX "staff_elevations_user_idx" ON "staff_elevations" USING btree ("user_id");