/**
 * Desk PIN.
 *
 * The PIN is the only credential: staff type four digits and they are in.
 * That is a deliberate product decision for a shared front-desk terminal.
 *
 * Be clear-eyed about what it does and does not buy. Four digits is 10 000
 * possibilities and the Firebase web config is public, so the PIN keeps honest
 * people out of the wrong screens; it is not a defence against someone who
 * sets out to read the database. Hashing exists so the staff collection never
 * carries the PIN in the clear.
 */

export const PIN_LENGTH = 4;

/** Per the PRD. What a freshly created staff member starts with. */
export const DEFAULT_PIN = "1234";

export function isValidPinFormat(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

/**
 * Fixed application salt rather than a per-account one.
 *
 * The desk types a PIN with no username, so the app has to find which staff
 * member it belongs to by comparing hashes. A per-account salt would make that
 * impossible without first knowing the account, which is the thing being
 * looked up.
 */
const SALT = "gymos.desk.pin.v1";

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${SALT}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** True when the PIN matches the stored hash. */
export async function pinMatches(
  pin: string,
  storedHash: string | null,
): Promise<boolean> {
  if (!isValidPinFormat(pin) || !storedHash) return false;
  return (await hashPin(pin)) === storedHash;
}
