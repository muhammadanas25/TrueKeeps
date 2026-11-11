CREATE TABLE "upload_batches" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"project_id" varchar,
	"status" text NOT NULL,
	"kind" text DEFAULT 'new' NOT NULL,
	"photo_count" integer NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"heic_count" integer DEFAULT 0 NOT NULL,
	"source_bytes" bigint DEFAULT 0 NOT NULL,
	"original_bytes" bigint DEFAULT 0 NOT NULL,
	"display_bytes" bigint DEFAULT 0 NOT NULL,
	"first_in_book_ms" integer,
	"all_in_book_ms" integer,
	"all_hd_ms" integer,
	"hd_mbps" real,
	"retries" integer DEFAULT 0 NOT NULL,
	"stalls" integer DEFAULT 0 NOT NULL,
	"connection" text,
	"downlink_mbps" real,
	"device_memory_gb" real,
	"cpu_cores" integer,
	"mobile" boolean,
	"browser" text,
	"photos" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "upload_batches" ADD CONSTRAINT "upload_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "upload_batches_created_idx" ON "upload_batches" USING btree ("created_at");