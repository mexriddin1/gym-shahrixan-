"use client";

import { useMemo } from "react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

import { addDays, cn, dateKey, formatDateKey } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * The day strip, mirroring the workbook's sheet tabs along the bottom.
 *
 * Shared by every screen that reads one day at a time - the daily sheet, the
 * advance sheet and the day's report - so stepping back a day works the same
 * way on all of them and none can drift from the others.
 *
 * Prints as nothing. On paper the date is already in the page header, and a
 * row of buttons offering days that are not on the page would only mislead.
 */
export function DayTabs({
  date,
  onChange,
}: {
  date: string;
  onChange: (next: string) => void;
}) {
  const today = dateKey();

  /**
   * The last seven days up to today, plus the selected day if it fell outside
   * that window.
   *
   * The window used to end at the *selected* day, which pushed today off the
   * strip the moment you stepped back a date. Anchoring it to today means the
   * way home is always one click, and no tab is ever a day that has not
   * happened yet.
   */
  const days = useMemo(() => {
    const recent = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    return recent.includes(date) ? recent : [date, ...recent];
  }, [date, today]);

  return (
    <div className="flex items-center gap-1 print:hidden">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Oldingi kun"
        onClick={() => onChange(addDays(date, -1))}
      >
        <CaretLeftIcon />
      </Button>

      <div className="flex flex-1 gap-1 overflow-x-auto">
        {days.map((day) => {
          const active = day === date;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onChange(day)}
              aria-current={active ? "date" : undefined}
              className={cn(
                "nums shrink-0 rounded-md px-2.5 py-1 text-xs whitespace-nowrap",
                "transition-colors",
                active
                  ? "bg-brand font-medium text-brand-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {formatDateKey(day).slice(0, 5)}
              {day === today ? (
                <span
                  className={cn(
                    "ml-1",
                    active ? "text-brand-foreground/70" : "text-brand",
                  )}
                >
                  •
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Keyingi kun"
        // Cannot step past today: there is nothing to record on a future day.
        disabled={date >= today}
        onClick={() => onChange(addDays(date, 1))}
      >
        <CaretRightIcon />
      </Button>

      {date !== today ? (
        <Button variant="outline" size="sm" onClick={() => onChange(today)}>
          Bugun
        </Button>
      ) : null}
    </div>
  );
}
