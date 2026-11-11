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
 *
 * Reads are private. Photos of people's families do not belong on a public
 * bucket, so the only URL the app ever stores is `/media/<key>`; the route
 * behind it checks ownership and redirects to a short-lived signed link
 * (docs/adr/011).
 */

import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "./config";

/** What the client needs to upload one file and reference it after. */
export interface PresignedUpload {
  /** object key — client echoes this back on /api/uploads/complete */
  key: string;
  /** where to PUT the raw bytes */
  uploadUrl: string;
  method: "PUT";
  /** headers the client must send with the PUT */
  headers: Record<string, string>;
}

/** A signed read link plus how long a browser may reuse it. */
export interface SignedRead {
  url: string;
  /** seconds this exact link stays valid and may be cached for */
  maxAge: number;
}

export interface MediaStore {
  readonly kind: "local" | "s3";
  presignUpload(key: string, contentType: string): Promise<PresignedUpload>;
  /** A time-limited read link. Only call after checking the requester may read `key`. */
  signedRead(key: string): Promise<SignedRead>;
  /** Stored size in bytes, or null when the object is not there. */
  sizeOf(key: string): Promise<number | null>;
  /** server-side write — used by the image pipeline for derivatives */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** server-side read — used by the image pipeline for source bytes */
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/* ── Key hygiene ────────────────────────────────────────────── */

const KEY_RE = /^[a-zA-Z0-9/_.-]+$/;

/** The permanent app URL of an object. Stored in books; never expires. */
export function mediaUrl(key: string): string {
  return `/media/${key}`;
}

/** Reject traversal and odd characters; keys are server-generated but
 *  arrive back from the client on complete/PUT, so re-validate. */
export function isSafeKey(key: string): boolean {
  return KEY_RE.test(key) && !key.includes("..") && !key.startsWith("/") && key.length < 512;
}

/**
 * Build the canonical object key for a new upload. Pass `id` when the client
 * has already named the photo, so a retried request lands on the same key
 * instead of leaving an orphan behind.
 */
export function buildPhotoKey(projectId: string, filename: string, id: string = randomUUID()): string {
  const safeName = filename.replace(/[^a-zA-Z0-9.-]+/g, "_").slice(-80) || "photo";
  return `projects/${projectId}/${id}-${safeName}`;
}

/** The project a key belongs to, or null if the key is not a project key. */
export function projectIdOfKey(key: string): string | null {
  return key.match(/^projects\/([^/]+)\//)?.[1] ?? null;
}

/** Derivative keys live next to the original with a suffix. */
export function derivativeKey(originalKey: string, suffix: "thumb" | "preview", ext: "webp" | "jpg" = "webp"): string {
  return `${originalKey}.${suffix}.${ext}`;
}

/** Every derivative a photo could have, for cleanup: format depends on the uploading browser. */
export function allDerivativeKeys(originalKey: string): string[] {
  return (["thumb", "preview"] as const).flatMap((s) => [derivativeKey(originalKey, s, "webp"), derivativeKey(originalKey, s, "jpg")]);
}

/**
 * Signing window for read links. Signing with the start of the current hour
 * makes the link byte-identical for that hour, so the browser's HTTP cache
 * actually hits; a fresh signature per request would re-download every photo
 * on every page. Valid for two windows so a link minted late in the hour
 * doesn't die mid-session.
 */
const READ_WINDOW_S = 60 * 60;

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
    };
  }

  /** Local files are streamed by the /media route itself, after its ownership check. */
  async signedRead(key: string): Promise<SignedRead> {
    return { url: mediaUrl(key), maxAge: 0 };
  }

  async sizeOf(key: string): Promise<number | null> {
    try {
      return (await stat(this.filePath(key))).size;
    } catch {
      return null;
    }
  }

  /** Absolute path for the /media route to stream. */
  absolutePath(key: string): string {
    return this.filePath(key);
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
    };
  }

  async signedRead(key: string): Promise<SignedRead> {
    const now = Date.now();
    const windowMs = READ_WINDOW_S * 1000;
    const windowStart = now - (now % windowMs);
    // No response-cache-control override: R2 doesn't document support for
    // it, and a rejected parameter would break every photo. The stable
    // hourly link is what lets the browser cache.
    const cmd = new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: READ_WINDOW_S * 2, signingDate: new Date(windowStart) });
    return { url, maxAge: Math.floor((windowStart + windowMs - now) / 1000) };
  }

  async sizeOf(key: string): Promise<number | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
      return head.ContentLength ?? 0;
    } catch {
      return null;
    }
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

/**
 * S3_ENDPOINT must be the bare account endpoint. Cloudflare's dashboard
 * shows the bucket URL (`https://<acct>.r2.cloudflarestorage.com/<bucket>`),
 * and pasting that makes the SDK prefix EVERY key with the bucket name:
 * objects land at `<bucket>/projects/…` while public URLs point at
 * `projects/…`, so every photo 404s. Keep only scheme + host.
 */
export function normaliseS3Endpoint(endpoint: string | undefined): string | undefined {
  if (!endpoint) return endpoint;
  try {
    const u = new URL(endpoint);
    if (u.pathname && u.pathname !== "/") {
      console.warn(`[media] S3_ENDPOINT has a path ("${u.pathname}") — ignoring it; use ${u.origin}`);
    }
    return u.origin;
  } catch {
    return endpoint;
  }
}

function createMediaStore(): MediaStore {
  const s3 = config.s3;
  if (s3.bucket && s3.accessKeyId && s3.secretAccessKey) {
    console.log(`[media] using S3-compatible store (bucket=${s3.bucket})`);
    return new S3MediaStore({
      endpoint: normaliseS3Endpoint(s3.endpoint),
      region: s3.region || "auto", // "auto" is what R2 expects
      bucket: s3.bucket,
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
    });
  }
  // Local disk is a dev convenience. On PaaS hosts (Railway, Render, Fly)
  // the filesystem is ephemeral — every deploy/restart wipes it, which for
  // a photo product means losing all user uploads. Warn loudly rather than
  // crash so a first smoke-test deploy still boots, but this must not be
  // how production actually runs.
  if (config.isProd) {
    console.warn(
      "[media] WARNING: production is using the LOCAL DISK media store. " +
        "Uploads will be LOST on every deploy/restart. Set S3_BUCKET, " +
        "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (see .env.example).",
    );
  } else {
    console.log("[media] using local disk store (.local/media) — set S3_* env vars for R2/S3");
  }
  return new LocalDiskMediaStore();
}

export const mediaStore = createMediaStore();
