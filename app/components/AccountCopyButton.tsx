"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

export function AccountCopyButton({ value, bank, compact = false }: { value: string; bank: string; compact?: boolean }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button
      className={compact ? "slide-copy" : "copy-button"}
      type="button"
      aria-label={`Copy ${bank} account number`}
      onClick={async (event) => {
        event.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          toast.success("Account number copied.");
          setDone(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setDone(false), 1600);
        } catch {
          toast.error("Couldn't copy. Long-press the number to copy it.");
        }
      }}
    >
      {done ? <Check size={16} /> : <Copy size={16} />}
      {compact ? null : done ? "Copied" : "Copy"}
    </button>
  );
}
