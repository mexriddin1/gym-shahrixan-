/**
 * Creates the first main_admin so the app can be signed into at all.
 *
 * Auth is PIN only, so there is no email or password: this just writes a staff
 * document with a PIN hash on it.
 *
 *   npm run bootstrap:admin                  # Administrator, PIN 1234
 *   npm run bootstrap:admin -- Dilshod 4821  # custom name and PIN
 *
 * Targets whatever .env.local points at (emulator or the live project).
 */

import { doc, serverTimestamp, setDoc } from "firebase/firestore";

// Imported rather than reimplemented, so the hash can never drift from the one
// the app computes at the PIN pad.
import { DEFAULT_PIN, hashPin, isValidPinFormat } from "../lib/auth/pin.js";
import { connect } from "./firebase-script-app.mjs";

const name = process.argv[2] ?? "Administrator";
const pin = process.argv[3] ?? DEFAULT_PIN;

if (!isValidPinFormat(pin)) {
  console.error(`PIN must be exactly 4 digits. Got: ${pin}`);
  process.exit(1);
}

const { db, target } = await connect();

// Fixed id so re-running updates the same record instead of piling up admins.
await setDoc(
  doc(db, "staff", "admin"),
  {
    email: name,
    role: "main_admin",
    isActive: true,
    pinHash: await hashPin(pin),
    createdAt: serverTimestamp(),
  },
  { merge: true },
);

console.log(`\nmain_admin ready on ${target}: ${name}`);
console.log(`PIN: ${pin}`);
if (pin === DEFAULT_PIN) {
  console.log("This is the default PIN. Change it in Sozlamalar.");
}
process.exit(0);
