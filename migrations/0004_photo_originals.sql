ALTER TABLE "uploaded_photos" ADD COLUMN "original_uploaded_at" timestamp with time zone;
--> statement-breakpoint
-- Every existing photo was uploaded with its original as the only copy, so its original is already in place.
UPDATE "uploaded_photos" SET "original_uploaded_at" = "uploaded_at" WHERE "original_uploaded_at" IS NULL;
--> statement-breakpoint
-- Rows held links to the public bucket, which is going private. Book documents are rewritten on read instead (shared/media.ts).
UPDATE "uploaded_photos" SET "url" = regexp_replace("url", '^https?://[^/]+/(projects/.+)$', '/media/\1') WHERE "url" ~ '^https?://[^/]+/projects/';
--> statement-breakpoint
UPDATE "uploaded_photos" SET "thumb_url" = regexp_replace("thumb_url", '^https?://[^/]+/(projects/.+)$', '/media/\1') WHERE "thumb_url" ~ '^https?://[^/]+/projects/';
--> statement-breakpoint
UPDATE "uploaded_photos" SET "preview_url" = regexp_replace("preview_url", '^https?://[^/]+/(projects/.+)$', '/media/\1') WHERE "preview_url" ~ '^https?://[^/]+/projects/';
--> statement-breakpoint
UPDATE "page_photos" SET "photo_url" = regexp_replace("photo_url", '^https?://[^/]+/(projects/.+)$', '/media/\1') WHERE "photo_url" ~ '^https?://[^/]+/projects/';
