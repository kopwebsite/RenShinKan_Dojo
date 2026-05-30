import { type EditableContent, validateEditableContent } from "./content";

export type KvNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { metadata?: Record<string, unknown> }): Promise<void>;
};

export type R2ObjectBody = {
  body: ReadableStream;
  httpEtag?: string;
  writeHttpMetadata(headers: Headers): void;
};

export type R2Bucket = {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
    options?: {
      httpMetadata?: {
        contentType?: string;
        cacheControl?: string;
      };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
};

export type StorageEnv = {
  CONTENT_KV?: KvNamespace;
  MEDIA_BUCKET?: R2Bucket;
};

export type UploadedMedia = {
  key: string;
  url: string;
  contentType: string;
  size: number;
};

const CONTENT_KEY = "site:editable-content";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const allowedMimeTypes = new Map([
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/png", [".png"]],
  ["image/webp", [".webp"]],
]);

export function emptyContent(): EditableContent {
  return {
    version: 1,
    lastPublishedAt: null,
    recentEvents: [],
    examAnnouncement: null,
    historyMedia: [],
    onTheMatMedia: [],
    passedTestStudents: [],
  };
}

export async function readEditableContentFromStorage(env: StorageEnv) {
  if (!env.CONTENT_KV) {
    throw new Error("CONTENT_KV binding is not configured");
  }

  const stored = await env.CONTENT_KV.get(CONTENT_KEY);

  if (!stored) {
    return emptyContent();
  }

  return validateEditableContent(JSON.parse(stored));
}

export async function writeEditableContentToStorage(env: StorageEnv, content: EditableContent) {
  if (!env.CONTENT_KV) {
    throw new Error("CONTENT_KV binding is not configured");
  }

  await env.CONTENT_KV.put(CONTENT_KEY, `${JSON.stringify(content, null, 2)}\n`, {
    metadata: {
      lastPublishedAt: content.lastPublishedAt,
      version: content.version,
    },
  });
}

function isFile(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value && "type" in value && "size" in value;
}

export function getUploadFiles(formData: FormData) {
  return formData.getAll("files").filter(isFile);
}

function extractUploadId(name: string) {
  return name.match(/^(upload-[a-f0-9-]+)-/i)?.[1] ?? null;
}

function extensionFor(name: string) {
  const cleanName = name.split(/[\\/]/).pop() || name;
  const match = cleanName.match(/\.[a-z0-9]+$/i);
  return match ? match[0].toLowerCase() : "";
}

function sanitizeFileName(name: string, mimeType: string) {
  const allowedExtensions = allowedMimeTypes.get(mimeType);

  if (!allowedExtensions) {
    throw new Error(`Unsupported file type: ${mimeType || "unknown"}`);
  }

  const ext = extensionFor(name);

  if (!allowedExtensions.includes(ext)) {
    throw new Error(`Unsupported file extension: ${ext || "none"}`);
  }

  const withoutUploadId = name.replace(/^(upload-[a-f0-9-]+)-/i, "");
  const withoutExtension = withoutUploadId.replace(/\.[a-z0-9]+$/i, "");
  const safeBase = withoutExtension
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "image";

  return `${Date.now()}-${crypto.randomUUID()}-${safeBase}${allowedExtensions[0]}`;
}

function hasPrefix(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

function assertImageSignature(file: File, bytes: Uint8Array) {
  if (file.type === "image/jpeg" && hasPrefix(bytes, [0xff, 0xd8, 0xff])) {
    return;
  }

  if (file.type === "image/png" && hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return;
  }

  if (
    file.type === "image/webp" &&
    hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return;
  }

  throw new Error(`${file.name} does not match its declared image type`);
}

export async function uploadFilesToR2(env: StorageEnv, files: File[]) {
  if (!env.MEDIA_BUCKET && files.length > 0) {
    throw new Error("MEDIA_BUCKET binding is not configured");
  }

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const uploadUrlByPendingId = new Map<string, string>();
  const fallbackUrls: string[] = [];
  const uploaded: UploadedMedia[] = [];

  for (const file of files) {
    if (!allowedMimeTypes.has(file.type)) {
      throw new Error(`Unsupported file type: ${file.type || "unknown"}`);
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`${file.name} is larger than 5 MB`);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    assertImageSignature(file, bytes);

    const uploadId = extractUploadId(file.name);
    const safeName = sanitizeFileName(file.name, file.type);
    const key = `admin/${year}/${month}/${safeName}`;
    const publicUrl = `/uploads/${key}`;

    await env.MEDIA_BUCKET!.put(key, bytes, {
      httpMetadata: {
        contentType: file.type,
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: {
        originalName: file.name.slice(0, 240),
        uploadedAt: now.toISOString(),
      },
    });

    if (uploadId) {
      uploadUrlByPendingId.set(uploadId, publicUrl);
    }

    fallbackUrls.push(publicUrl);
    uploaded.push({
      key,
      url: publicUrl,
      contentType: file.type,
      size: file.size,
    });
  }

  return { uploadUrlByPendingId, fallbackUrls, uploaded };
}
