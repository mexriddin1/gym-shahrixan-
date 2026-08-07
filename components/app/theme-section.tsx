"use client";

import { useTheme } from "next-themes";
import { MonitorIcon, MoonIcon, SunIcon, type Icon } from "@phosphor-icons/react";

import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

const OPTIONS: { value: string; label: string; hint: string; icon: Icon }[] = [
  {
    value: "system",
    label: "Tizim",
    hint: "Kompyuter sozlamasi",
    icon: MonitorIcon,
  },
  { value: "light", label: "Yorug'", hint: "Kunduzi", icon: SunIcon },
  { value: "dark", label: "Qorong'i", hint: "Kechqurun", icon: MoonIcon },
];

/**
 * Light, dark, or whatever the machine is set to.
 *
 * next-themes writes the choice to localStorage, so this is per device rather
 * than per gym: the desk screen and the manager's laptop want different things
 * and neither should be able to change the other. That is also why it does not
 * go through Firestore like the rest of Sozlamalar.
 */
export function ThemeSection() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // The server cannot know what is in localStorage, so until the client has
  // taken over there is no correct option to mark as selected.
  const hydrated = useHydrated();
  const current = hydrated ? (theme ?? "system") : null;

  return (
    <section className="border-t border-border pt-6">
      <div className="mb-3">
        <h3 className="text-sm font-semibold tracking-tight">Ko&apos;rinish</h3>
        <p className="text-xs text-muted-foreground">
          Faqat shu qurilma uchun saqlanadi
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Ko'rinish"
        className="grid max-w-md grid-cols-3 gap-2"
      >
        {OPTIONS.map(({ value, label, hint, icon: Icon }) => {
          const selected = current === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border p-3 text-left",
                "transition-colors outline-none active:scale-[0.99]",
                selected
                  ? "border-brand bg-brand-muted"
                  : "border-border bg-card hover:bg-muted",
              )}
            >
              <Icon className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{label}</span>
              <span className="text-[0.7rem] text-muted-foreground">
                {/* "Tizim" is the only one whose outcome is not in its name. */}
                {value === "system" && hydrated && current === "system"
                  ? resolvedTheme === "dark"
                    ? "Hozir qorong'i"
                    : "Hozir yorug'"
                  : hint}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
