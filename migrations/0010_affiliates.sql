CREATE TABLE "affiliate_commissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" varchar NOT NULL,
	"order_id" varchar NOT NULL,
	"kind" text NOT NULL,
	"base_minor" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"commission_kind" text NOT NULL,
	"commission_value" integer NOT NULL,
	"payable_at" timestamp with time zone,
	"reversed_at" timestamp with time zone,
	"reversed_reason" text,
	"payout_id" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_payouts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" varchar NOT NULL,
	"period" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"lines" integer NOT NULL,
	"payout_method" text NOT NULL,
	"payout_account" text,
	"reference" text NOT NULL,
	"paid_by" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_visits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"affiliate_id" varchar NOT NULL,
	"visitor_id" text NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"user_id" varchar,
	"channel" text,
	"commission_kind" text NOT NULL,
	"commission_value" integer NOT NULL,
	"payout_method" text NOT NULL,
	"payout_account" text,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_by" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "affiliate_id" varchar;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "affiliate_source" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "affiliate_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "affiliate_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_commissions_line_unique" ON "affiliate_commissions" USING btree ("order_id","affiliate_id","kind");--> statement-breakpoint
CREATE INDEX "affiliate_commissions_aff_idx" ON "affiliate_commissions" USING btree ("affiliate_id","payable_at");--> statement-breakpoint
CREATE INDEX "affiliate_payouts_aff_idx" ON "affiliate_payouts" USING btree ("affiliate_id","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_visits_unique" ON "affiliate_visits" USING btree ("affiliate_id","visitor_id","day");--> statement-breakpoint
CREATE INDEX "affiliate_visits_day_idx" ON "affiliate_visits" USING btree ("affiliate_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliates_code_unique" ON "affiliates" USING btree ("code");--> statement-breakpoint
CREATE INDEX "affiliates_email_idx" ON "affiliates" USING btree ("email");--> statement-breakpoint
CREATE INDEX "orders_affiliate_idx" ON "orders" USING btree ("affiliate_id");