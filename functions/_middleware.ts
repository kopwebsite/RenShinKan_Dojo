const CANONICAL_HOST = "renshinkandojo.org";
const REDIRECT_HOSTS = new Set([
  "www.renshinkandojo.org",
  "renshinkan-dojo.pages.dev",
]);

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  if (REDIRECT_HOSTS.has(url.hostname.toLowerCase())) {
    url.protocol = "https:";
    url.hostname = CANONICAL_HOST;
    url.port = "";
    return new Response(null, {
      status: 308,
      headers: {
        Location: url.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
  return context.next();
};
