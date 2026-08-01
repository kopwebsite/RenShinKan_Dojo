export type OperationalControlEnv = {
  UPLOADS_ENABLED?: string;
  NEWSLETTER_PUBLISHING_ENABLED?: string;
};

export function uploadsEnabled(env: OperationalControlEnv) {
  return env.UPLOADS_ENABLED?.trim().toLowerCase() !== "false";
}

export function newsletterPublishingEnabled(env: OperationalControlEnv) {
  return env.NEWSLETTER_PUBLISHING_ENABLED?.trim().toLowerCase() !== "false";
}
