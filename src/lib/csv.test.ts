import { afterEach, describe, expect, it, vi } from "vitest";
import { csvField, downloadCSV, downloadJSON, neutraliseFormula, safeFileName, toCsv } from "@/lib/csv";

/** jsdom's Blob has no text()/arrayBuffer(); FileReader works. */
function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("CSV fields", () => {
  it("quotes fields with commas, quotes, CR or LF and doubles inner quotes", () => {
    expect(csvField("Hebron")).toBe("Hebron");
    expect(csvField("Hebron, Dura")).toBe('"Hebron, Dura"');
    expect(csvField('He said "yes"')).toBe('"He said ""yes"""');
    expect(csvField("line 1\nline 2")).toBe('"line 1\nline 2"');
    expect(csvField("line 1\rline 2")).toBe('"line 1\rline 2"');
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
    expect(csvField(12)).toBe("12");
    expect(csvField(false)).toBe("false");
  });

  it("neutralises text that a spreadsheet would run as a formula", () => {
    expect(neutraliseFormula("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvField("+1+2")).toBe("'+1+2");
    expect(csvField("-2+3")).toBe("'-2+3");
    expect(csvField("@cmd")).toBe("'@cmd");
    expect(csvField("\tTab")).toBe("'\tTab");
    expect(csvField("\r=1")).toBe("\"'\r=1\"");
    // A formula with a comma is neutralised and then quoted.
    expect(csvField('=HYPERLINK("http://x.example","a")')).toBe('"\'=HYPERLINK(""http://x.example"",""a"")"');
  });

  it("leaves plain numbers and ordinary text alone", () => {
    expect(csvField("-5")).toBe("-5");
    expect(csvField("+3.2")).toBe("+3.2");
    expect(csvField("1e3")).toBe("1e3");
    expect(csvField(-5)).toBe("-5");
    expect(csvField("الخليل")).toBe("الخليل");
    expect(csvField("a=b")).toBe("a=b");
  });

  it("builds the file from the first row's keys", () => {
    expect(toCsv([])).toBe("");
    expect(
      toCsv([
        { Area: "Hebron", People: 12 },
        { Area: "=cmd", People: null },
      ]),
    ).toBe("Area,People\r\nHebron,12\r\n'=cmd,");
  });

  it("makes file names safe", () => {
    expect(safeFileName("Gaza/Rafah: phase 2?.csv")).toBe("Gaza_Rafah_ phase 2_.csv");
    expect(safeFileName("  ")).toBe("export");
    expect(safeFileName("مشروع الخليل_results.json")).toBe("مشروع الخليل_results.json");
  });
});

describe("downloads", () => {
  function stubDownloads() {
    vi.useFakeTimers();
    const createObjectURL = vi.fn((blob: Blob) => (void blob, "blob:test"));
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    return { createObjectURL, revokeObjectURL, click };
  }

  it("saves a UTF-8 CSV with a byte-order mark and revokes the URL afterwards", async () => {
    const { createObjectURL, revokeObjectURL, click } = stubDownloads();
    expect(downloadCSV([{ Area: "Hebron" }], "a/b.csv")).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("a_b.csv");
    expect(anchor.isConnected).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");

    vi.useRealTimers(); // FileReader needs real timers
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("text/csv;charset=utf-8;");
    const bytes = new Uint8Array(await readBlob(blob));
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe("Area\r\nHebron");
  });

  it("saves nothing when there are no rows", () => {
    const { click } = stubDownloads();
    expect(downloadCSV([], "empty.csv")).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it("saves JSON", async () => {
    const { createObjectURL } = stubDownloads();
    downloadJSON({ a: 1 }, "x.json");
    vi.useRealTimers();
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(new TextDecoder().decode(await readBlob(blob)))).toEqual({ a: 1 });
  });
});
