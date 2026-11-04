import crypto from "node:crypto";
import path from "node:path";
import { env } from "../config/env.js";
import { LocalStorage } from "./local.js";
import { S3Storage } from "./s3.js";
import type { StorageDriver } from "./types.js";

export type { StorageDriver } from "./types.js";

function createStorage(): StorageDriver {
  if (env.STORAGE_DRIVER === "s3") {
    return new S3Storage({
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      publicUrl: env.S3_PUBLIC_URL,
    });
  }
  return new LocalStorage(env.LOCAL_UPLOAD_DIR, env.PUBLIC_API_URL);
}

export const storage = createStorage();

/** Builds a unique, URL-safe object key such as "2026/11/3f9a1c2b-test-photo.jpg". */
export function makeKey(originalName: string) {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const base =
    path
      .basename(originalName, path.extname(originalName))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "file";
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}/${month}/${crypto.randomBytes(4).toString("hex")}-${base}${ext}`;
}
