import { hasValidAdminSession, jsonResponse } from "../../_lib/auth";
import { createAndSendRecentEventCampaign, missingBrevoEnv } from "../../_lib/brevo";
import {
  type EditableContent,
  type RecentEvent,
  replacePendingMediaUrls,
  validateEditableContent,
} from "../../_lib/content";

type Env = {
  SESSION_SECRET?: string;
  GITHUB_TOKEN?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
  SITE_URL?: string;
  BREVO_API_KEY?: string;
  BREVO_LIST_ID?: string;
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
};

type GithubFile = {
  sha: string;
  content: string;
};

const CONTENT_PATH = "public/content/editableContent.json";
const MAX_FILES = 10;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const allowedMimeTypes = new Map([
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/png", [".png"]],
  ["image/webp", [".webp"]],
]);

function isConfigured(value: string | undefined) {
  return Boolean(value && !value.startsWith("PLACEHOLDER"));
}

function missingGithubEnv(env: Env) {
  return ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"].filter((key) => !isConfigured(env[key as keyof Env]));
}

function branch(env: Env) {
  return env.GITHUB_BRANCH || "main";
}

function utf8ToBase64(value: string) {
  return bytesToBase64(new TextEncoder().encode(value));
}

function base64ToUtf8(value: string) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return btoa(binary);
}

function githubContentUrl(env: Env, path: string) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodedPath}`;
}

async function githubRequest(env: Env, path: string, init: RequestInit = {}) {
  const response = await fetch(githubContentUrl(env, path), {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "renshinkan-admin-publisher",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });

  return response;
}

async function readGithubError(response: Response) {
  const text = await response.text();

  try {
    const data = JSON.parse(text) as { message?: string };
    return data.message || text;
  } catch {
    return text || response.statusText;
  }
}

async function getGithubFile(env: Env, path: string): Promise<GithubFile | null> {
  const response = await fetch(`${githubContentUrl(env, path)}?ref=${encodeURIComponent(branch(env))}`, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "renshinkan-admin-publisher",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub GET ${path} failed: ${await readGithubError(response)}`);
  }

  const data = await response.json() as Partial<GithubFile>;

  if (typeof data.sha !== "string" || typeof data.content !== "string") {
    throw new Error(`GitHub GET ${path} returned an unexpected payload`);
  }

  return {
    sha: data.sha,
    content: data.content,
  };
}

async function putGithubFile(env: Env, path: string, contentBase64: string, message: string, sha?: string) {
  const response = await githubRequest(env, path, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: contentBase64,
      branch: branch(env),
      sha,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub PUT ${path} failed: ${await readGithubError(response)}`);
  }

  const data = await response.json() as { content?: { sha?: string } };
  return data.content?.sha;
}

function isFile(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value && "type" in value && "size" in value;
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

async function uploadFiles(env: Env, files: File[]) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const uploadUrlByPendingId = new Map<string, string>();
  const fallbackUrls: string[] = [];
  const uploaded: Array<{ path: string; url: string }> = [];

  for (const file of files) {
    if (!allowedMimeTypes.has(file.type)) {
      throw new Error(`Unsupported file type: ${file.type || "unknown"}`);
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`${file.name} is larger than 5 MB`);
    }

    const uploadId = extractUploadId(file.name);
    const safeName = sanitizeFileName(file.name, file.type);
    const repoPath = `public/uploads/originals/${year}/${month}/${safeName}`;
    const publicUrl = `/${repoPath.replace(/^public\//, "")}`;
    const existing = await getGithubFile(env, repoPath);
    const bytes = new Uint8Array(await file.arrayBuffer());

    await putGithubFile(
      env,
      repoPath,
      bytesToBase64(bytes),
      "Add admin-uploaded media from recent event",
      existing?.sha,
    );

    if (uploadId) {
      uploadUrlByPendingId.set(uploadId, publicUrl);
    }
    fallbackUrls.push(publicUrl);
    uploaded.push({ path: repoPath, url: publicUrl });
  }

  return { uploadUrlByPendingId, fallbackUrls, uploaded };
}

function emptyContent(): EditableContent {
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

function previousContentFromFile(file: GithubFile | null) {
  if (!file) {
    return emptyContent();
  }

  try {
    return validateEditableContent(JSON.parse(base64ToUtf8(file.content)));
  } catch {
    return emptyContent();
  }
}

function newsletterCandidates(content: EditableContent, previousById: Map<string, RecentEvent>) {
  return content.recentEvents.filter((event) => {
    const previous = previousById.get(event.id);
    return event.published && event.notifySubscribers === true && event.newsletter?.status !== "sent" && previous?.newsletter?.status !== "sent";
  });
}

function preservePreviouslySentNewsletters(content: EditableContent, previousById: Map<string, RecentEvent>) {
  return {
    ...content,
    recentEvents: content.recentEvents.map((event) => {
      const previous = previousById.get(event.id);

      if (previous?.newsletter?.status === "sent") {
        return {
          ...event,
          newsletter: previous.newsletter,
        };
      }

      return {
        ...event,
        notifySubscribers: event.notifySubscribers === true,
        newsletter: event.newsletter ?? {
          status: "not_sent" as const,
          sentAt: null,
          brevoCampaignId: null,
          error: null,
        },
      };
    }),
  };
}

function updateEventNewsletter(content: EditableContent, id: string, newsletter: RecentEvent["newsletter"]) {
  return {
    ...content,
    recentEvents: content.recentEvents.map((event) => event.id === id ? { ...event, newsletter } : event),
  };
}

async function commitContent(env: Env, content: EditableContent, sha: string | undefined, message: string) {
  const nextSha = await putGithubFile(
    env,
    CONTENT_PATH,
    utf8ToBase64(`${JSON.stringify(content, null, 2)}\n`),
    message,
    sha,
  );

  return nextSha ?? sha;
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!await hasValidAdminSession(request, env)) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return jsonResponse({ ok: false, error: "Expected multipart/form-data" }, 400);
  }

  const contentField = formData.get("content");

  if (typeof contentField !== "string") {
    return jsonResponse({ ok: false, error: "Missing content field" }, 400);
  }

  const files = formData.getAll("files").filter(isFile);

  if (files.length > MAX_FILES) {
    return jsonResponse({ ok: false, error: "At most 10 files can be uploaded per publish" }, 400);
  }

  const missingGithub = missingGithubEnv(env);

  if (missingGithub.length) {
    return jsonResponse({ ok: false, error: `Missing GitHub environment variables: ${missingGithub.join(", ")}` }, 500);
  }

  let parsedContent: EditableContent;

  try {
    parsedContent = validateEditableContent(JSON.parse(contentField));
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Invalid content" },
      400,
    );
  }

  try {
    const existingContentFile = await getGithubFile(env, CONTENT_PATH);
    const previousContent = previousContentFromFile(existingContentFile);
    const previousById = new Map(previousContent.recentEvents.map((event) => [event.id, event]));
    const { uploadUrlByPendingId, fallbackUrls, uploaded } = await uploadFiles(env, files);
    let content = replacePendingMediaUrls(parsedContent, uploadUrlByPendingId, fallbackUrls);
    const warnings: string[] = [];

    content = preservePreviouslySentNewsletters(
      {
        ...content,
        lastPublishedAt: new Date().toISOString(),
      },
      previousById,
    );

    const candidates = newsletterCandidates(content, previousById);
    let contentSha = existingContentFile?.sha;

    if (candidates.length > 0 && missingBrevoEnv(env).length === 0) {
      for (const candidate of candidates) {
        content = updateEventNewsletter(content, candidate.id, {
          status: "pending",
          sentAt: null,
          brevoCampaignId: null,
          error: null,
        });
      }

      contentSha = await commitContent(env, content, contentSha, "Update editable site content from admin");

      for (const candidate of candidates) {
        const event = content.recentEvents.find((item) => item.id === candidate.id)!;

        try {
          const result = await createAndSendRecentEventCampaign(env, event);
          content = updateEventNewsletter(content, event.id, {
            status: "sent",
            sentAt: new Date().toISOString(),
            brevoCampaignId: result.campaignId,
            error: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message.slice(0, 240) : "Brevo send failed";
          warnings.push(`${event.title}: ${message}`);
          content = updateEventNewsletter(content, event.id, {
            status: "failed",
            sentAt: null,
            brevoCampaignId: null,
            error: message,
          });
        }
      }

      try {
        contentSha = await commitContent(env, content, contentSha, "Update newsletter delivery status from admin publish");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Newsletter status commit failed";
        warnings.push(message);
      }
    } else {
      const missingBrevo = missingBrevoEnv(env);

      if (candidates.length > 0 && missingBrevo.length > 0) {
        for (const candidate of candidates) {
          const message = `Brevo is not configured: ${missingBrevo.join(", ")}`;
          warnings.push(`${candidate.title}: ${message}`);
          content = updateEventNewsletter(content, candidate.id, {
            status: "failed",
            sentAt: null,
            brevoCampaignId: null,
            error: message,
          });
        }
      }

      contentSha = await commitContent(env, content, contentSha, "Update editable site content from admin");
    }

    return jsonResponse({
      ok: true,
      content,
      uploaded,
      contentSha,
      warnings,
    });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Publish failed" },
      500,
    );
  }
}
