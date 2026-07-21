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
  delete(key: string | string[]): Promise<void>;
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

export type ValidatedProfileImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

const CONTENT_KEY = "site:editable-content";
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
    version: 1,
    lastPublishedAt: null,
    recentEvents: [],
    examAnnouncement: null,
    historyMedia: [],
    onTheMatMedia: [],
    passedTestStudents: [],
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
    throw new Error("MEDIA_BUCKET binding is not configured");
  }

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const uploadUrlByPendingId = new Map<string, string>();
  const fallbackUrls: string[] = [];
  const uploaded: UploadedMedia[] = [];

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

    const uploadId = extractUploadId(file.name);
    const safeName = sanitizeFileName(file.name, mimeType);
    const key = `admin/${year}/${month}/${safeName}`;
    const publicUrl = `/uploads/${key}`;

    await env.MEDIA_BUCKET!.put(key, bytes, {
      httpMetadata: {
        contentType: mimeType,
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
      contentType: mimeType,
      size: file.size,
    });
  }

  return { uploadUrlByPendingId, fallbackUrls, uploaded };
}
