"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CellPosition = { row: number; col: number };

const key = (row: number, col: number) => `${row}:${col}`;

/**
 * Spreadsheet cell navigation over a fixed grid.
 *
 * Roving tabindex: exactly one cell is in the tab order at a time, so Tab
 * moves between the grid and the rest of the page while the arrow keys move
 * inside it. That is the pattern people already have in their fingers from
 * Excel, and it is what the ARIA grid pattern expects.
 *
 * The hook owns focus only. What a cell does when it starts editing is the
 * cell's business.
 */
export function useCellNavigation({
  rowCount,
  colCount,
  onActivate,
}: {
  rowCount: number;
  colCount: number;
  /** Fired on Enter or a printable key, to begin editing the focused cell. */
  onActivate?: (pos: CellPosition, initialChar?: string) => void;
}) {
  const [focused, setFocused] = useState<CellPosition>({ row: 0, col: 0 });
  const cells = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<CellPosition | null>(null);

  const register = useCallback(
    (row: number, col: number) => (el: HTMLElement | null) => {
      const k = key(row, col);
      if (el) cells.current.set(k, el);
      else cells.current.delete(k);
    },
    [],
  );

  // Focus is moved in an effect rather than inside the key handler so the cell
  // exists in the DOM by the time we reach for it, which matters when moving
  // into a row that was just rendered.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    cells.current.get(key(target.row, target.col))?.focus();
  });

  const moveTo = useCallback(
    (row: number, col: number) => {
      const clamped = {
        row: Math.max(0, Math.min(rowCount - 1, row)),
        col: Math.max(0, Math.min(colCount - 1, col)),
      };
      setFocused(clamped);
      pendingFocus.current = clamped;
    },
    [rowCount, colCount],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, pos: CellPosition) => {
      const { row, col } = pos;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          moveTo(row - 1, col);
          return;
        case "ArrowDown":
          e.preventDefault();
          moveTo(row + 1, col);
          return;
        case "ArrowLeft":
          e.preventDefault();
          moveTo(row, col - 1);
          return;
        case "ArrowRight":
          e.preventDefault();
          moveTo(row, col + 1);
          return;
        case "Home":
          e.preventDefault();
          moveTo(e.ctrlKey ? 0 : row, 0);
          return;
        case "End":
          e.preventDefault();
          moveTo(e.ctrlKey ? rowCount - 1 : row, colCount - 1);
          return;
        case "PageDown":
          e.preventDefault();
          moveTo(row + 10, col);
          return;
        case "PageUp":
          e.preventDefault();
          moveTo(row - 10, col);
          return;
        case "Tab": {
          // Wraps to the next row's first cell, like a spreadsheet, but only
          // inside the grid. Shift+Tab at the very start falls out of the grid.
          const last = col === colCount - 1 && row === rowCount - 1;
          const first = col === 0 && row === 0;
          if (e.shiftKey ? first : last) return;
          e.preventDefault();
          if (e.shiftKey) {
            if (col === 0) moveTo(row - 1, colCount - 1);
            else moveTo(row, col - 1);
          } else if (col === colCount - 1) {
            moveTo(row + 1, 0);
          } else {
            moveTo(row, col + 1);
          }
          return;
        }
        case "Enter":
          e.preventDefault();
          onActivate?.(pos);
          return;
        default:
          // Typing a digit starts editing with that digit already entered,
          // so the desk can just type over a cell without pressing Enter.
          if (
            e.key.length === 1 &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey &&
            /[\d]/.test(e.key)
          ) {
            e.preventDefault();
            onActivate?.(pos, e.key);
          }
      }
    },
    [moveTo, onActivate, rowCount, colCount],
  );

  const isFocused = useCallback(
    (row: number, col: number) => focused.row === row && focused.col === col,
    [focused],
  );

  return { focused, setFocused, moveTo, register, handleKeyDown, isFocused };
}
