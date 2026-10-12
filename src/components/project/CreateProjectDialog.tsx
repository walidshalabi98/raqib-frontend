import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DirectionProvider } from "@radix-ui/react-direction";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertCircle, Info, Loader2, Plus } from "lucide-react";
import { api } from "@/services/api";
import type { Project } from "@/types/api";
import { dirFor, type AppLanguage } from "@/i18n";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { DONOR_TYPES, SECTORS } from "@/lib/constants";
import {
  emptyProjectForm,
  projectFormToPayload,
  toggleSector,
  validateProjectForm,
  withPrimarySector,
  type ProjectFormValues,
} from "@/lib/projectForm";
import type { FormError } from "@/lib/indicatorForm";
import { queryKeys } from "@/lib/queryKeys";
import { cn, errorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LanguageToggle } from "@/components/common/LanguageToggle";
import { NativeSelect } from "@/components/common/NativeSelect";
import { FieldMessage } from "@/components/common/FieldMessage";

/**
 * "New project" dialog: primary and additional sectors, donor type (USAID is
 * legacy) and the humanitarian flag, in the user's language.
 */
export function CreateProjectDialog({ onCreated }: { onCreated?: (project: Project) => void }) {
  const userLang = useUserLanguage();
  const [chosenLang, setChosenLang] = useState<AppLanguage | null>(null);
  const lang = chosenLang ?? userLang;
  const dir = dirFor(lang);
  const { t } = useTranslation(undefined, { lng: lang });
  const queryClient = useQueryClient();
  const baseId = useId();
  const fid = (name: string) => `${baseId}-${name}`;

  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ProjectFormValues>(emptyProjectForm);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const errors = validateProjectForm(values);
  const errorText = (e?: FormError) => (e ? t(`projectForm.errors.${e.key}`, e.values) : undefined);
  const visible = (name: string) => (submitted ? errorText(errors[name]) : undefined);
  const set = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setServerError(null);
  };

  const mutation = useMutation({
    mutationFn: () => api.createProject(projectFormToPayload(values)),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgOverview });
      toast.success(t("projectForm.toast.created"));
      setOpen(false);
      setValues(emptyProjectForm());
      setSubmitted(false);
      onCreated?.(project);
    },
    onError: (err) => {
      setServerError(errorMessage(err, t("projectForm.toast.failed")));
      toast.error(t("projectForm.toast.failed"));
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const first = Object.keys(errors)[0];
    if (first) {
      document.getElementById(fid(first))?.focus();
      return;
    }
    mutation.mutate();
  };

  const field = (name: keyof ProjectFormValues, label: string, input: ReactNode, opts: { required?: boolean; className?: string } = {}) => (
    <div className={cn("space-y-1.5", opts.className)}>
      <Label htmlFor={fid(name)}>
        {label}
        {opts.required && <span aria-hidden="true" className="ms-0.5 text-destructive">*</span>}
      </Label>
      {input}
      <FieldMessage id={`${fid(name)}-error`} message={visible(name)} />
    </div>
  );
  const a11y = (name: keyof ProjectFormValues, required = false) => ({
    id: fid(name),
    "aria-describedby": `${fid(name)}-error`,
    "aria-invalid": visible(name) ? true : undefined,
    ...(required ? { "aria-required": true } : {}),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* The trigger sits on screens that are not translated yet, so it carries its own lang. */}
      <DialogTrigger asChild>
        <Button lang={lang}><Plus aria-hidden="true" className="me-1.5 h-4 w-4" /> {t("projectForm.trigger")}</Button>
      </DialogTrigger>
      <DialogContent dir={dir} lang={lang} closeLabel={t("common.close")} className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DirectionProvider dir={dir}>
          <DialogHeader className="text-start">
            <div className="flex flex-wrap items-center justify-between gap-3 pe-8">
              <DialogTitle>{t("projectForm.title")}</DialogTitle>
              <LanguageToggle value={lang} onChange={setChosenLang} />
            </div>
            <DialogDescription>{t("projectForm.description")}</DialogDescription>
          </DialogHeader>

          <form noValidate onSubmit={handleSubmit} className="space-y-4 pt-2">
            {(serverError || (submitted && Object.keys(errors).length > 0)) && (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">{serverError ? t("projectForm.toast.failed") : t("projectForm.errors.summary")}</p>
                  {serverError && <p className="text-muted-foreground" dir="auto">{serverError}</p>}
                </div>
              </div>
            )}

            {field("name", t("projectForm.name"), (
              <Input {...a11y("name", true)} dir="auto" placeholder={t("projectForm.placeholders.name")}
                value={values.name} onChange={(e) => set("name", e.target.value)} />
            ), { required: true })}
            {field("description", t("projectForm.projectDescription"), (
              <Input {...a11y("description")} dir="auto" placeholder={t("projectForm.placeholders.description")}
                value={values.description} onChange={(e) => set("description", e.target.value)} />
            ))}

            <div className="grid gap-3 sm:grid-cols-2">
              {field("sector", t("projectForm.sector"), (
                <NativeSelect {...a11y("sector", true)} value={values.sector}
                  onChange={(e) => setValues((prev) => withPrimarySector(prev, e.target.value as ProjectFormValues["sector"]))}>
                  {SECTORS.map((s) => <option key={s} value={s}>{t(`sector.${s}`)}</option>)}
                </NativeSelect>
              ), { required: true })}
              {field("donorType", t("projectForm.donorType"), (
                <NativeSelect {...a11y("donorType", true)} value={values.donorType}
                  onChange={(e) => set("donorType", e.target.value as ProjectFormValues["donorType"])}>
                  {DONOR_TYPES.map((d) => <option key={d} value={d}>{t(`donorType.${d}`)}</option>)}
                </NativeSelect>
              ), { required: true })}
            </div>

            <fieldset className="space-y-2" aria-describedby={`${fid("sectors")}-hint`}>
              <legend className="text-sm font-medium">{t("projectForm.additionalSectors")}</legend>
              <p id={`${fid("sectors")}-hint`} className="text-xs text-muted-foreground">{t("projectForm.additionalSectorsHint")}</p>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {SECTORS.map((s) => {
                  const primary = s === values.sector;
                  const id = fid(`sector-${s}`);
                  return (
                    <div key={s} className="flex min-h-9 items-center gap-2">
                      <Checkbox id={id} checked={primary || values.additionalSectors.includes(s)} disabled={primary}
                        onCheckedChange={(checked) => setValues((prev) => toggleSector(prev, s, checked === true))} />
                      <Label htmlFor={id} className="text-sm font-normal leading-snug">
                        {t(`sector.${s}`)}
                        {primary && <span className="ms-1.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium">{t("projectForm.primaryTag")}</span>}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </fieldset>

            {field("donor", t("projectForm.donor"), (
              <Input {...a11y("donor", true)} dir="auto" placeholder={t("projectForm.placeholders.donor")}
                value={values.donor} onChange={(e) => set("donor", e.target.value)} />
            ), { required: true })}

            <div className="flex items-start gap-3 rounded-md border p-3">
              <Switch id={fid("humanitarian")} checked={values.humanitarian} aria-describedby={`${fid("humanitarian")}-hint`}
                onCheckedChange={(checked) => set("humanitarian", checked)} className="mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <Label htmlFor={fid("humanitarian")}>{t("projectForm.humanitarian")}</Label>
                <p id={`${fid("humanitarian")}-hint`} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {t("projectForm.humanitarianHint")}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {field("budgetUsd", t("projectForm.budget"), (
                <Input {...a11y("budgetUsd")} dir="ltr" inputMode="decimal" placeholder={t("projectForm.placeholders.budget")}
                  value={values.budgetUsd} onChange={(e) => set("budgetUsd", e.target.value)} />
              ))}
              {field("targetBeneficiaries", t("projectForm.beneficiaries"), (
                <Input {...a11y("targetBeneficiaries")} dir="ltr" inputMode="numeric" placeholder={t("projectForm.placeholders.beneficiaries")}
                  value={values.targetBeneficiaries} onChange={(e) => set("targetBeneficiaries", e.target.value)} />
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {field("startDate", t("projectForm.startDate"), (
                <Input {...a11y("startDate", true)} type="date" dir="ltr" value={values.startDate} onChange={(e) => set("startDate", e.target.value)} />
              ), { required: true })}
              {field("endDate", t("projectForm.endDate"), (
                <Input {...a11y("endDate", true)} type="date" dir="ltr" value={values.endDate} onChange={(e) => set("endDate", e.target.value)} />
              ), { required: true })}
            </div>
            {field("geographicScope", t("projectForm.geographicScope"), (
              <Input {...a11y("geographicScope")} dir="auto" placeholder={t("projectForm.placeholders.geographicScope")}
                value={values.geographicScope} onChange={(e) => set("geographicScope", e.target.value)} />
            ))}

            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending
                ? <><Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" /> {t("projectForm.creating")}</>
                : t("projectForm.submit")}
            </Button>
          </form>
        </DirectionProvider>
      </DialogContent>
    </Dialog>
  );
}
