export function withPrivateNoIndex(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
