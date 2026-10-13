import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import robotsTxt from "../../public/robots.txt?raw";
import faviconSvg from "../../public/favicon.svg?raw";
import vercelJson from "../../vercel.json?raw";
import faviconIco from "../../public/favicon.ico?inline";
import appleTouchIcon from "../../public/apple-touch-icon.png?inline";

// The files served as they are: the page shell, robots.txt, the icons and the Vercel headers.
const files: Record<string, string> = { "index.html": indexHtml, "public/robots.txt": robotsTxt, "public/favicon.svg": faviconSvg };
const read = (file: string) => files[file];
/** The bytes of a file imported as a base64 data URL. */
const bytes = (dataUrl: string) => {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const view = new DataView(Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0)).buffer);
  return {
    u8: (at: number) => view.getUint8(at),
    u16le: (at: number) => view.getUint16(at, true),
    u32be: (at: number) => view.getUint32(at, false),
    text: (from: number, to: number) => String.fromCharCode(...Array.from({ length: to - from }, (_, i) => view.getUint8(from + i))),
  };
};

describe("static files", () => {
  it("brands the page as Raqib by Momentum Labs, keeps it out of search engines and has no Lovable leftovers", () => {
    const html = read("index.html");
    expect(html).toContain("<title>Raqib by Momentum Labs</title>");
    expect(html).toMatch(/<meta name="description" content="Raqib by Momentum Labs: [^"]+" \/>/);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(html).not.toMatch(/lovable|og:image|twitter:image|twitter:site|TODO/i);
  });

  it("sends noindex on every page, and lets crawlers fetch pages so they see it (a blocked page can be listed by its address)", () => {
    const headers = JSON.parse(vercelJson).headers as Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    const all = headers.find((rule) => rule.source === "/(.*)");
    expect(all?.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    const rules = read("public/robots.txt")
      .split("\n")
      .filter((line) => line && !line.startsWith("#"));
    expect(rules).toEqual(["User-agent: *", "Allow: /"]);
  });

  it("uses an SVG monogram with an accessible name, with ICO and Apple touch icon fallbacks", () => {
    const svg = read("public/favicon.svg");
    expect(svg).toMatch(/^<svg [^>]*role="img"[^>]*aria-labelledby="raqib-icon-title"/);
    expect(svg).toContain('<title id="raqib-icon-title">Raqib</title>');
    expect(svg).not.toMatch(/<script|href=/i);

    const html = read("index.html");
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="32x32" />');
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');

    // An ICO file (reserved 0, type 1) with 16, 32 and 48 px images, and a 180 × 180 PNG for iOS.
    const ico = bytes(faviconIco);
    expect([ico.u16le(0), ico.u16le(2), ico.u16le(4)]).toEqual([0, 1, 3]);
    expect([0, 1, 2].map((i) => ico.u8(6 + 16 * i))).toEqual([16, 32, 48]);
    const png = bytes(appleTouchIcon);
    expect(png.text(1, 4)).toBe("PNG");
    expect([png.u32be(16), png.u32be(20)]).toEqual([180, 180]);
  });
});
