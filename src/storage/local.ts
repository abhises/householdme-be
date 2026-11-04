import fs from "node:fs/promises";
import path from "node:path";
import type { PutInput, StorageDriver, StoredFile } from "./types.js";

/** Stores files on local disk. Files are served by Express at /uploads/<key>. */
export class LocalStorage implements StorageDriver {
  readonly name = "local" as const;
  readonly root: string;

  constructor(
    dir: string,
    private publicBaseUrl: string,
  ) {
    this.root = path.resolve(dir);
  }

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put({ key, body }: PutInput): Promise<StoredFile> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
    return { key, url: this.urlFor(key) };
  }

  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }

  urlFor(key: string) {
    return `${this.publicBaseUrl.replace(/\/$/, "")}/uploads/${key}`;
  }
}
