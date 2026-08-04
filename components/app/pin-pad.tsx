"use client";

import { useCallback, useEffect, useState } from "react";
import { BackspaceIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { PIN_LENGTH } from "@/lib/auth/pin";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function PinPad({
  onSubmit,
  disabled = false,
  error,
  onErrorClear,
}: {
  /** Resolves false to reject the PIN and trigger the shake. */
  onSubmit: (pin: string) => Promise<boolean>;
  disabled?: boolean;
  error?: string | null;
  onErrorClear?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  const locked = disabled || busy;

  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      try {
        const ok = await onSubmit(value);
        if (!ok) setShake(true);
      } catch {
        // A rejected lookup must not leave a full PIN sitting in the pad: the
        // length guard in push() would then swallow every further keypress and
        // the pad would look frozen. The caller reports the reason.
        setShake(true);
      } finally {
        // Always clear and always release, whatever happened. The only path
        // that keeps the digits is a successful unlock, which navigates away.
        setPin("");
        setBusy(false);
      }
    },
    [onSubmit],
  );

  const push = useCallback(
    (digit: string) => {
      if (locked) return;
      onErrorClear?.();
      setShake(false);
      setPin((prev) => {
        if (prev.length >= PIN_LENGTH) return prev;
        const next = prev + digit;
        // Auto-submit on the last digit: nobody wants to press Enter after a PIN.
        if (next.length === PIN_LENGTH) void submit(next);
        return next;
      });
    },
    [locked, onErrorClear, submit],
  );

  const back = useCallback(() => {
    if (locked) return;
    onErrorClear?.();
    setShake(false);
    setPin((prev) => prev.slice(0, -1));
  }, [locked, onErrorClear]);

  // Hardware keyboard. The desk has one and it is faster than tapping.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        push(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        back();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setPin("");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [push, back]);

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Filled dots, announced as a group so a screen reader gets progress. */}
      <div
        className={cn("flex gap-3", shake && "animate-[shake_0.4s_ease-in-out]")}
        onAnimationEnd={() => setShake(false)}
        role="status"
        aria-live="polite"
        aria-label={`${pin.length} / ${PIN_LENGTH} raqam kiritildi`}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              "size-3 rounded-full border transition-colors duration-150",
              error
                ? "border-destructive"
                : i < pin.length
                  ? "border-brand bg-brand"
                  : "border-border",
            )}
          />
        ))}
      </div>

      <div className="min-h-5">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <div className="grid w-full max-w-[15rem] grid-cols-3 gap-2.5">
        {KEYS.map((key) => (
          <PinKey key={key} onClick={() => push(key)} disabled={locked}>
            {key}
          </PinKey>
        ))}
        {/* Bottom row keeps 0 centred, with clear on the left and back on the right. */}
        <PinKey
          onClick={() => setPin("")}
          disabled={locked || pin.length === 0}
          label="Tozalash"
          muted
        >
          <span className="text-sm font-medium">C</span>
        </PinKey>
        <PinKey onClick={() => push("0")} disabled={locked}>
          0
        </PinKey>
        <PinKey
          onClick={back}
          disabled={locked || pin.length === 0}
          label="O'chirish"
          muted
        >
          <BackspaceIcon className="size-5" />
        </PinKey>
      </div>
    </div>
  );
}

function PinKey({
  children,
  onClick,
  disabled,
  label,
  muted = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex h-14 items-center justify-center rounded-lg border border-border",
        "text-lg font-medium tabular-nums select-none",
        "transition-[background-color,transform] duration-75 outline-none",
        "hover:bg-muted active:scale-[0.97] active:bg-accent",
        "disabled:pointer-events-none disabled:opacity-40",
        muted ? "text-muted-foreground" : "text-foreground",
      )}
    >
      {children}
    </button>
  );
}
