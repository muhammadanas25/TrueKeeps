CREATE TABLE "order_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"to_status" text,
	"from_status" text,
	"kind" text NOT NULL,
	"actor" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"user_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"currency" text DEFAULT 'PKR' NOT NULL,
	"unit_minor" integer NOT NULL,
	"subtotal_minor" integer NOT NULL,
	"shipping_minor" integer NOT NULL,
	"total_minor" integer NOT NULL,
	"price_list_version" text NOT NULL,
	"binding" text NOT NULL,
	"qty" integer NOT NULL,
	"page_count" integer NOT NULL,
	"title" text NOT NULL,
	"occasion" text,
	"theme_key" text,
	"document_snapshot" jsonb NOT NULL,
	"shipping_address" jsonb NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text NOT NULL,
	"payment_provider" text NOT NULL,
	"provider_ref" text,
	"livemode" boolean DEFAULT false NOT NULL,
	"idempotency_key" text NOT NULL,
	"courier" text,
	"tracking_number" text,
	"paid_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text NOT NULL,
	"provider_event_id" text,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_unique" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_user_idem_unique" ON "orders" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_provider_ref_unique" ON "orders" USING btree ("provider_ref");--> statement-breakpoint
CREATE INDEX "orders_user_created_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_project_idx" ON "orders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_event_unique" ON "payments" USING btree ("provider_event_id");