"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Client } from "@/lib/db/types";
import { cn, formatPhone } from "@/lib/utils";
import { useHydrated } from "@/lib/use-hydrated";

/** Matches shown at once. More than this and the list scrolls. */
const MAX_MATCHES = 8;

/**
 * Floor for the dropdown height, in pixels.
 *
 * Near the bottom of the window there may be almost no room below the input.
 * Rather than collapse to a sliver, the list keeps this much and scrolls.
 */
const MIN_LIST_HEIGHT = 180;

/** Either seat an existing member, or register a walk-in under the typed name. */
type Option =
  | { kind: "create"; name: string }
  | { kind: "client"; client: Client; added: boolean };

/**
 * The always-present blank row at the foot of the sheet.
 *
 * Typing a full name and pressing Enter seats a walk-in. That is the common
 * case at the counter, so it is what the bare Enter does: the create option is
 * first in the list and highlighted by default. Existing members are one arrow
 * key away, and when the typed name matches one exactly the create option
 * disappears so nobody ends up with a duplicate of themselves.
 */
export function NewRowInput({
  clients,
  existingIds,
  onSelect,
  onCreate,
  disabled,
}: {
  clients: Client[];
  /** Already on this sheet; shown greyed so nobody is added twice. */
  existingIds: string[];
  onSelect: (client: Client) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const hydrated = useHydrated();

  const already = useMemo(() => new Set(existingIds), [existingIds]);

  const options = useMemo<Option[]>(() => {
    const query = value.trim();
    if (!query) return [];
    const q = query.toLowerCase();

    const matches = clients
      .filter((c) => {
        const name = `${c.firstName} ${c.lastName ?? ""}`.toLowerCase();
        return name.includes(q) || (c.phone ?? "").includes(q);
      })
      .slice(0, MAX_MATCHES);

    const exact = matches.some(
      (c) => `${c.firstName} ${c.lastName ?? ""}`.trim().toLowerCase() === q,
    );

    const clientOptions: Option[] = matches.map((client) => ({
      kind: "client",
      client,
      added: already.has(client.id),
    }));

    // Create leads unless the name is already taken exactly.
    return exact
      ? clientOptions
      : [{ kind: "create", name: query }, ...clientOptions];
  }, [clients, value, already]);

  /**
   * The list is portalled out of the table, so it needs the input's position
   * in viewport coordinates. Measured from events rather than an effect: a
   * layout read in an effect body is a setState that cascades a second render
   * on every keystroke.
   */
  const measure = () =>
    setAnchor(inputRef.current?.getBoundingClientRect() ?? null);

  // The listeners only keep an already-open list glued to its input.
  useEffect(() => {
    if (!anchor) return;
    const onMove = () =>
      setAnchor(inputRef.current?.getBoundingClientRect() ?? null);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [anchor]);

  // Keep the arrow-key selection on screen now that the list can scroll.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-highlighted="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  async function commit(option: Option | undefined) {
    if (!option || busy) return;
    if (option.kind === "client" && option.added) return;

    setBusy(true);
    try {
      if (option.kind === "create") await onCreate(option.name);
      else await onSelect(option.client);
      setValue("");
      setAnchor(null);
      setHighlight(0);
      // Straight on to the next person in the queue.
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void commit(options[highlight]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setValue("");
      setAnchor(null);
    }
    e.stopPropagation();
  }

  const list =
    anchor && hydrated && options.length > 0
      ? createPortal(
          <ul
            ref={listRef}
            role="listbox"
            // Portalled to the body so the table's horizontal scroll container
            // cannot clip it. Opens downward, never taller than the space left
            // on screen, so a long list scrolls instead of running off.
            style={{
              position: "fixed",
              left: anchor.left,
              top: anchor.bottom + 4,
              width: Math.max(anchor.width, 288),
              maxHeight: Math.max(
                MIN_LIST_HEIGHT,
                window.innerHeight - anchor.bottom - 16,
              ),
            }}
            className="z-50 overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
          >
            {options.map((option, i) => {
              const selected = i === highlight;

              if (option.kind === "create") {
                return (
                  <li
                    key="create"
                    className={cn(
                      options.length > 1 && "border-b border-grid-line",
                    )}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      data-highlighted={selected}
                      onMouseEnter={() => setHighlight(i)}
                      onMouseDown={(e) => {
                        // mousedown, not click: blur would close the list first.
                        e.preventDefault();
                        void commit(option);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs",
                        selected && "bg-muted",
                      )}
                    >
                      <span className="truncate">
                        <span className="font-medium">{option.name}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          - kunlik mijoz
                        </span>
                      </span>
                      <span className="nums ml-auto shrink-0 text-[0.65rem] text-muted-foreground">
                        Enter
                      </span>
                    </button>
                  </li>
                );
              }

              const { client, added } = option;
              return (
                <li key={client.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-highlighted={selected}
                    disabled={added}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      void commit(option);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left",
                      selected && !added && "bg-muted",
                      added && "cursor-not-allowed opacity-45",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium">
                        {client.firstName} {client.lastName ?? ""}
                      </span>
                      <span className="nums block truncate text-[0.7rem] text-muted-foreground">
                        {formatPhone(client.phone)}
                      </span>
                    </span>
                    {added ? (
                      <span className="shrink-0 text-[0.7rem] text-muted-foreground">
                        qo&apos;shilgan
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return (
    <>
      <input
        ref={inputRef}
        value={value}
        disabled={disabled || busy}
        onChange={(e) => {
          setValue(e.target.value);
          setHighlight(0);
          if (e.target.value.trim()) measure();
          else setAnchor(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setValue("");
          setAnchor(null);
        }}
        placeholder="Ism yozing va Enter bosing"
        aria-label="Yangi satr: mijoz ismi"
        className={cn(
          "h-row w-full border-0 bg-transparent px-2 text-xs",
          "placeholder:text-muted-foreground/60",
          "outline-none focus:bg-grid-cell-focus",
          "disabled:opacity-50",
        )}
      />
      {list}
    </>
  );
}
