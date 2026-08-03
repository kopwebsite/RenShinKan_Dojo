import {
  effectivePermissionLevel,
  getAuthorizedAdminSession,
} from "../_lib/auth";
import { withPrivateNoIndex } from "../_lib/privateResponse";
import type { StudentEnv } from "../_lib/studentRecords";
import { canAccessAdminPath } from "../../shared/adminPermissions";

type Env = StudentEnv & { SESSION_SECRET?: string };

export const onRequestGet: PagesFunction<Env> = async ({ request, env, next }) => {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const session = await getAuthorizedAdminSession(request, env);
  if (pathname === "/admin") {
    return withPrivateNoIndex(await next());
  }
  if (!session) {
    return withPrivateNoIndex(Response.redirect(new URL("/admin", url.href).href, 302));
  }
  if (pathname === "/admin/memberships") {
    return withPrivateNoIndex(Response.redirect(new URL("/admin/students?section=memberships", url.href).href, 302,
      ),
    );
  }
  if (!canAccessAdminPath(pathname, effectivePermissionLevel(session))) {
    return withPrivateNoIndex(
      Response.redirect(new URL("/admin/dashboard", url.href).href, 302));
  }
  return withPrivateNoIndex(await next());
};
