export interface StoredFile {
  /** Driver-specific object key, e.g. "2026/11/abc123-photo.jpg" */
  key: string;
  /** Public URL the frontend can render */
  url: string;
}

export interface PutInput {
  key: string;
  body: Buffer;
  contentType: string;
}

/**
 * Storage backend for uploaded media. Pick one with STORAGE_DRIVER.
 * Add a new backend by implementing this interface and registering it in ./index.ts.
 */
export interface StorageDriver {
  readonly name: "local" | "s3";
  put(input: PutInput): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  urlFor(key: string): string;
}
