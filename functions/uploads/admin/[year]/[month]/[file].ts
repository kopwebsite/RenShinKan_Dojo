import { type R2Bucket } from "../../../../_lib/storage";

type Env = {
  MEDIA_BUCKET?: R2Bucket;
};

type Params = {
  year?: string | string[];
  month?: string | string[];
  file?: string | string[];
};

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

async function getMediaResponse(env: Env, params: Params, includeBody: boolean) {
  if (!env.MEDIA_BUCKET) {
    return new Response("Media storage is not configured", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  const year = param(params.year);
  const month = param(params.month);
  const file = param(params.file);

  if (!year?.match(/^\d{4}$/) || !month?.match(/^\d{2}$/) || !file?.match(/^[a-z0-9][a-z0-9_.-]*\.(jpe?g|png|webp)$/i)) {
    return notFound();
  }

  const object = await env.MEDIA_BUCKET.get(`admin/${year}/${month}/${file}`);

  if (!object) {
    return notFound();
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag ?? "");

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/octet-stream");
  }

  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }

  return new Response(includeBody ? object.body : null, { headers });
}

export async function onRequestGet({ env, params }: { env: Env; params: Params }) {
  return getMediaResponse(env, params, true);
}

export async function onRequestHead({ env, params }: { env: Env; params: Params }) {
  return getMediaResponse(env, params, false);
}
