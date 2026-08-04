"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckIcon, CopyIcon, PrinterIcon } from "@phosphor-icons/react";

import type { Settings } from "@/lib/db/types";
import type { Receipt } from "@/lib/domain/receipt";
import { formatSom } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Characters across the roll.
 *
 * 32 is the classic narrow till receipt. It prints comfortably inside 80mm
 * with margin to spare, and more importantly it *reads* like a receipt: a tall
 * narrow strip rather than a wide block of text.
 */
const WIDTH = 32;

/** Label left, value right-aligned, padded between. */
function line(label: string, value: string): string {
  const room = WIDTH - value.length;
  const text = label.length > room - 1 ? `${label.slice(0, room - 2)}.` : label;
  return text.padEnd(room, " ") + value;
}

const rule = (char = "-") => char.repeat(WIDTH);

const centre = (text: string) =>
  text.length >= WIDTH
    ? text
    : " ".repeat(Math.floor((WIDTH - text.length) / 2)) + text;

/** Renders the receipt as the exact text that goes on the roll. */
function render(receipt: Receipt, settings: Settings): string {
  const out: string[] = [];

  out.push(centre((settings.gymName || "GymOS").toUpperCase()));
  if (settings.phone) out.push(centre(settings.phone));
  if (settings.address) out.push(centre(settings.address));
  out.push(rule("="));

  out.push(
    line(
      receipt.code !== null ? `${receipt.title} #${receipt.code}` : receipt.title,
      receipt.dateLabel,
    ),
  );
  out.push(`Mijoz: ${receipt.clientName}`);
  for (const m of receipt.meta) out.push(`${m.label}: ${m.value}`);
  out.push(rule());

  if (receipt.lines.length === 0) {
    out.push(centre("xarid yo'q"));
  } else {
    for (const l of receipt.lines) {
      out.push(line(l.label, l.amount === null ? (l.note ?? "") : formatSom(l.amount)));
    }
  }

  out.push(rule());

  // Only worth printing the subtotal when something was taken off it.
  if (receipt.discount > 0) {
    out.push(line("Jami", formatSom(receipt.subtotal)));
    out.push(line("Chegirma", `-${formatSom(receipt.discount)}`));
  }
  out.push(line("TO'LANADI", formatSom(receipt.total)));

  if (receipt.paid !== null) out.push(line("To'langan", formatSom(receipt.paid)));
  if (receipt.debt !== null && receipt.debt > 0) {
    out.push(line("QARZ", formatSom(receipt.debt)));
  }

  out.push(rule("="));
  out.push(centre(settings.receiptFooter || "Xaridingiz uchun rahmat!"));

  return out.join("\n");
}

/**
 * The one receipt surface in the app.
 *
 * Laid out as a real till receipt rather than a styled web card: monospace,
 * fixed character width, rules made of dashes. That is not decoration. It is
 * what makes the same markup come out of an 80mm thermal printer looking like
 * every other receipt the gym hands over.
 */
export function ReceiptDialog({
  open,
  onOpenChange,
  receipt,
  settings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: Receipt | null;
  settings: Settings;
}) {
  const [copied, setCopied] = useState(false);
  if (!receipt) return null;

  const text = render(receipt, settings);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Nusxalandi");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Nusxalab bo'lmadi");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader className="print:hidden">
          <DialogTitle>Chek</DialogTitle>
        </DialogHeader>

        {/* Reads as a strip of till paper: no border, no rounding, just white
            with a soft drop shadow. data-receipt is what the print stylesheet
            keeps; everything else on the page is hidden. */}
        <div className="flex justify-center py-1 print:block print:py-0">
          <pre
            data-receipt
            className="w-fit bg-white px-3 py-4 font-mono text-[10.5px] leading-[1.5] whitespace-pre text-black shadow-[0_1px_10px_rgba(0,0,0,0.14)] print:shadow-none"
          >
            {text}
          </pre>
        </div>

        <DialogFooter className="print:hidden">
          <Button variant="outline" onClick={copy}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            Nusxalash
          </Button>
          <Button onClick={() => window.print()}>
            <PrinterIcon />
            Chop etish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
