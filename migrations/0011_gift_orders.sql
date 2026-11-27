ALTER TABLE "orders" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "is_gift" boolean DEFAULT false NOT NULL;