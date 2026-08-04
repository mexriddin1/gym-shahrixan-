// FROZEN. Ported verbatim from gym/client/src/app/page.tsx (the v1 landing
// aside) and must stay visually identical. Do not restyle, retheme, resize,
// reword or reorder anything in this file.
//
// Two deliberate exceptions to house rules, both in service of that freeze:
//   1. lucide-react is used here and nowhere else in the app. The rest of the
//      codebase is Phosphor. Swapping these two glyphs for their Phosphor
//      equivalents would visibly change the mark and the tick.
//   2. The "UZS · Asia/Tashkent" line is a locale strip, which the design
//      skill discourages. It stays because the freeze outranks the guideline.
//   3. The first benefit line contains an em-dash, which is banned everywhere
//      else in this codebase. It is original copy, so it stays. This file is
//      the ONLY permitted em-dash in the app; the pre-flight sweep excludes it
//      and must not "fix" it.

import { DumbbellIcon, CircleCheckIcon } from "lucide-react";

const BENEFITS = [
  "Mijozlar, tariflar va to'lovlar — bitta profilda",
  "Check-in va tashriflarni real vaqtda nazorat qiling",
  "Kunlik tushum va qarzdorlik bo'yicha aniq hisobot",
];

export function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-neutral-950 p-10 text-neutral-100 lg:flex lg:flex-col">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-neutral-100 text-neutral-950">
          <DumbbellIcon className="size-5" />
        </span>
        <div className="leading-none">
          <p className="text-sm font-semibold tracking-tight">GymOS</p>
          <p className="text-xs text-neutral-400">Boshqaruv tizimi</p>
        </div>
      </div>

      <div className="relative mt-auto space-y-8">
        <h2 className="max-w-md text-3xl font-semibold tracking-tight text-balance">
          Gym faoliyatini boshdan oxirigacha bitta tizimda boshqaring.
        </h2>
        <ul className="space-y-3">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-3 text-sm text-neutral-300">
              <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-neutral-100" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative mt-10 text-xs text-neutral-500">UZS · Asia/Tashkent</p>
    </aside>
  );
}
