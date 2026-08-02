import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import { adminApi } from "./adminApi";
import type {
  AdminDojo,
  AdminIdentity,
  AdminSessionResponse,
} from "./AdminAccess";

type SessionStatus = "loading" | "authenticated" | "unauthenticated" | "error";

type AdminSessionContextValue = {
  status: SessionStatus;
  checked: boolean;
  admin: AdminIdentity | null;
  dojos: AdminDojo[];
  name: string;
  password: string;
  busy: boolean;
  selecting: string;
  error: string;
  setName(value: string): void;
  setPassword(value: string): void;
  setError(value: string): void;
  login(event: FormEvent): Promise<void>;
  selectDojo(dojoId: string): Promise<void>;
  switchDojo(): Promise<void>;
  logout(): Promise<void>;
  refresh(preserveView?: boolean): Promise<void>;
};

const AdminSessionContext = createContext<AdminSessionContextValue | null>(
  null,
);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [dojos, setDojos] = useState<AdminDojo[]>([]);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState("");
  const [error, setError] = useState("");
  const generation = useRef(0);
  const bootstrapController = useRef<AbortController | null>(null);

  const clearSharedSession = useCallback(() => {
    generation.current += 1;
    bootstrapController.current?.abort();
    setAdmin(null);
    setDojos([]);
    setPassword("");
    setSelecting("");
    setStatus("unauthenticated");
  }, []);

  const refresh = useCallback(async (preserveView = false) => {
    const currentGeneration = ++generation.current;
    bootstrapController.current?.abort();
    const controller = new AbortController();
    bootstrapController.current = controller;
    if (!preserveView) setStatus("loading");
    setError("");
    try {
      const result = await adminApi<AdminSessionResponse>(
        "/api/admin/session",
        { signal: controller.signal },
      );
      if (controller.signal.aborted || currentGeneration !== generation.current)
        return;
      setAdmin(result.admin);
      setDojos(result.dojos || []);
      setStatus(
        result.authenticated && result.admin
          ? "authenticated"
          : "unauthenticated",
      );
    } catch (reason) {
      if (controller.signal.aborted || currentGeneration !== generation.current)
        return;
      setAdmin(null);
      setDojos([]);
      setStatus("error");
      setError(
        reason instanceof Error
          ? reason.message
          : "The administrator session could not be checked.",
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
    const invalidate = () => clearSharedSession();
    window.addEventListener("admin-session-invalid", invalidate);
    return () => {
      generation.current += 1;
      bootstrapController.current?.abort();
      window.removeEventListener("admin-session-invalid", invalidate);
    };
  }, [clearSharedSession, refresh]);

  const login = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setError("");
      try {
        await adminApi("/api/admin/login", {
          method: "POST",
          body: JSON.stringify({ adminName: name.trim(), password }),
        });
        setPassword("");
        await refresh(true);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Sign-in failed.");
      } finally {
        setBusy(false);
      }
    },
    [name, password, refresh],
  );

  const selectDojo = useCallback(
    async (dojoId: string) => {
      const currentGeneration = generation.current;
      setSelecting(dojoId);
      setError("");
      try {
        const result = await adminApi<{ admin: AdminIdentity }>(
          "/api/admin/select-dojo",
          { method: "POST", body: JSON.stringify({ dojoId }) },
        );
        if (currentGeneration !== generation.current) return;
        setAdmin(result.admin);
        setStatus("authenticated");
        navigate("/admin/dashboard", { replace: true });
      } catch (reason) {
        if (currentGeneration === generation.current)
          setError(
            reason instanceof Error
              ? reason.message
              : "The dojo could not be selected.",
          );
      } finally {
        if (currentGeneration === generation.current) setSelecting("");
      }
    },
    [navigate],
  );

  const switchDojo = useCallback(async () => {
    const currentGeneration = generation.current;
    setError("");
    const result = await adminApi<{ admin: AdminIdentity }>(
      "/api/admin/switch-dojo",
      { method: "POST" },
    );
    if (currentGeneration === generation.current) setAdmin(result.admin);
  }, []);

  const logout = useCallback(async () => {
    clearSharedSession();
    setName("");
    try {
      await adminApi("/api/admin/logout", { method: "POST" });
    } catch {
      // Local state is authoritative after logout; an expired server session is
      // already safe and a network error must not restore stale UI state.
    }
  }, [clearSharedSession]);

  const value = useMemo<AdminSessionContextValue>(
    () => ({
      status,
      checked: status !== "loading",
      admin,
      dojos,
      name,
      password,
      busy,
      selecting,
      error,
      setName,
      setPassword,
      setError,
      login,
      selectDojo,
      switchDojo,
      logout,
      refresh,
    }),
    [
      admin,
      busy,
      dojos,
      error,
      login,
      logout,
      name,
      password,
      refresh,
      selectDojo,
      selecting,
      status,
      switchDojo,
    ],
  );

  return createElement(AdminSessionContext.Provider, { value }, children);
}

export function useAdminSession() {
  const session = useContext(AdminSessionContext);
  if (!session)
    throw new Error("useAdminSession must be used inside AdminSessionProvider");
  return session;
}
