import { createReadStream, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as common from "oci-common";
import * as objectstorage from "oci-objectstorage";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { AppError } from "./appError.util";

export interface PutObjectInput {
  key: string;
  /** Temporary file written by the upload middleware; streamed to storage. */
  filePath: string;
  size: number;
  contentType: string;
  contentDisposition: string;
}

export interface StoredObject {
  body: Buffer;
  size: number;
  contentType: string;
  contentDisposition: string;
}

export interface StorageProvider {
  readonly name: "none" | "memory" | "oci";
  putObject(input: PutObjectInput): Promise<void>;
  deleteObject(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}

/** Objects held by the `memory` provider (used by tests). */
export const memoryObjectStore = new Map<string, StoredObject>();

const encodeKey = (key: string) => key.split("/").map(encodeURIComponent).join("/");

const joinUrl = (base: string, key: string) => `${base.replace(/\/+$/, "")}/${encodeKey(key)}`;

const storageDisabled = () =>
  AppError.serviceUnavailable("File uploads are not configured on this server");

const noneProvider: StorageProvider = {
  name: "none",
  putObject: async () => {
    throw storageDisabled();
  },
  deleteObject: async () => {
    throw storageDisabled();
  },
  getPublicUrl: () => {
    throw storageDisabled();
  },
};

const createMemoryProvider = (): StorageProvider => ({
  name: "memory",
  putObject: async ({ key, filePath, size, contentType, contentDisposition }) => {
    memoryObjectStore.set(key, {
      body: await readFile(filePath),
      size,
      contentType,
      contentDisposition,
    });
  },
  deleteObject: async (key) => {
    memoryObjectStore.delete(key);
  },
  getPublicUrl: (key) =>
    joinUrl(env.STORAGE_PUBLIC_BASE_URL ?? "https://storage.flowpost.test", key),
});

const loadOciPrivateKey = (): string => {
  let raw: string;
  if (env.OCI_PRIVATE_KEY) {
    raw = env.OCI_PRIVATE_KEY.replace(/\\n/g, "\n");
  } else if (env.OCI_PRIVATE_KEY_PATH) {
    raw = readFileSync(path.resolve(env.OCI_PRIVATE_KEY_PATH), "utf8");
  } else {
    throw new Error("OCI_PRIVATE_KEY or OCI_PRIVATE_KEY_PATH is required");
  }

  const key = raw.trim();
  if (!key.startsWith("-----BEGIN") || !key.includes("-----END")) {
    throw new Error("The OCI private key must be PEM encoded (-----BEGIN … -----END)");
  }
  return key;
};

/** Oracle Cloud Object Storage — the same service jobs-viewer uses, configured from env only. */
const createOciProvider = (): StorageProvider => {
  const {
    OCI_TENANCY_OCID,
    OCI_USER_OCID,
    OCI_FINGERPRINT,
    OCI_REGION,
    OCI_NAMESPACE,
    OCI_BUCKET,
  } = env;
  if (
    !OCI_TENANCY_OCID ||
    !OCI_USER_OCID ||
    !OCI_FINGERPRINT ||
    !OCI_REGION ||
    !OCI_NAMESPACE ||
    !OCI_BUCKET
  ) {
    throw new Error("OCI storage is not fully configured");
  }

  const region = common.Region.fromRegionId(OCI_REGION);
  const authProvider = new common.SimpleAuthenticationDetailsProvider(
    OCI_TENANCY_OCID,
    OCI_USER_OCID,
    OCI_FINGERPRINT,
    loadOciPrivateKey(),
    env.OCI_PRIVATE_KEY_PASSPHRASE ?? null,
    region,
  );
  const client = new objectstorage.ObjectStorageClient({
    authenticationDetailsProvider: authProvider,
  });
  client.region = region;

  const baseUrl =
    env.STORAGE_PUBLIC_BASE_URL ??
    `https://objectstorage.${OCI_REGION}.oraclecloud.com/n/${OCI_NAMESPACE}/b/${OCI_BUCKET}/o`;

  logger.info({ region: OCI_REGION, bucket: OCI_BUCKET }, "OCI object storage configured");

  return {
    name: "oci",
    putObject: async ({ key, filePath, size, contentType, contentDisposition }) => {
      // Stream from disk so large files (videos) never sit fully in memory.
      await client.putObject({
        namespaceName: OCI_NAMESPACE,
        bucketName: OCI_BUCKET,
        objectName: key,
        putObjectBody: createReadStream(filePath),
        contentLength: size,
        contentType,
        contentDisposition,
      });
    },
    deleteObject: async (key) => {
      await client.deleteObject({
        namespaceName: OCI_NAMESPACE,
        bucketName: OCI_BUCKET,
        objectName: key,
      });
    },
    getPublicUrl: (key) => joinUrl(baseUrl, key),
  };
};

const createProvider = (): StorageProvider => {
  switch (env.STORAGE_PROVIDER) {
    case "oci":
      return createOciProvider();
    case "memory":
      return createMemoryProvider();
    case "none":
      return noneProvider;
  }
};

// Created at startup so OCI misconfiguration (e.g. an unreadable key) fails fast.
const storage = createProvider();

export const getStorage = (): StorageProvider => storage;

export const isStorageEnabled = (): boolean => storage.name !== "none";
