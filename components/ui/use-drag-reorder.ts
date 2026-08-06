"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/** How long a finger has to stay put before the press counts as a grab. */
const HOLD_MS = 300;

/** How far it can drift in that time and still count as a scroll instead. */
const SLOP_PX = 8;

/**
 * Drag a list into a new order, with a mouse or a finger.
 *
 * Built on pointer events rather than HTML5 drag-and-drop, which does not fire
 * on touch at all, and rather than a library, because the whole behaviour is
 * the thirty lines below.
 *
 * A mouse grabs immediately: press and move is unambiguous, and anything
 * slower feels broken. A finger cannot, because the same gesture also has to
 * scroll the list, so touch grabs only after the press has been held still.
 * That is the split every mobile list-reordering UI makes.
 *
 * The hook owns the gesture, not the data: it reports where the row was
 * dropped and leaves the reordering and saving to the caller.
 */
export function useDragReorder(onDrop: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const rows = useRef<DOMRect[]>([]);
  const hold = useRef<{ timer: number; y: number } | null>(null);

  function begin(index: number) {
    const el = listRef.current;
    if (!el) return;
    // Measured once, at the moment of the grab. The rows are reordered on
    // screen as the pointer moves, so re-reading their positions mid-drag
    // would hit-test against geometry that is already responding to the drag.
    rows.current = Array.from(el.children).map((c) => c.getBoundingClientRect());
    setDrag({ from: index, to: index });
  }

  function cancelHold() {
    if (!hold.current) return;
    clearTimeout(hold.current.timer);
    hold.current = null;
  }

  const handlers = (index: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // Every row carries Edit and Delete. Starting a drag from one of those
      // would mean no button on this list could be clicked.
      if ((e.target as HTMLElement).closest("button")) return;

      e.currentTarget.setPointerCapture(e.pointerId);

      if (e.pointerType === "mouse") {
        begin(index);
      } else {
        hold.current = {
          y: e.clientY,
          timer: window.setTimeout(() => begin(index), HOLD_MS),
        };
      }
    },

    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (!drag) {
        // Moved before the hold finished, so the finger was scrolling.
        if (hold.current && Math.abs(e.clientY - hold.current.y) > SLOP_PX) {
          cancelHold();
        }
        return;
      }

      e.preventDefault();
      const found = rows.current.findIndex((r) => e.clientY < r.bottom);
      const to = found < 0 ? rows.current.length - 1 : found;
      if (to !== drag.to) setDrag({ from: drag.from, to });
    },

    onPointerUp: () => {
      cancelHold();
      if (!drag) return;
      setDrag(null);
      if (drag.from !== drag.to) onDrop(drag.from, drag.to);
    },

    onPointerCancel: () => {
      cancelHold();
      setDrag(null);
    },
  });

  return { drag, listRef, handlers };
}
