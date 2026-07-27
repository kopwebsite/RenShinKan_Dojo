import { getAdminSession, hasSelectedDojoAccess, isRenShinKanSuperAdmin } from "../_lib/auth";
import { withPrivateNoIndex } from "../_lib/privateResponse";
import type { StudentEnv } from "../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

const RENSHINKAN_ONLY_PAGES = new Set([
  "/admin/dojos",
  "/admin/site-editor",
  "/admin/downloads",
]);

export const onRequestGet: PagesFunction<Env> = async ({ request, env, next }) => {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const session = await getAdminSession(request, env);
  if (pathname === "/admin") {
    if (hasSelectedDojoAccess(session) && !isRenShinKanSuperAdmin(session)) {
      return withPrivateNoIndex(Response.redirect(new URL("/admin/students", url), 302));
    }
    return withPrivateNoIndex(await next());
  }
  if (!hasSelectedDojoAccess(session)) {
    return withPrivateNoIndex(Response.redirect(new URL("/admin", url), 302));
  }
  if (pathname === "/admin/memberships") {
    return withPrivateNoIndex(Response.redirect(new URL("/admin/students?section=memberships", url), 302));
  }
  if (RENSHINKAN_ONLY_PAGES.has(pathname) && !isRenShinKanSuperAdmin(session)) {
    return withPrivateNoIndex(Response.redirect(new URL("/admin", url), 302));
  }
  return withPrivateNoIndex(await next());
};
