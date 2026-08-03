import { type EditableContent, validateEditableContent } from "./content";

export type KvNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { metadata?: Record<string, unknown> }): Promise<void>;
};

export type R2ObjectBody = {
  body: ReadableStream;
  httpEtag?: string;
  customMetadata?: Record<string, string>;
  writeHttpMetadata(headers: Headers): void;
};

export type R2Bucket = {
  head?(key: string): Promise<{ key: string } | null>;
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
  delete(key: string | string[]): Promise<void>;
  list?(options?: { cursor?: string; limit?: number; prefix?: string }): Promise<{
    objects: Array<{ key: string }>;
    truncated: boolean;
    cursor?: string;
  }>;
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
  sha256: string;
};

export type ValidatedProfileImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

export class StorageOperationError extends Error {
  constructor(public code: "binding_missing" | "write_failed") {
    super("Media storage is temporarily unavailable. Existing content is unchanged; retry safely with the same draft.");
    this.name = "StorageOperationError";
  }
}

const CONTENT_KEY = "site:editable-content";
const CONTENT_POINTER_KEY = "site:editable-content:published-version";
const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024;
const MAX_DOCUMENT_FILE_SIZE = 20 * 1024 * 1024;
const allowedMimeTypes = new Map([
  ["image/webp", [".webp"]],
  ["application/pdf", [".pdf"]],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", [".docx"]],
  ["application/vnd.ms-powerpoint", [".ppt"]],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", [".pptx"]],
]);
const mimeTypeByExtension = new Map(
  Array.from(allowedMimeTypes.entries()).flatMap(([mimeType, extensions]) =>
    extensions.map((extension) => [extension, mimeType] as const),
  ),
);
const imageMimeTypes = new Set(["image/webp"]);

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function webpDimensions(bytes: Uint8Array) {
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X" && bytes.length >= 30) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return { width, height };
  }
  if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
    };
  }
  return null;
}

export async function validateProfileWebp(file: File, maxSize = 3 * 1024 * 1024): Promise<ValidatedProfileImage> {
  if (file.type !== "image/webp" || !file.name.toLocaleLowerCase("en-US").endsWith(".webp")) {
    throw new Error("Choose a JPEG, PNG, or WebP profile image.");
  }
  if (file.size <= 0 || file.size > maxSize) throw new Error("Profile images must be smaller than 3 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    throw new Error("The uploaded file is not a valid WebP image.");
  }
  const dimensions = webpDimensions(bytes);
  if (!dimensions || dimensions.width < 128 || dimensions.height < 128 || dimensions.width > 4000 || dimensions.height > 4000) {
    throw new Error("Profile images must be between 128 × 128 and 4000 × 4000 pixels.");
  }
  return { bytes, ...dimensions };
}

export function datedProfileKey(prefix: "student-profiles" | "pending-student-profiles") {
  const now = new Date();
  return `${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.webp`;
}

export function emptyContent(): EditableContent {
  return {
    version: 3,
    lastPublishedAt: null,
    recentEvents: [],
    examAnnouncement: null,
    paymentQr: {
      src: "/images/promptpay-qr.png",
      alt: "PromptPay QR code for RenShinKan Dojo",
      updatedAt: null,
    },
    historyMedia: [],
    onTheMatMedia: [],
    passedTestStudents: [],
    galleryAlbums: {
      "on-the-mat": [],
      history: [],
      achievements: [],
    },
    sitePages: [],
    siteSettings: {
      translations: Object.fromEntries(["en", "th", "ja", "zh-CN"].map((locale) => [locale, { footerText: "", notice: "", navigation: {} }])) as EditableContent["siteSettings"]["translations"],
    },
  };
}

export async function readEditableContentFromStorage(env: StorageEnv) {
  if (!env.CONTENT_KV) {
    throw new Error("CONTENT_KV binding is not configured");
  }

  let pointer: string | null;
  try {
    pointer = await env.CONTENT_KV.get(CONTENT_POINTER_KEY);
  } catch {
    throw new Error("Content storage is temporarily unavailable. Retry before making changes.");
  }

  if (pointer) {
    let payloadKey = "";
    try {
      const value = JSON.parse(pointer) as { payloadKey?: unknown };
      payloadKey = typeof value.payloadKey === "string" ? value.payloadKey : "";
    } catch {
      throw new Error("Published content pointer is malformed");
    }
    if (!/^site:editable-content:version:\d+:[a-f0-9]{16}$/.test(payloadKey)) throw new Error("Published content pointer is invalid");
    const version = await env.CONTENT_KV.get(payloadKey).catch(() => {
      throw new Error("Published content storage is temporarily unavailable. Retry before making changes.");
    });
    if (version === null) throw new Error("Published content version is missing");
    try { return validateEditableContent(JSON.parse(version)); }
    catch { throw new Error("Published content version is malformed"); }
  }

  let stored: string | null;
  try {
    stored = await env.CONTENT_KV.get(CONTENT_KEY);
  } catch {
    throw new Error("Content storage is temporarily unavailable. Retry before making changes.");
  }

  if (!stored) {
    return emptyContent();
  }

  try { return validateEditableContent(JSON.parse(stored)); }
  catch { throw new Error("Stored content is malformed"); }
}

export async function writeEditableContentVersion(env: StorageEnv, payloadKey: string, serializedContent: string, content: EditableContent) {
  if (!env.CONTENT_KV) throw new Error("CONTENT_KV binding is not configured");
  if (!/^site:editable-content:version:\d+:[a-f0-9]{16}$/.test(payloadKey)) throw new Error("Content version key is invalid");
  await env.CONTENT_KV.put(payloadKey, `${serializedContent}\n`, {
    metadata: { lastPublishedAt: content.lastPublishedAt, version: content.version },
  });
}

export async function activateEditableContentVersion(env: StorageEnv, payloadKey: string, operationId: string) {
  if (!env.CONTENT_KV) throw new Error("CONTENT_KV binding is not configured");
  await env.CONTENT_KV.put(CONTENT_POINTER_KEY, JSON.stringify({ payloadKey, operationId }), {
    metadata: { activatedAt: new Date().toISOString() },
  });
}

function isFile(value: string | File): value is File {
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

function mimeTypeForFile(file: File) {
  if (allowedMimeTypes.has(file.type)) {
    return file.type;
  }

  return mimeTypeByExtension.get(extensionFor(file.name)) ?? file.type;
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
    .slice(0, 80) || (imageMimeTypes.has(mimeType) ? "image" : "document");

  return `${Date.now()}-${crypto.randomUUID()}-${safeBase}${allowedExtensions[0]}`;
}

function hasPrefix(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

function littleEndian16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function littleEndian32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function officeZipEntries(bytes: Uint8Array) {
  const minimum = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (littleEndian32(bytes, offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("The Office document ZIP directory is missing.");
  const count = littleEndian16(bytes, eocd + 10);
  const directorySize = littleEndian32(bytes, eocd + 12);
  const directoryOffset = littleEndian32(bytes, eocd + 16);
  if (count < 1 || count > 2_048 || directoryOffset + directorySize > bytes.length) throw new Error("The Office document ZIP directory is invalid.");
  const decoder = new TextDecoder();
  const entries = new Set<string>();
  let totalUncompressed = 0;
  let offset = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || littleEndian32(bytes, offset) !== 0x02014b50) throw new Error("The Office document ZIP directory is malformed.");
    const uncompressed = littleEndian32(bytes, offset + 24);
    const nameLength = littleEndian16(bytes, offset + 28);
    const extraLength = littleEndian16(bytes, offset + 30);
    const commentLength = littleEndian16(bytes, offset + 32);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (!nameLength || end > bytes.length) throw new Error("The Office document ZIP entry is malformed.");
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength)).replace(/\\/g, "/");
    if (name.startsWith("/") || name.split("/").includes("..") || /(?:^|\/)vbaProject\.bin$|\.(?:exe|dll|js|html?)$/i.test(name)) {
      throw new Error("The Office document contains a prohibited embedded file.");
    }
    totalUncompressed += uncompressed;
    if (totalUncompressed > 100 * 1024 * 1024) throw new Error("The Office document expands beyond the safe processing limit.");
    entries.add(name);
    offset = end;
  }
  return entries;
}

function assertImageSignature(file: File, mimeType: string, bytes: Uint8Array) {
  if (
    mimeType === "image/webp" &&
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

function assertDocumentSignature(file: File, mimeType: string, bytes: Uint8Array) {
  if (mimeType === "application/pdf" && hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return;
  }

  const isZipOfficeFile =
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation";

  if (
    isZipOfficeFile &&
    (hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
      hasPrefix(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
      hasPrefix(bytes, [0x50, 0x4b, 0x07, 0x08]))
  ) {
    const entries = officeZipEntries(bytes);
    if (!entries.has("[Content_Types].xml")) throw new Error(`${file.name} is not a valid Office document package`);
    if (mimeType.includes("wordprocessingml") && !entries.has("word/document.xml")) throw new Error(`${file.name} is not a valid Word document`);
    if (mimeType.includes("presentationml") && !entries.has("ppt/presentation.xml")) throw new Error(`${file.name} is not a valid PowerPoint presentation`);
    return;
  }

  if (
    mimeType === "application/vnd.ms-powerpoint" &&
    hasPrefix(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  ) {
    return;
  }

  throw new Error(`${file.name} does not match its declared document type`);
}

function assertFileSignature(file: File, mimeType: string, bytes: Uint8Array) {
  if (imageMimeTypes.has(mimeType)) {
    assertImageSignature(file, mimeType, bytes);
    return;
  }

  assertDocumentSignature(file, mimeType, bytes);
}

function maxFileSizeFor(mimeType: string) {
  return imageMimeTypes.has(mimeType) ? MAX_IMAGE_FILE_SIZE : MAX_DOCUMENT_FILE_SIZE;
}

function fileSizeLabelFor(mimeType: string) {
  return imageMimeTypes.has(mimeType) ? "5 MB" : "20 MB";
}

export async function uploadFilesToR2(env: StorageEnv, files: File[]) {
  if (!env.MEDIA_BUCKET && files.length > 0) {
    throw new StorageOperationError("binding_missing");
  }

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const uploadUrlByPendingId = new Map<string, string>();
  const fallbackUrls: string[] = [];
  const uploaded: UploadedMedia[] = [];

  try {
    for (const file of files) {
      const mimeType = mimeTypeForFile(file);

      if (!allowedMimeTypes.has(mimeType)) {
        throw new Error(`Unsupported file type: ${file.type || extensionFor(file.name) || "unknown"}`);
      }

      if (file.size > maxFileSizeFor(mimeType)) {
        throw new Error(`${file.name} is larger than ${fileSizeLabelFor(mimeType)}`);
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      assertFileSignature(file, mimeType, bytes);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");

      const uploadId = extractUploadId(file.name);
      const safeName = sanitizeFileName(file.name, mimeType);
      const key = `admin/${year}/${month}/${safeName}`;
      const publicUrl = `/uploads/${key}`;

      try {
        await env.MEDIA_BUCKET!.put(key, bytes, {
          httpMetadata: {
            contentType: mimeType,
            cacheControl: "public, max-age=31536000, immutable",
          },
          customMetadata: {
            uploadedAt: now.toISOString(),
            sha256,
            malwareScan: "not-configured",
          },
        });
      } catch {
        throw new StorageOperationError("write_failed");
      }

      if (uploadId) {
        uploadUrlByPendingId.set(uploadId, publicUrl);
      }

      fallbackUrls.push(publicUrl);
      uploaded.push({
        key,
        url: publicUrl,
        contentType: mimeType,
        size: file.size,
        sha256,
      });
    }
  } catch (error) {
    const keys = uploaded.map((item) => item.key);
    if (keys.length && env.MEDIA_BUCKET) {
      try {
        await env.MEDIA_BUCKET.delete(keys);
      } catch {
        // The read-only consistency audit will report any object that survives
        // a failed cleanup. Never hide the original upload failure.
      }
    }
    throw error;
  }

  return { uploadUrlByPendingId, fallbackUrls, uploaded };
}
