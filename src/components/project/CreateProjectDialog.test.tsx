import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateProjectDialog } from "@/components/project/CreateProjectDialog";
import { api } from "@/services/api";
import { toast } from "sonner";
import { renderWithClient } from "@/test/utils";

vi.mock("@/services/api", () => ({
  api: { createProject: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

beforeEach(() => vi.clearAllMocks());

async function openDialog() {
  const user = userEvent.setup({ delay: null });
  renderWithClient(<CreateProjectDialog />);
  await user.click(screen.getByRole("button", { name: "New project" }));
  return { user, dialog: screen.getByRole("dialog") };
}

describe("CreateProjectDialog", () => {
  it("offers the new sectors and donors, with USAID marked legacy", async () => {
    const { dialog } = await openDialog();
    const donor = within(dialog).getByLabelText(/^Donor type/);
    const donorOptions = within(donor).getAllByRole("option").map((o) => o.textContent);
    expect(donorOptions).toEqual(expect.arrayContaining(["ECHO (EU humanitarian aid)", "WFP", "UNFPA", "FCDO", "UN Women", "USAID (legacy)"]));
    expect(donorOptions[donorOptions.length - 1]).toBe("USAID (legacy)");
    for (const sector of ["MHPSS", "Cash Assistance", "Shelter", "Climate and Energy"]) {
      expect(within(dialog).getByRole("checkbox", { name: sector })).toBeInTheDocument();
    }
    // The primary sector is always included.
    const primary = within(dialog).getByRole("checkbox", { name: /Livelihoods/ });
    expect(primary).toBeChecked();
    expect(primary).toBeDisabled();
    expect(within(dialog).getByText(/Raqib adds accountability-to-affected-people indicators/)).toBeInTheDocument();
  });

  it("sends sectors and the humanitarian flag", async () => {
    vi.mocked(api.createProject).mockResolvedValue({ id: "p-new" } as never);
    const { user, dialog } = await openDialog();

    await user.type(within(dialog).getByLabelText(/^Project name/), "Gaza food voucher programme");
    await user.selectOptions(within(dialog).getByLabelText(/^Primary sector/), "food_security");
    await user.click(within(dialog).getByRole("checkbox", { name: "Cash Assistance" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "MHPSS" }));
    await user.selectOptions(within(dialog).getByLabelText(/^Donor type/), "echo");
    await user.type(within(dialog).getByLabelText(/^Donor name/), "DG ECHO");
    await user.click(within(dialog).getByRole("switch", { name: "Humanitarian project" }));
    await user.type(within(dialog).getByLabelText("Budget (USD)"), "750000");
    fireEvent.change(within(dialog).getByLabelText(/^Start date/), { target: { value: "2026-11-01" } });
    fireEvent.change(within(dialog).getByLabelText(/^End date/), { target: { value: "2027-10-31" } });
    await user.click(within(dialog).getByRole("button", { name: "Create project" }));

    await waitFor(() => expect(api.createProject).toHaveBeenCalledWith({
      name: "Gaza food voucher programme",
      description: undefined,
      sector: "food_security",
      sectors: ["food_security", "cash", "mhpss"],
      humanitarian: true,
      donor: "DG ECHO",
      donorType: "echo",
      budgetUsd: 750000,
      startDate: "2026-11-01",
      endDate: "2027-10-31",
      targetBeneficiaries: undefined,
      geographicScope: undefined,
    }));
    expect(toast.success).toHaveBeenCalledWith("Project created");
  });

  it("explains missing fields instead of sending", async () => {
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Create project" }));
    expect(api.createProject).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Please fix the highlighted fields.");
    expect(within(dialog).getByText("Enter the project name.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Project name/)).toHaveFocus();
  });

  it("can be filled in Arabic", async () => {
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "العربية" }));
    expect(dialog).toHaveAttribute("dir", "rtl");
    expect(within(dialog).getByRole("heading", { name: "إنشاء مشروع جديد" })).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "المأوى" })).toBeInTheDocument();
    const humanitarian = within(dialog).getByRole("switch", { name: "مشروع إنساني" });
    await user.click(humanitarian);
    expect(humanitarian).toHaveAttribute("data-state", "checked");
    // The thumb moves left in right-to-left layouts, so it stays inside the track.
    const thumb = humanitarian.querySelector("span") as HTMLElement;
    expect(thumb).toHaveClass("rtl:data-[state=checked]:-translate-x-5");
    expect(thumb).toHaveAttribute("data-state", "checked");
    // The trigger on the (untranslated) projects page carries the language of its text.
    expect(screen.getByRole("button", { name: "مشروع جديد", hidden: true })).toHaveAttribute("lang", "ar");
  });

  it("accepts Arabic-Indic digits in budget and beneficiaries", async () => {
    vi.mocked(api.createProject).mockResolvedValue({ id: "p-new" } as never);
    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText(/^Project name/), "Water trucking");
    await user.type(within(dialog).getByLabelText(/^Donor name/), "UNICEF");
    await user.type(within(dialog).getByLabelText("Budget (USD)"), "٥٠٠٬٠٠٠");
    await user.type(within(dialog).getByLabelText("Target beneficiaries"), "١٢٠٠");
    fireEvent.change(within(dialog).getByLabelText(/^Start date/), { target: { value: "2026-11-01" } });
    fireEvent.change(within(dialog).getByLabelText(/^End date/), { target: { value: "2027-10-31" } });
    await user.click(within(dialog).getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(api.createProject).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.createProject).mock.calls[0][0]).toMatchObject({ budgetUsd: 500000, targetBeneficiaries: 1200 });
  });
});
