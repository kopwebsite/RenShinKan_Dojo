function normalizedIpv4(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => Number(part));
  if (
    numbers.some(
      (part, index) =>
        !/^\d{1,3}$/.test(parts[index]) ||
        !Number.isInteger(part) ||
        part < 0 ||
        part > 255,
    )
  )
    return null;
  return numbers.join(".");
}

function normalizedIpv6(value: string) {
  const clean = value.toLowerCase().split("%", 1)[0];
  if (!/^[0-9a-f:.]+$/.test(clean) || !clean.includes(":")) return null;
  const ipv4Tail = clean.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  let input = clean;
  const tail: string[] = [];
  if (ipv4Tail) {
    const ipv4 = normalizedIpv4(ipv4Tail);
    if (!ipv4) return null;
    const octets = ipv4.split(".").map(Number);
    tail.push(
      ((octets[0] << 8) | octets[1]).toString(16),
      ((octets[2] << 8) | octets[3]).toString(16),
    );
    input = clean.slice(0, clean.length - ipv4Tail.length).replace(/:$/, "");
  }
  if ((input.match(/::/g) || []).length > 1) return null;
  const [leftValue, rightValue] = input.split("::");
  const left = leftValue ? leftValue.split(":") : [];
  const right = rightValue ? rightValue.split(":") : [];
  const groups = [...left, ...right, ...tail];
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  const omitted = 8 - groups.length;
  if (input.includes("::")) {
    if (omitted < 1) return null;
  } else if (omitted !== 0) return null;
  const expanded = [
    ...left,
    ...Array.from({ length: omitted }, () => "0"),
    ...right,
    ...tail,
  ];
  return expanded
    .map((group) => Number.parseInt(group, 16).toString(16))
    .join(":");
}

export function normalizeIpAddress(value: string | null | undefined) {
  const clean = (value || "").trim();
  return normalizedIpv4(clean) || normalizedIpv6(clean);
}

export function trustedClientIp(request: Request) {
  // Cloudflare overwrites these headers at the edge. Requiring CF-Ray keeps
  // direct/local requests from treating a caller-supplied forwarding header
  // as authoritative; X-Forwarded-For and True-Client-IP are never trusted.
  if (!request.headers.get("CF-Ray")) return null;
  return normalizeIpAddress(request.headers.get("CF-Connecting-IP"));
}
