export type AdminRouteAccess = "entry" | "authenticated" | "central" | "deny";
export type AdminPermission = "dojo_admin" | "renshinkan_super_admin";

const EXACT_ROUTES = new Map<string, AdminRouteAccess>([
  ["/admin", "entry"],
  ["/admin/dashboard", "authenticated"],
  ["/admin/students", "authenticated"],
  ["/admin/profile-requests", "authenticated"],
  ["/admin/training-requests", "authenticated"],
  ["/admin/exam-applications", "authenticated"],
  ["/admin/examination-records", "authenticated"],
  ["/admin/exam-payslips", "central"],
  ["/admin/aat-contributions", "authenticated"],
  ["/admin/payment-proofs", "authenticated"],
  ["/admin/memberships", "authenticated"],
  ["/admin/monthly-contributions", "central"],
  ["/admin/website", "central"],
  ["/admin/site-editor", "central"],
  ["/admin/dojo-updates", "central"],
  ["/admin/downloads", "central"],
  ["/admin/dojos", "central"],
  ["/admin/audit", "central"],
]);

const PREFIX_ROUTES: ReadonlyArray<readonly [string, AdminRouteAccess]> = [
  ["/admin/galleries/", "central"],
];

export function normalizeAdminPath(pathname: string) {
  const normalized = pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return normalized || "/";
}

export function adminRouteAccess(pathname: string): AdminRouteAccess {
  const path = normalizeAdminPath(pathname);
  const exact = EXACT_ROUTES.get(path);
  if (exact) return exact;
  return (
    PREFIX_ROUTES.find(([prefix]) => path.startsWith(prefix))?.[1] ?? "deny"
  );
}

export function canAccessAdminPath(
  pathname: string,
  permission: AdminPermission | null | undefined,
) {
  const access = adminRouteAccess(pathname);
  if (access === "entry") return true;
  if (!permission || access === "deny") return false;
  return access === "authenticated" || permission === "renshinkan_super_admin";
}
