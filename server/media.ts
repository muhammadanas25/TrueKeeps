/**
 * Media store — where photo bytes live (NOT the database).
 *
 * Why this exists: photos were previously uploaded as base64 data URLs
 * through express.json() into storage rows — a 50-photo book is
 * ~150MB of JSON parsing per load and makes the DB the bandwidth
 * bottleneck. The media store moves bytes out of the API/DB path:
 * the client asks for a presigned target, PUTs the file there
 * directly, then registers only metadata (docs/adr/002).
 *
 * Two implementations behind one interface, chosen by env:
 *  - LocalDiskMediaStore (default): files under .local/media, "presign"
 *    points at PUT /api/media/<key> served by this same Express app.
 *    Zero setup, survives restarts, mirrors the S3 flow exactly so the
 *    client code is identical in dev and prod.
 *  - S3MediaStore: any S3-compatible store. Built for Cloudflare R2
 *    (zero egress — photos are the dominant bandwidth cost at scale)
 *    but works with AWS S3/MinIO too.
 *
 * Keys are namespaced `projects/<projectId>/<uuid>-<safe-name>` and
 * validated everywhere (no traversal, restricted charset).
 */

import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** What the client needs to upload one file and reference it after. */
export interface PresignedUpload {
  /** object key — client echoes this back on /api/uploads/complete */
  key: string;
  /** where to PUT the raw bytes */
  uploadUrl: string;
  method: "PUT";
  /** headers the client must send with the PUT */
  headers: Record<string, string>;
  /** servable URL of the object once uploaded */
  publicUrl: string;
}

export interface MediaStore {
  readonly kind: "local" | "s3";
  presignUpload(key: string, contentType: string): Promise<PresignedUpload>;
  publicUrl(key: string): string;
  /** server-side write — used by the image pipeline for derivatives */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** server-side read — used by the image pipeline for source bytes */
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/* ── Key hygiene ────────────────────────────────────────────── */

const KEY_RE = /^[a-zA-Z0-9/_.-]+$/;

/** Reject traversal and odd characters; keys are server-generated but
 *  arrive back from the client on complete/PUT, so re-validate. */
export function isSafeKey(key: string): boolean {
  return KEY_RE.test(key) && !key.includes("..") && !key.startsWith("/") && key.length < 512;
}

/** Build the canonical object key for a new upload. */
export function buildPhotoKey(projectId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9.-]+/g, "_").slice(-80) || "photo";
  return `projects/${projectId}/${randomUUID()}-${safeName}`;
}

/** Derivative keys live next to the original with a suffix. */
export function derivativeKey(originalKey: string, suffix: "thumb" | "preview"): string {
  return `${originalKey}.${suffix}.webp`;
}

/* ── Local disk (dev default) ───────────────────────────────── */

export class LocalDiskMediaStore implements MediaStore {
  readonly kind = "local" as const;
  readonly root: string;

  constructor(root = path.resolve(process.cwd(), ".local/media")) {
    this.root = root;
    if (!existsSync(root)) mkdirSync(root, { recursive: true });
  }

  private filePath(key: string): string {
    if (!isSafeKey(key)) throw new Error("invalid media key");
    return path.join(this.root, key);
  }

  async presignUpload(key: string, contentType: string): Promise<PresignedUpload> {
    // "presign" = point at our own raw-body PUT endpoint (routes.ts);
    // same request shape the client would send to S3, so swapping the
    // backend never touches client code.
    return {
      key,
      uploadUrl: `/api/media/${key}`,
      method: "PUT",
      headers: { "Content-Type": contentType },
      publicUrl: this.publicUrl(key),
    };
  }

  publicUrl(key: string): string {
    return `/media/${key}`;
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<void> {
    const fp = this.filePath(key);
    await mkdir(path.dirname(fp), { recursive: true });
    await writeFile(fp, body);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.filePath(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.filePath(key), { force: true });
  }
}

/* ── S3-compatible (Cloudflare R2 in prod) ──────────────────── */

interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** public base (R2 public domain / CDN) used to build servable URLs */
  publicBaseUrl: string;
}

export class S3MediaStore implements MediaStore {
  readonly kind = "s3" as const;
  private client: S3Client;

  constructor(private cfg: S3Config) {
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  async presignUpload(key: string, contentType: string): Promise<PresignedUpload> {
    const cmd = new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, ContentType: contentType });
    const uploadUrl = await getSignedUrl(this.client, cmd, { expiresIn: 15 * 60 });
    return {
      key,
      uploadUrl,
      method: "PUT",
      headers: { "Content-Type": contentType },
      publicUrl: this.publicUrl(key),
    };
  }

  publicUrl(key: string): string {
    return `${this.cfg.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }
}

/* ── Factory ────────────────────────────────────────────────── */

function createMediaStore(): MediaStore {
  const { S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_BASE_URL, S3_ENDPOINT, S3_REGION } =
    process.env;
  if (S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY && S3_PUBLIC_BASE_URL) {
    console.log(`[media] using S3-compatible store (bucket=${S3_BUCKET})`);
    return new S3MediaStore({
      endpoint: S3_ENDPOINT,
      region: S3_REGION || "auto", // "auto" is what R2 expects
      bucket: S3_BUCKET,
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
      publicBaseUrl: S3_PUBLIC_BASE_URL,
    });
  }
  // Local disk is a dev convenience. On PaaS hosts (Railway, Render, Fly)
  // the filesystem is ephemeral — every deploy/restart wipes it, which for
  // a photo product means losing all user uploads. Warn loudly rather than
  // crash so a first smoke-test deploy still boots, but this must not be
  // how production actually runs.
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[media] WARNING: production is using the LOCAL DISK media store. " +
        "Uploads will be LOST on every deploy/restart. Set S3_BUCKET, " +
        "S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_PUBLIC_BASE_URL (see .env.example).",
    );
  } else {
    console.log("[media] using local disk store (.local/media) — set S3_* env vars for R2/S3");
  }
  return new LocalDiskMediaStore();
}

export const mediaStore = createMediaStore();
