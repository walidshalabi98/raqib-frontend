import { useId, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DirectionProvider } from "@radix-ui/react-direction";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { api } from "@/services/api";
import { dirFor } from "@/i18n";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { DONOR_TYPES, REPORT_TYPES } from "@/lib/constants";
import { queryKeys } from "@/lib/queryKeys";
import { isolate } from "@/lib/reports";
import { isProjectArchived } from "@/lib/apiError";
import { emptyReportForm, MAX_REPORT_TITLE, reportFormSchema, reportFormToPayload, type ReportFormValues } from "@/lib/reportForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/common/NativeSelect";
import { FieldMessage } from "@/components/common/FieldMessage";

/**
 * "Generate report" (org staff): title, type, donor format and an optional period. The server requires a type
 * and a title; the AI narrative is written in the background and the report appears in the list as a draft.
 */
export function GenerateReportDialog({ projectId }: { projectId: string }) {
  const lang = useUserLanguage();
  const dir = dirFor(lang);
  const { t } = useTranslation(undefined, { lng: lang });
  const queryClient = useQueryClient();
  const baseId = useId();
  const fid = (name: keyof ReportFormValues) => `${baseId}-${name}`;
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitted },
  } = useForm<ReportFormValues>({
    resolver: zodResolver(reportFormSchema),
    defaultValues: emptyReportForm(),
    shouldFocusError: true,
  });

  const mutation = useMutation({
    mutationFn: (values: ReportFormValues) => api.generateReport(projectId, reportFormToPayload(values)),
    onSuccess: (_data, values) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports(projectId) });
      toast.success(t("reports.generate.toastStarted", { title: isolate(values.title.trim()) }));
      setOpen(false);
      reset(emptyReportForm());
    },
    onError: (err) => {
      toast.error(t(isProjectArchived(err) ? "errors.projectArchived" : "reports.generate.toastFailed"));
    },
  });

  const errorText = (name: keyof ReportFormValues) => {
    const key = errors[name]?.message;
    if (!key) return undefined;
    return t(`reports.generate.errors.${key}`, { max: MAX_REPORT_TITLE, defaultValue: t("reports.generate.errors.summary") });
  };
  const a11y = (name: keyof ReportFormValues, required = false) => ({
    id: fid(name),
    "aria-describedby": `${fid(name)}-error`,
    "aria-invalid": errors[name] ? true : undefined,
    ...(required ? { "aria-required": true } : {}),
  });
  const field = (name: keyof ReportFormValues, label: string, input: ReactNode, required = false) => (
    <div className="space-y-1.5">
      <Label htmlFor={fid(name)}>
        {label}
        {required && <span aria-hidden="true" className="ms-0.5 text-destructive">*</span>}
      </Label>
      {input}
      <FieldMessage id={`${fid(name)}-error`} message={errorText(name)} />
    </div>
  );
  const hasErrors = isSubmitted && Object.keys(errors).length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        setOpen(next);
        if (!next) reset(emptyReportForm());
      }}
    >
      <DialogTrigger asChild>
        <Button lang={lang} className="min-h-11">
          <Plus aria-hidden="true" className="me-1.5 h-4 w-4" />
          {t("reports.generate.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent dir={dir} lang={lang} closeLabel={t("common.close")} className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DirectionProvider dir={dir}>
          <DialogHeader className="text-start">
            <DialogTitle className="pe-8">{t("reports.generate.title")}</DialogTitle>
            <DialogDescription>{t("reports.generate.description")}</DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4 pt-2">
            {hasErrors && (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="font-medium">{t("reports.generate.errors.summary")}</p>
              </div>
            )}
            {field(
              "title",
              t("reports.generate.titleLabel"),
              <Input {...a11y("title", true)} dir="auto" autoComplete="off" placeholder={t("reports.generate.titlePlaceholder")} {...register("title")} />,
              true,
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {field(
                "type",
                t("reports.generate.type"),
                <NativeSelect {...a11y("type", true)} {...register("type")}>
                  {REPORT_TYPES.map((type) => (
                    <option key={type} value={type}>{t(`reportType.${type}`)}</option>
                  ))}
                </NativeSelect>,
                true,
              )}
              {field(
                "donorFormat",
                t("reports.generate.donorFormat"),
                <NativeSelect {...a11y("donorFormat", true)} {...register("donorFormat")}>
                  {DONOR_TYPES.map((donor) => (
                    <option key={donor} value={donor}>{t(`donorType.${donor}`)}</option>
                  ))}
                </NativeSelect>,
                true,
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {field("periodStart", t("reports.generate.periodStart"), <Input {...a11y("periodStart")} type="date" dir="ltr" {...register("periodStart")} />)}
              {field("periodEnd", t("reports.generate.periodEnd"), <Input {...a11y("periodEnd")} type="date" dir="ltr" {...register("periodEnd")} />)}
            </div>
            <Button type="submit" className="min-h-11 w-full" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" />
                  {t("reports.generate.submitting")}
                </>
              ) : (
                t("reports.generate.submit")
              )}
            </Button>
          </form>
        </DirectionProvider>
      </DialogContent>
    </Dialog>
  );
}
