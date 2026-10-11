import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultsChainPanel } from "@/components/project/ResultsChainPanel";
import { api } from "@/services/api";
import { renderWithClient } from "@/test/utils";
import { makeResultNode, sampleResultNodes } from "@/test/fixtures";

vi.mock("@/services/api", () => ({
  api: {
    getFrameworkResults: vi.fn(),
    createResultNode: vi.fn(),
    updateResultNode: vi.fn(),
    deleteResultNode: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const optionLabels = (select: HTMLElement) => within(select).getAllByRole("option").map((o) => o.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getFrameworkResults).mockResolvedValue(sampleResultNodes());
});

function renderPanel() {
  return renderWithClient(<ResultsChainPanel projectId="p-1" frameworkId="fw-1" />);
}

describe("ResultsChainPanel", () => {
  it("lists results as an indented tree with level badges and indicator counts", async () => {
    renderPanel();
    expect(await screen.findByText("Reduced food insecurity")).toBeInTheDocument();
    expect(api.getFrameworkResults).toHaveBeenCalledWith("fw-1");
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("span")?.textContent)).toEqual(["Goal", "O1", "O1.1", "O2"]);
    // O1.1 is nested inside O1, inside the goal.
    const goal = items[0];
    expect(within(goal).getByText("Households receive vouchers")).toBeInTheDocument();
    expect(within(items[1]).getByText("2 indicators")).toBeInTheDocument();
    expect(within(items[0]).getAllByText("Impact")[0]).toBeInTheDocument();
    // Activities cannot have children, outputs can.
    expect(screen.getByRole("button", { name: "Add a result under O1.1" })).toBeInTheDocument();
  });

  it("disables delete for a result with children and explains why", async () => {
    renderPanel();
    const del = await screen.findByRole("button", { name: "Delete O1" });
    expect(del).toHaveAttribute("aria-disabled", "true");
    expect(del).toHaveAccessibleDescription("O1 has child results. Delete or move them first.");
    await userEvent.setup({ delay: null }).click(del);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete O2" })).not.toHaveAttribute("aria-disabled");
  });

  it("limits level choices by the hierarchy rule", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();

    // Under an outcome only an output fits.
    await user.click(await screen.findByRole("button", { name: "Add a result under O1" }));
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Parent result")).toHaveValue("o1");
    const level = within(dialog).getByLabelText("Level");
    expect(optionLabels(level)).toEqual(["Output"]);
    expect(level).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    // At the top every level is allowed; choosing the goal as parent leaves only "Outcome".
    await user.click(screen.getByRole("button", { name: "Add result" }));
    dialog = screen.getByRole("dialog");
    const parent = within(dialog).getByLabelText("Parent result");
    expect(parent).toHaveValue("");
    expect(optionLabels(within(dialog).getByLabelText("Level"))).toEqual(["Impact", "Outcome", "Output", "Activity"]);
    // An output (O1.1) can be a parent; the goal, outcomes and outputs are offered.
    expect(optionLabels(parent)).toHaveLength(1 + 4);
    await user.selectOptions(parent, "g");
    expect(optionLabels(within(dialog).getByLabelText("Level"))).toEqual(["Outcome"]);
    expect(within(dialog).getByLabelText("Level")).toHaveValue("outcome");
  });

  it("creates a result under its parent", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.createResultNode).mockResolvedValue(makeResultNode({ id: "o3", code: "O3", level: "outcome", parentId: "g" }));
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Add a result under Goal" }));
    const dialog = screen.getByRole("dialog");

    await user.type(within(dialog).getByLabelText(/^Code/), "o1");
    await user.type(within(dialog).getByLabelText(/^Result statement \(English\)/), "Improved access to water");
    await user.click(within(dialog).getByRole("button", { name: "Save result" }));
    expect(within(dialog).getByText("Another result already uses the code “o1”. Choose a different code.")).toBeInTheDocument();
    expect(api.createResultNode).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText(/^Code/));
    await user.type(within(dialog).getByLabelText(/^Code/), "O3");
    await user.type(within(dialog).getByLabelText("Result statement (Arabic)"), "تحسين الوصول إلى المياه");
    await user.click(within(dialog).getByRole("button", { name: "Save result" }));

    await waitFor(() => expect(api.createResultNode).toHaveBeenCalledWith("fw-1", {
      level: "outcome",
      parentId: "g",
      code: "O3",
      text: "Improved access to water",
      textAr: "تحسين الوصول إلى المياه",
    }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("edits only the changed fields and locks the level of a result with children", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.updateResultNode).mockResolvedValue(sampleResultNodes()[1]);
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Edit O1" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Level")).toBeDisabled();
    expect(within(dialog).getByText("The level cannot change while this result has child results.")).toBeInTheDocument();
    const text = within(dialog).getByLabelText(/^Result statement \(English\)/);
    await user.clear(text);
    await user.type(text, "Improved household food consumption");
    await user.click(within(dialog).getByRole("button", { name: "Save result" }));
    await waitFor(() => expect(api.updateResultNode).toHaveBeenCalledWith("o1", { text: "Improved household food consumption" }));
  });

  it("deletes a leaf result after confirmation", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.deleteResultNode).mockResolvedValue({ message: "Result deleted", unlinkedIndicators: 1 });
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Delete O1.1" }));
    const confirm = screen.getByRole("alertdialog");
    expect(within(confirm).getByText("Delete result O1.1?")).toBeInTheDocument();
    expect(within(confirm).getByText(/Its 1 indicator stays in the framework/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Delete result" }));
    await waitFor(() => expect(api.deleteResultNode).toHaveBeenCalledWith("o11"));
  });

  it("shows an empty state with one action, and Arabic text when switched", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.getFrameworkResults).mockResolvedValue([]);
    const { unmount } = renderPanel();
    expect(await screen.findByText("No results yet. Start with the goal (impact) the project contributes to.")).toBeInTheDocument();
    unmount();

    vi.mocked(api.getFrameworkResults).mockResolvedValue(sampleResultNodes());
    renderPanel();
    await screen.findByText("Reduced food insecurity");
    await user.click(screen.getByRole("button", { name: "العربية" }));
    const section = screen.getByRole("region", { name: "سلسلة النتائج" });
    expect(section).toHaveAttribute("dir", "rtl");
    expect(within(section).getByText("انخفاض انعدام الأمن الغذائي")).toHaveAttribute("lang", "ar");
    // English text stays when there is no Arabic text.
    expect(within(section).getByText("Improved food consumption")).toBeInTheDocument();
    expect(within(section).getAllByText("الأثر")[0]).toBeInTheDocument();
  });

  it("offers a retry when the results cannot be loaded", async () => {
    vi.mocked(api.getFrameworkResults).mockRejectedValue(new Error("boom"));
    renderPanel();
    expect(await screen.findByText("We couldn't load the results chain.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
