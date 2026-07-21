import { Navigate } from "react-router-dom";

export function AdminMembershipsPage() {
  return <Navigate to="/admin/students?section=memberships" replace />;
}
