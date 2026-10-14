import { METHOD_LABELS, type Method } from "@/lib/constants";

const methodStyles: Record<Method, string> = {
  hh_survey: "bg-[hsl(var(--method-hh-bg))] text-[hsl(var(--method-hh-text))] border-[hsl(var(--method-hh-border))]",
  fgd: "bg-[hsl(var(--method-fgd-bg))] text-[hsl(var(--method-fgd-text))] border-[hsl(var(--method-fgd-border))]",
  kii: "bg-[hsl(var(--method-kii-bg))] text-[hsl(var(--method-kii-text))] border-[hsl(var(--method-kii-border))]",
  observation: "bg-[hsl(var(--method-obs-bg))] text-[hsl(var(--method-obs-text))] border-[hsl(var(--method-obs-border))]",
  document_review: "bg-[hsl(var(--method-doc-bg))] text-[hsl(var(--method-doc-text))] border-[hsl(var(--method-doc-border))]",
  participatory: "bg-[hsl(var(--method-part-bg))] text-[hsl(var(--method-part-text))] border-[hsl(var(--method-part-border))]",
  secondary_data: "bg-secondary text-secondary-foreground border-border",
};

/** `label`: a translated method name (e.g. t(`method.${method}`)); without it the English short label is shown. */
export function MethodPill({ method, size = "sm", label }: { method: Method; size?: "sm" | "xs"; label?: string }) {
  return (
    <span className={`inline-flex items-center border rounded-md font-medium ${methodStyles[method] ?? methodStyles.secondary_data} ${size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"}`}>
      {label ?? METHOD_LABELS[method] ?? method}
    </span>
  );
}
