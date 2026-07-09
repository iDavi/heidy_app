import { useCallback, useEffect, useMemo, useState } from "react";
import type { CredentialBlob, User } from "../api/types";

const storageKey = "heidy.session";

type StoredSession = {
  token: string;
  user: User;
  credentialBlob?: CredentialBlob;
};

export function useLocalSession() {
  const [session, setSessionState] = useState<StoredSession | null>(() => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      localStorage.removeItem(storageKey);
      return null;
    }
  });

  useEffect(() => {
    if (session) {
      localStorage.setItem(storageKey, JSON.stringify(session));
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [session]);

  const setSession = useCallback((next: StoredSession) => {
    setSessionState(next);
  }, []);

  const patchUser = useCallback((user: User) => {
    setSessionState((current) => (current ? { ...current, user } : current));
  }, []);

  const clearSession = useCallback(() => {
    setSessionState(null);
  }, []);

  return useMemo(
    () => ({ session, setSession, patchUser, clearSession }),
    [clearSession, patchUser, session, setSession]
  );
}
