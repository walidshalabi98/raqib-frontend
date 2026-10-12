import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A field's error message. Always rendered (visually hidden when empty) and
 * polite-live, so screen readers announce the message when it appears; the
 * input points at it with aria-describedby.
 */
export function FieldMessage({ id, message }: { id: string; message?: string }) {
  return (
    <p id={id} aria-live="polite" className={cn("flex items-start gap-1.5 text-xs font-medium text-destructive", !message && "sr-only")}>
      {message && <AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      {message}
    </p>
  );
}
