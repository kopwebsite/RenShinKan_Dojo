import { FormEvent, useEffect, useState } from "react";
import { adminApi } from "./adminApi";
import type { AdminDojo, AdminIdentity, AdminSessionResponse } from "./AdminAccess";

export function useAdminSession() {
  const [checked, setChecked] = useState(false);
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [dojos, setDojos] = useState<AdminDojo[]>([]);
  const [name, setName] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [selecting, setSelecting] = useState(""); const [error, setError] = useState("");

  async function refresh() {
    try {
      const result = await adminApi<AdminSessionResponse>("/api/admin/session");
      setAdmin(result.admin); setDojos(result.dojos || []);
    } catch { setAdmin(null); }
    finally { setChecked(true); }
  }
  useEffect(() => { void refresh(); }, []);

  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await adminApi("/api/admin/login", { method: "POST", body: JSON.stringify({ adminName: name.trim(), password }) }); setPassword(""); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Sign-in failed."); }
    finally { setBusy(false); }
  }
  async function selectDojo(dojoId: string) {
    setSelecting(dojoId); setError("");
    try { const result = await adminApi<{ admin: AdminIdentity }>("/api/admin/select-dojo", { method: "POST", body: JSON.stringify({ dojoId }) }); setAdmin(result.admin); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The dojo could not be selected."); }
    finally { setSelecting(""); }
  }
  async function logout() { try { await adminApi("/api/admin/logout", { method: "POST" }); } finally { setAdmin(null); setName(""); } }
  return { checked, admin, dojos, name, password, busy, selecting, error, setName, setPassword, setError, login, selectDojo, logout, refresh };
}
