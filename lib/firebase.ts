import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

/**
 * Point the app at the local emulator suite instead of the real project.
 *
 * Opt-in via env rather than sniffing NODE_ENV: `next dev` against real data is
 * a legitimate thing to want, and silently rerouting it would be worse than
 * making the choice explicit.
 */
const USE_EMULATOR = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "true";

// Each value must be referenced statically so Next.js can inline it into the
// client bundle at build time; `process.env[name]` lookups are not replaced.
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/**
 * The shared Firebase app. Initialized lazily and reused, so React Fast Refresh
 * and multiple module graphs (server + client) don't create duplicate apps.
 */
export function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }

  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error(
      "Firebase config is missing. Copy .env.example to .env.local and fill in the NEXT_PUBLIC_FIREBASE_* values.",
    );
  }

  const app = initializeApp(firebaseConfig);

  if (USE_EMULATOR) {
    // Must happen before any read or write on either service.
    connectFirestoreEmulator(getFirestore(app), "127.0.0.1", 8080);
    connectAuthEmulator(getAuth(app), "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
  }

  return app;
}

let analytics: Promise<Analytics | null> | undefined;

/**
 * Resolves to Analytics in supported browsers, or `null` on the server and in
 * environments where measurement isn't available (SSR, some in-app browsers,
 * no `measurementId`). `getAnalytics()` touches `window`, so it can never run
 * during rendering on the server.
 */
export function getFirebaseAnalytics(): Promise<Analytics | null> {
  // Analytics has no emulator, so it stays off locally rather than polluting
  // the real property with development traffic.
  if (
    typeof window === "undefined" ||
    !firebaseConfig.measurementId ||
    USE_EMULATOR
  ) {
    return Promise.resolve(null);
  }

  analytics ??= isSupported().then((supported) =>
    supported ? getAnalytics(getFirebaseApp()) : null,
  );

  return analytics;
}
