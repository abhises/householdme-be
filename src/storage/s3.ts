import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { PutInput, StorageDriver, StoredFile } from "./types.js";

export interface S3Options {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  publicUrl?: string;
}

/**
 * Stores files in Amazon S3 or an S3-compatible service (Cloudflare R2, MinIO, DigitalOcean Spaces).
 * Objects must be publicly readable (bucket policy or a CDN in front) for the site to render them.
 */
export class S3Storage implements StorageDriver {
  readonly name = "s3" as const;
  private client: S3Client;

  constructor(private opts: S3Options) {
    if (!opts.bucket) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
    this.client = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint || undefined,
      forcePathStyle: opts.forcePathStyle,
      credentials:
        opts.accessKeyId && opts.secretAccessKey
          ? { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey }
          : undefined, // fall back to the default AWS credential chain (IAM role, env, ...)
    });
  }

  async put({ key, body, contentType }: PutInput): Promise<StoredFile> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.opts.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return { key, url: this.urlFor(key) };
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key }));
  }

  urlFor(key: string) {
    const { publicUrl, endpoint, bucket, region, forcePathStyle } = this.opts;
    if (publicUrl) return `${publicUrl.replace(/\/$/, "")}/${key}`;
    if (endpoint) {
      const base = endpoint.replace(/\/$/, "");
      return forcePathStyle ? `${base}/${bucket}/${key}` : `${base.replace("://", `://${bucket}.`)}/${key}`;
    }
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }
}
