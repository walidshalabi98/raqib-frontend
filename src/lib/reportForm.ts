import { z } from "zod";
import { DONOR_TYPES, REPORT_TYPES } from "@/lib/constants";
import { isIsoDate } from "@/lib/dates";
import type { DonorType, ReportGenerateInput } from "@/types/api";

/**
 * The Generate Report form (POST /api/projects/:id/reports/generate). The server requires `type` and `title`
 * (400 "type and title are required" otherwise); the period is optional. Error messages are translation keys
 * under `reports.generate.errors`. Pure: schema and payload only.
 */

/** Report.title is free text shown to staff and, once published, to donor viewers. */
export const MAX_REPORT_TITLE = 200;

const optionalDate = z.string().refine((value) => value === "" || isIsoDate(value), "invalidDate");

export const reportFormSchema = z
  .object({
    title: z.string().trim().min(1, "titleRequired").max(MAX_REPORT_TITLE, "titleTooLong"),
    type: z.enum(REPORT_TYPES),
    donorFormat: z.string().refine((value) => (DONOR_TYPES as readonly string[]).includes(value), "donorFormat"),
    periodStart: optionalDate,
    periodEnd: optionalDate,
  })
  .superRefine((values, ctx) => {
    // ISO dates compare as text.
    if (values.periodStart && values.periodEnd && values.periodEnd < values.periodStart) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["periodEnd"], message: "endBeforeStart" });
    }
  });

export type ReportFormValues = z.input<typeof reportFormSchema>;

export function emptyReportForm(): ReportFormValues {
  return { title: "", type: "quarterly_summary", donorFormat: "eu", periodStart: "", periodEnd: "" };
}

/** The request body for valid values: the title trimmed, an empty period left out. */
export function reportFormToPayload(values: ReportFormValues): ReportGenerateInput {
  return {
    type: values.type,
    title: values.title.trim(),
    donorFormat: values.donorFormat as DonorType,
    ...(values.periodStart ? { periodStart: values.periodStart } : {}),
    ...(values.periodEnd ? { periodEnd: values.periodEnd } : {}),
  };
}
