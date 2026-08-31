/**
 * Strips the bracketed tags out of member names.
 *
 *   npx tsx scripts/strip-name-tags.mts         # dry run: prints, writes nothing
 *   npx tsx scripts/strip-name-tags.mts --yes   # applies
 *
 * The August sheet carried a note inside the name - "(Yangi)", "(Dom)",
 * "(Yangi Abu Kichkina)" - which the import kept because it was how the desk
 * told two people apart. This removes them.
 *
 * The rule is: everything from the first bracket to the end of the string goes.
 * Not "remove the balanced groups", which is what a bracket-matching pass would
 * do and which fails on more than a tenth of these names - the sheet contains
 * "(Yangi0" with a zero for the closing bracket, "(Yangi" never closed at all,
 * ")Yangi)" opened with the wrong one, and several where a second note trails
 * after the closing bracket with no brackets of its own ("(Yangi)Jiyan",
 * "(Yangi)Паспорт Стол"). Cutting at the first bracket handles every one of
 * them, because in this data the name always comes first and everything after
 * the first bracket is commentary.
 *
 * `clientName` is denormalised onto subscriptions and payments, so those are
 * rewritten too. Daily sheet rows are left alone: those are a record of what
 * was sold on a past day and are not part of this list.
 */

import {
  collection,
  doc,
  getDocs,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import { normalisePersonName } from "../lib/domain/names.js";
import { connect } from "./firebase-script-app.mjs";

const apply = process.argv.includes("--yes");

/** "Karimov Ulugbek (Dom)" -> "Karimov Ulugbek". */
export function stripNameTag(name: string): string {
  const cut = name.search(/[()]/);
  const base = cut === -1 ? name : name.slice(0, cut);
  return normalisePersonName(base);
}

const { db, target } = await connect();
console.log(`\ntarget: ${target}   (${apply ? "WRITING" : "dry run"})\n`);

const clients = (await getDocs(collection(db, "clients"))).docs;

type Change = { id: string; from: string; to: string; code: number };
const changes: Change[] = [];
const empties: Change[] = [];

for (const d of clients) {
  const data = d.data();
  const from = data.firstName as string;
  const to = stripNameTag(from);
  if (to === from) continue;
  const change = { id: d.id, from, to, code: data.code as number };
  // A name that strips to nothing would leave a member with no name at all,
  // so it is reported and skipped rather than written.
  if (!to) empties.push(change);
  else changes.push(change);
}

console.log(`mijozlar:        ${clients.length}`);
console.log(`o'zgaradi:       ${changes.length}`);
console.log(`o'zgarmaydi:     ${clients.length - changes.length - empties.length}`);
console.log("");

for (const c of changes) {
  console.log(`  #${c.code}  ${c.from.padEnd(46)} ->  ${c.to}`);
}
console.log("");

if (empties.length) {
  console.log("--- nomi butunlay yo'qoladi, tegilmadi ---");
  for (const c of empties) console.log(`  #${c.code}  ${c.from}`);
  console.log("");
}

/*
 * Two members can only be told apart by their tags once the tags are gone.
 * Reported rather than blocked - the desk knows which of them is which and may
 * well want them merged - but never left for somebody to discover by ringing
 * the wrong person.
 */
const finalNames = new Map<string, string[]>();
for (const d of clients) {
  const data = d.data();
  const name = stripNameTag(data.firstName as string) || (data.firstName as string);
  finalNames.set(name, [...(finalNames.get(name) ?? []), `#${data.code}`]);
}
const clashes = [...finalNames].filter(([, ids]) => ids.length > 1);

if (clashes.length) {
  console.log("--- DIQQAT: qavs olingandan keyin bir xil ism ---");
  for (const [name, ids] of clashes) console.log(`  ${name}  (${ids.join(", ")})`);
  console.log("");
} else {
  console.log("Bir xil ism yo'q - hamma ism noyob bo'lib qoladi.\n");
}

if (!apply) {
  console.log("Hech narsa yozilmadi. Yozish uchun: --yes\n");
  process.exit(0);
}

/* ----------------------------- write ------------------------------ */

let batch = writeBatch(db);
let pending = 0;

async function flush(force = false) {
  if (pending === 0) return;
  if (!force && pending < 400) return;
  await batch.commit();
  batch = writeBatch(db);
  pending = 0;
}

const renamed = new Map(changes.map((c) => [c.id, c.to]));

for (const c of changes) {
  batch.update(doc(db, "clients", c.id), { firstName: c.to });
  pending++;
  await flush();
}

/** The copies of the name that live on the records pointing at a member. */
async function fixSnapshots(db: Firestore, name: string) {
  const snap = await getDocs(collection(db, name));
  let n = 0;
  for (const d of snap.docs) {
    const clientId = d.data().clientId as string | null;
    if (!clientId) continue;
    const next = renamed.get(clientId);
    if (!next || next === d.data().clientName) continue;
    batch.update(doc(db, name, d.id), { clientName: next });
    pending++;
    n++;
    await flush();
  }
  return n;
}

const subs = await fixSnapshots(db, "subscriptions");
const pays = await fixSnapshots(db, "payments");
await flush(true);

console.log(`yangilandi: clients ${changes.length}`);
console.log(`yangilandi: subscriptions ${subs}`);
console.log(`yangilandi: payments ${pays}`);
console.log("Tayyor.\n");
process.exit(0);
