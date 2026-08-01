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
  secondaryPassword: string;
  busy: boolean;
  selecting: string;
  verifying: boolean;
  error: string;
  setName(value: string): void;
  setPassword(value: string): void;
  setSecondaryPassword(value: string): void;
  setError(value: string): void;
  login(event: FormEvent): Promise<void>;
  selectDojo(dojoId: string): Promise<void>;
  verifyRenshinKan(event: FormEvent): Promise<void>;
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
  const [secondaryPassword, setSecondaryPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const generation = useRef(0);
  const bootstrapController = useRef<AbortController | null>(null);

  const clearSharedSession = useCallback(() => {
    generation.current += 1;
    bootstrapController.current?.abort();
    setAdmin(null);
    setDojos([]);
    setPassword("");
    setSecondaryPassword("");
    setSelecting("");
    setVerifying(false);
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
        if (!result.admin.renshinkanVerificationRequired)
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

  const verifyRenshinKan = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const currentGeneration = generation.current;
      setVerifying(true);
      setError("");
      try {
        const result = await adminApi<{ admin: AdminIdentity }>(
          "/api/admin/verify-renshinkan",
          {
            method: "POST",
            body: JSON.stringify({ password: secondaryPassword }),
          },
        );
        if (currentGeneration !== generation.current) return;
        setSecondaryPassword("");
        setAdmin(result.admin);
        setStatus("authenticated");
        navigate("/admin/dashboard", { replace: true });
      } catch (reason) {
        if (currentGeneration === generation.current)
          setError(
            reason instanceof Error
              ? reason.message
              : "RenShinKan access could not be verified.",
          );
      } finally {
        if (currentGeneration === generation.current) setVerifying(false);
      }
    },
    [navigate, secondaryPassword],
  );

  const switchDojo = useCallback(async () => {
    const currentGeneration = generation.current;
    setError("");
    setSecondaryPassword("");
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
      secondaryPassword,
      busy,
      selecting,
      verifying,
      error,
      setName,
      setPassword,
      setSecondaryPassword,
      setError,
      login,
      selectDojo,
      verifyRenshinKan,
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
      secondaryPassword,
      selectDojo,
      selecting,
      status,
      switchDojo,
      verifyRenshinKan,
      verifying,
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
