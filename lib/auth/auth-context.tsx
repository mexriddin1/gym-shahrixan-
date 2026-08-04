"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  type User,
} from "firebase/auth";
import { doc, getDocs, updateDoc } from "firebase/firestore";

import { getFirebaseApp } from "@/lib/firebase";
import { dateKey } from "@/lib/utils";
import { db, staffRef } from "@/lib/db/collections";
import type { Role, Staff } from "@/lib/db/types";
import { DEFAULT_PIN, hashPin, pinMatches } from "./pin";

/** Hash of the PRD default, so Sozlamalar can nag anyone still using it. */
const defaultPinHash = typeof window === "undefined" ? null : hashPin(DEFAULT_PIN);

/** Who is at the desk, and which day they unlocked. */
const SESSION_KEY = "gymos.session";

type StoredSession = { staffId: string; date: string };

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export type UnlockResult = { ok: true } | { ok: false; reason: string };

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms),
    ),
  ]);
}

/**
 * Turns a Firebase failure into something a person at a desk can act on.
 *
 * The generic "PIN kod noto'g'ri" was actively misleading here: a project with
 * Firestore switched off produces the same dead end as a wrong PIN, and the
 * person retyping their PIN has no way to tell the difference.
 */
function describeAuthError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  if (code.includes("permission-denied")) {
    return "Ma'lumotlarga ruxsat yo'q. Firestore qoidalarini tekshiring.";
  }
  if (code.includes("failed-precondition") || code.includes("not-found")) {
    return "Firestore bazasi topilmadi. Firebase konsolida uni yoqing.";
  }
  if (code.includes("unavailable") || code.includes("unauthenticated")) {
    return "Serverga ulanib bo'lmadi. Internetni tekshiring.";
  }
  return error instanceof Error && error.message
    ? error.message
    : "Kirishda xatolik yuz berdi";
}

type AuthState = {
  /** Anonymous Firebase session. Present once the app can talk to Firestore. */
  user: User | null;
  /** The staff member who entered their PIN, or null while locked. */
  staff: Staff | null;
  role: Role | undefined;
  /** True until the anonymous session and any stored PIN session resolve. */
  loading: boolean;
  /** No PIN entered yet. The PIN screen is showing. */
  locked: boolean;
  usingDefaultPin: boolean;
  /** Verifies a PIN and, on success, unlocks as that staff member. Never rejects. */
  unlock: (pin: string) => Promise<UnlockResult>;
  lock: () => void;
  changePin: (pin: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [defaultHash, setDefaultHash] = useState<string | null>(null);

  useEffect(() => {
    void defaultPinHash?.then(setDefaultHash);
  }, []);

  useEffect(() => {
    const auth = getAuth(getFirebaseApp());
    void setPersistence(auth, browserLocalPersistence);

    /**
     * Puts the desk back where it was.
     *
     * Runs whether or not the anonymous sign-in succeeded. Restoring only on
     * success was a real bug: with the Anonymous provider switched off, sign-in
     * throws, the restore never ran, and the desk was asked for its PIN on
     * every single refresh.
     */
    async function restore() {
      const session = readSession();
      // The PIN is good for the day it was entered. A new day, a new unlock.
      if (session && session.date === dateKey()) {
        try {
          const snap = await getDocs(staffRef());
          const found = snap.docs.find((d) => d.id === session.staffId)?.data();
          setStaff(found && found.isActive ? found : null);
        } catch {
          setStaff(null);
        }
      } else if (session) {
        localStorage.removeItem(SESSION_KEY);
      }
      setLoading(false);
    }

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        // There is no login screen to send anyone to, so the app signs itself
        // in anonymously and the PIN decides who is using it.
        try {
          await signInAnonymously(auth);
          return; // the listener fires again with the new user
        } catch {
          await restore();
        }
        return;
      }

      setUser(nextUser);
      await restore();
    });

    return unsubscribe;
  }, []);

  /**
   * Finds the staff member whose stored hash matches, which is why the PIN
   * salt is fixed rather than per-account.
   *
   * Never rejects. A PIN pad that throws is a PIN pad that hangs, so every
   * failure comes back as a reason the screen can show.
   */
  const unlock = useCallback(async (pin: string): Promise<UnlockResult> => {
    try {
      // Firestore retries a dead backend for a long time. Without a deadline
      // the pad would sit spinning with every key disabled.
      const snap = await withTimeout(
        getDocs(staffRef()),
        12_000,
        "Serverga ulanib bo'lmadi. Internetni tekshiring.",
      );

      const candidates = snap.docs.map((d) => d.data()).filter((s) => s.isActive);
      if (candidates.length === 0) {
        return { ok: false, reason: "Xodimlar ro'yxati bo'sh. Administratorga murojaat qiling." };
      }

      for (const candidate of candidates) {
        if (await pinMatches(pin, candidate.pinHash)) {
          localStorage.setItem(
            SESSION_KEY,
            JSON.stringify({ staffId: candidate.id, date: dateKey() }),
          );
          setStaff(candidate);
          return { ok: true };
        }
      }
      return { ok: false, reason: "PIN kod noto'g'ri" };
    } catch (e) {
      return { ok: false, reason: describeAuthError(e) };
    }
  }, []);

  const lock = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setStaff(null);
  }, []);

  const changePin = useCallback(
    async (pin: string) => {
      if (!staff) throw new Error("Avval PIN kod bilan kiring");
      const pinHash = await hashPin(pin);
      await updateDoc(doc(db(), "staff", staff.id), { pinHash });
      setStaff({ ...staff, pinHash });
    },
    [staff],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      staff,
      role: staff?.role,
      loading,
      locked: staff === null,
      usingDefaultPin: staff !== null && staff.pinHash === defaultHash,
      unlock,
      lock,
      changePin,
      // Signing out of an anonymous session is just locking the desk.
      signOut: async () => lock(),
    }),
    [user, staff, loading, defaultHash, unlock, lock, changePin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
