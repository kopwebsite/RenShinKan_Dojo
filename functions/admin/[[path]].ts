import {
  clearSessionCookie,
  getAuthorizedAdminSession,
  revokeAdminSession,
} from "../_lib/auth";
import { withPrivateNoIndex } from "../_lib/privateResponse";
import type { StudentEnv } from "../_lib/studentRecords";
import { adminRouteAccess } from "../../shared/adminPermissions";

type Env = StudentEnv & { SESSION_SECRET?: string };

export const onRequestGet: PagesFunction<Env> = async ({ request, env, next }) => {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const session = await getAuthorizedAdminSession(request, env);
  if (pathname === "/admin") {
    if (session)
      await revokeAdminSession(env, session, session.adminName, "admin_login_boundary_opened");
    const asset = await next();
    const response = new Response(asset.body, asset);
    response.headers.append("Set-Cookie", clearSessionCookie());
    return withPrivateNoIndex(response);
  }
  if (!session) {
    return withPrivateNoIndex(Response.redirect(new URL("/admin", url), 302));
  }
  if (pathname === "/admin/memberships") {
    return withPrivateNoIndex(Response.redirect(new URL("/admin/students?section=memberships", url), 302,
      ),
    );
  }
  const access = adminRouteAccess(pathname);
  if (access === "deny") {
    return withPrivateNoIndex(
      Response.redirect(new URL("/admin/dashboard", url), 302));
  }
  return withPrivateNoIndex(await next());
};
