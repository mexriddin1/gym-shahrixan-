/**
 * Shared Firestore handle for the CLI scripts.
 *
 * Uses the Firebase client SDK rather than the Admin SDK on purpose. The Admin
 * SDK needs a service account key for the live project, which is a lot to ask
 * before anyone has seen the app run. The client SDK works with whatever the
 * project's rules currently allow: open rules during setup, or an anonymous
 * session once the Anonymous provider is switched on.
 */

import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import { connectAuthEmulator } from "firebase/auth";

function readEnvFile(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split("\n")
        .filter((l) => l.trim() && !l.trim().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

export async function connect(): Promise<{ db: Firestore; target: string }> {
  const env = { ...readEnvFile(), ...process.env } as Record<string, string>;
  const target =
    process.env.SEED_TARGET ??
    (env.NEXT_PUBLIC_FIREBASE_EMULATOR === "true" ? "emulator" : "production");

  const app = initializeApp({
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });

  const db = getFirestore(app);
  const auth = getAuth(app);

  if (target === "emulator") {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  }

  // Sign in if the project allows it. If the Anonymous provider is still off,
  // carry on unauthenticated: open rules will accept the writes, and if they
  // do not, the write itself reports a clear permission error.
  try {
    await signInAnonymously(auth);
    console.log(`Connected to ${target} (anonymous session).`);
  } catch {
    console.log(`Connected to ${target} (no auth; relying on open rules).`);
  }

  return { db, target };
}
