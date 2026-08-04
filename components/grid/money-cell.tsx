"use client";

import { useEffect, useRef, useState } from "react";

import { cn, formatCell } from "@/lib/utils";

/**
 * One editable money cell.
 *
 * Reads as plain text until it is being edited, so a full sheet is a wall of
 * numbers rather than a wall of input boxes. Commit moves focus onward the way
 * a spreadsheet does; Escape restores the previous value.
 */
export function MoneyCell({
  value,
  editing,
  initialChar,
  onStartEdit,
  onCommit,
  onCancel,
  onKeyDown,
  onFocus,
  onTogglePaid,
  paid = false,
  cellRef,
  tabIndex,
  focused,
  label,
  className,
}: {
  value: number;
  editing: boolean;
  initialChar?: string;
  onStartEdit: () => void;
  onCommit: (next: number) => void;
  onCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  /** Tells the grid this cell is now the focused one, however it got there. */
  onFocus: () => void;
  /** Set when this cell tracks whether its amount has been collected. */
  onTogglePaid?: () => void;
  paid?: boolean;
  cellRef: (el: HTMLElement | null) => void;
  tabIndex: number;
  focused: boolean;
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Seed the draft during render when the cell flips into edit mode. Typing a
  // digit on a focused cell opens the editor with that digit already in it,
  // matching Excel; entering via Enter or click starts from the current value.
  const [wasEditing, setWasEditing] = useState(editing);
  if (editing !== wasEditing) {
    setWasEditing(editing);
    if (editing) setDraft(initialChar ?? (value > 0 ? String(value) : ""));
  }

  // Focus is a DOM side effect, so it stays in an effect.
  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (!input) return;

    input.focus();

    if (initialChar) {
      // The editor opened because a digit was typed, and that digit is already
      // in the field. Selecting it would mean the next keystroke replaced it
      // instead of continuing the number, so the caret goes to the end.
      const end = input.value.length;
      input.setSelectionRange(end, end);
    } else {
      // Opened via Enter or a double click: select so typing replaces the
      // existing amount outright, which is what a spreadsheet does.
      input.select();
    }
  }, [editing, initialChar]);

  function commit() {
    const parsed = Number(draft.replace(/\s/g, ""));
    onCommit(Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0);
  }

  if (editing) {
    return (
      <td className={cn("relative p-0", className)}>
        <input
          ref={inputRef}
          value={draft}
          inputMode="numeric"
          aria-label={label}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d\s]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              commit();
              onKeyDown(e);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
            // Arrows are left alone so the caret can move inside the number.
            e.stopPropagation();
          }}
          className={cn(
            "nums h-row w-full border-0 bg-grid-cell-focus px-2 text-right text-xs",
            "outline-2 -outline-offset-2 outline-brand",
          )}
        />
      </td>
    );
  }

  return (
    <td
      ref={cellRef as (el: HTMLTableCellElement | null) => void}
      role="gridcell"
      tabIndex={tabIndex}
      aria-label={`${label}: ${value > 0 ? value : "bo'sh"}`}
      onKeyDown={onKeyDown}
      onDoubleClick={onStartEdit}
      // Fires however focus arrived: click, Tab, or an arrow key. Without this
      // a click moved the browser's focus but left the grid still believing
      // the old cell was current, so nothing looked selected until you typed.
      onFocus={onFocus}
      onClick={(e) => {
        // Single click selects, double click edits. Focus first so a click
        // followed by typing behaves the same as arrowing in and typing.
        (e.currentTarget as HTMLElement).focus();
        // A click on an amount also flips whether it has been collected. The
        // gym charges on the way out, so the sheet has to say who has settled.
        if (onTogglePaid && value > 0) onTogglePaid();
      }}
      title={onTogglePaid && value > 0 ? "Bosing: to'landi / to'lanmadi" : undefined}
      className={cn(
        "nums h-row cursor-cell px-2 text-right text-xs tabular-nums",
        "border-r border-grid-line outline-none",
        // Paid keeps the fill; focus is carried by the outline, so a cell can
        // be both the selected one and visibly settled.
        paid && value > 0
          ? "bg-paid font-medium text-paid-foreground"
          : focused && "bg-grid-cell-focus",
        focused && "outline-2 -outline-offset-2 outline-brand",
        value === 0 && "text-muted-foreground/50",
        className,
      )}
    >
      {formatCell(value)}
    </td>
  );
}
