/**
 * Diagnoses whether the live Firebase project is ready for the app.
 *
 * Every failure here is fixed in the Firebase Console, not in code, so the
 * output names the exact page to open rather than just reporting an error.
 *
 *   npm run check:firebase
 */

import { readFileSync } from "node:fs";

// Read .env.local directly; this runs outside Next, so nothing is injected.
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY;
const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const usingEmulator = env.NEXT_PUBLIC_FIREBASE_EMULATOR === "true";

const console_ = (p: string) =>
  `https://console.firebase.google.com/project/${projectId}/${p}`;

let ready = true;
const line = (ok: boolean, label: string, detail = "") => {
  if (!ok) ready = false;
  console.log(`  ${ok ? "OK  " : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};

console.log(`\nProject: ${projectId}`);
console.log(`Target:  ${usingEmulator ? "local emulator" : "live Firebase"}\n`);

if (usingEmulator) {
  console.log("NEXT_PUBLIC_FIREBASE_EMULATOR=true, so the app is not using the");
  console.log("live project at all. Set it to false to check the real one.\n");
  process.exit(0);
}

// 1. Anonymous sign-in. The app has no login form, so without this it cannot
//    reach the database at all.
let token = "";
const signUp = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  },
).then((r) => r.json());

if (signUp.idToken) {
  token = signUp.idToken;
  line(true, "Anonymous sign-in enabled");
} else if (signUp.error?.message === "ADMIN_ONLY_OPERATION") {
  line(false, "Anonymous sign-in DISABLED");
  console.log(`        Enable the Anonymous provider:`);
  console.log(`        ${console_("authentication/providers")}`);
} else if (signUp.error?.message === "CONFIGURATION_NOT_FOUND") {
  line(false, "Authentication not set up");
  console.log(`        ${console_("authentication")}`);
} else {
  line(false, "Anonymous sign-in failed", signUp.error?.message ?? "");
}

// 2. Firestore reachable, and readable by that anonymous session.
const docsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const read = await fetch(`${docsUrl}/staff?pageSize=1`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
}).then((r) => r.json());

if (read.error?.message?.includes("has not been used in project")) {
  line(false, "Firestore database not created");
  console.log(`        ${console_("firestore")}`);
} else if (read.error?.status === "PERMISSION_DENIED") {
  line(false, "Firestore rules reject this session");
  console.log(`        Deploy the rules:  npx firebase deploy --only firestore:rules`);
} else if (read.error) {
  line(false, "Firestore unreachable", read.error.message ?? "");
} else {
  line(true, "Firestore readable");

  // 3. Is there anything to sign in against?
  const staffCount = (read.documents ?? []).length;
  if (staffCount === 0) {
    line(false, "No staff records yet");
    console.log(`        Seed them:  npm run bootstrap:admin && npm run seed`);
  } else {
    line(true, "Staff records present");
  }
}

console.log(
  ready
    ? "\nReady. PIN 1234 should work at http://localhost:3000\n"
    : "\nNot ready yet. Fix the FAIL lines above, then run this again.\n",
);
process.exit(ready ? 0 : 1);
