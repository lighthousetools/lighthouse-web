import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { longDate, statusLabel } from "../format";
import { de } from "./de";
import { en } from "./en";
import { language, setLanguage, t, tOr } from "./index";

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.|schema\.d|i18n\/(en|de)/.test(path) ? [path] : [];
  });
}

const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

describe("translations", () => {
  it("cover the same keys and placeholders in both languages", () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(de[key].trim(), key).not.toBe("");
      expect(placeholders(de[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("cover every key used in the code", () => {
    const code = sources("src").map((path) => readFileSync(path, "utf8")).join("\n");
    const used = [...code.matchAll(/\bt\("([a-z.A-Z_]+)"/g)].map((match) => match[1]!);
    expect(used.length).toBeGreaterThan(100);
    for (const key of used) expect(Object.keys(en), key).toContain(key);
  });

  it("switch at once and follow the browser by default", () => {
    setLanguage("de");
    expect(language()).toBe("de");
    expect(t("nav.today")).toBe("Heute");
    expect(statusLabel("limit_exceeded")).toBe("Am Limit gestoppt");
    expect(longDate(new Date(2026, 10, 6))).toBe("Freitag, 6. November");
    setLanguage("en");
    expect(longDate(new Date(2026, 10, 6))).toBe("Friday 6 November");
    setLanguage("system");
    expect(language()).toBe("en");
  });

  it("fill in values and fall back for unknown names", () => {
    expect(t("approvals.approveAll", { count: 3 })).toBe("Approve all 3");
    expect(tOr("status.new", "New")).toBe("New");
    expect(statusLabel("some_thing")).toBe("Some thing");
  });
});
