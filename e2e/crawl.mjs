// Crawls every page of the built app against the stub API: clicks every visible control, opens menus, dialogs and
// panels, and reports dead controls, JavaScript and console errors, icon buttons without a name, and horizontal
// overflow at 1280 and 1500 pixels in both looks.
//
//   pnpm build && pnpm crawl                # all pages
//   pnpm crawl -- posts decks               # some pages
//   CRAWL_CLICKS=0 pnpm crawl               # only load and measure, no clicking
//   CRAWL_URL=http://localhost:5173/ pnpm crawl   # against a running dev server, with readable stacks
//
// Needs Google Chrome installed (CRAWL_CHANNEL picks another Playwright channel). Writes e2e/report.json.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { answer, operationCount } from "./stub.mjs";

const PORT = 4799;
// CRAWL_URL points at a running dev server instead, for readable stack traces.
const BASE = process.env.CRAWL_URL ?? `http://127.0.0.1:${PORT}/`;
const ORIGIN = new URL(BASE).origin;
const router = readFileSync(new URL("../src/router.ts", import.meta.url), "utf8");
const ALL = [...router.match(/VIEWS = \[([\s\S]*?)\] as const/)[1].matchAll(/"([a-z]+)"/g)].map((match) => match[1]);
const views = process.argv.slice(2).filter((arg) => arg !== "--").length ? process.argv.slice(2).filter((arg) => arg !== "--") : ALL;
const MAX_CLICKS = Number(process.env.CRAWL_CLICKS ?? 60);
const SKIP = /sign out|abmelden|log out|delete everything|alles löschen/i;

const preview = process.env.CRAWL_URL ? null : spawn("pnpm", ["exec", "vite", "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
const stop = () => preview?.kill();
process.on("exit", stop);
for (let tries = 0; ; tries++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    if (tries > 50) throw new Error("vite preview did not start; run pnpm build first");
  }
  await new Promise((done) => setTimeout(done, 200));
}

const browser = await chromium.launch({ channel: process.env.CRAWL_CHANNEL ?? "chrome", headless: true });
const report = { operations: operationCount, pages: 0, clicks: 0, errors: [], dead: [], unnamed: [], overflow: [] };
const seen = { errors: new Set(), dead: new Set(), unnamed: new Set(), overflow: new Set() };
const add = (kind, key, entry) => {
  if (seen[kind].has(key)) return;
  seen[kind].add(key);
  report[kind].push(entry);
};

async function open(look, width) {
  const context = await browser.newContext({ viewport: { width, height: width === 1280 ? 800 : 940 }, colorScheme: look === "light" ? "light" : "dark" });
  await context.addInitScript((choice) => {
    localStorage.setItem("lighthouse.token", "crawl");
    localStorage.setItem("lighthouse.look", choice);
    window.open = () => { window.__requests++; return null; };
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => undefined, readText: async () => "" } });
    window.__requests = 0;
    const fetchOriginal = window.fetch;
    window.fetch = (...args) => {
      window.__requests++;
      return fetchOriginal(...args);
    };
  }, look);
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    const result = url.origin === ORIGIN && !/^\/(assets|src|node_modules|@)/.test(url.pathname) ? answer(route.request().method(), url.pathname) : null;
    return result ? route.fulfill(result) : route.continue();
  });
  const page = await context.newPage();
  // A file chooser, a download or a new window is a reaction too.
  page.events = 0;
  for (const name of ["filechooser", "download", "popup", "dialog"]) page.on(name, (event) => { page.events++; if (name === "dialog") void event.dismiss(); if (name === "filechooser") void event.setFiles([]).catch(() => undefined); });
  page.on("pageerror", (error) => add("errors", `${page.view}:${error.message}`, { view: page.view, look, width, kind: "pageerror", message: error.message, stack: error.stack?.split("\n").slice(1, 4).join(" | ") }));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/Failed to load resource.*404/.test(text)) return;
    add("errors", `${page.view}:${text}`, { view: page.view, look, width, kind: "console", message: text.slice(0, 300) });
  });
  return { context, page };
}

async function measure(page, view, look, width) {
  const found = await page.evaluate(() => {
    const out = { overflow: [], unnamed: [] };
    const vw = document.documentElement.clientWidth;
    const path = (element) => {
      const parts = [];
      for (let node = element; node && node !== document.body && parts.length < 4; node = node.parentElement) {
        parts.unshift(node.tagName.toLowerCase() + (node.classList.length ? `.${[...node.classList].slice(0, 2).join(".")}` : ""));
      }
      return parts.join(" > ");
    };
    if (document.documentElement.scrollWidth > vw + 1) out.overflow.push({ where: "page", by: document.documentElement.scrollWidth - vw });
    for (const element of document.querySelectorAll("body *")) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || rect.right <= vw + 1) continue;
      let clipped = false;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.overflowX !== "visible" && parent.getBoundingClientRect().right <= vw + 1) { clipped = true; break; }
      }
      if (!clipped && getComputedStyle(element).position !== "fixed") out.overflow.push({ where: path(element), by: Math.round(rect.right - vw) });
    }
    for (const button of document.querySelectorAll("button, [role=button], a[href]")) {
      const rect = button.getBoundingClientRect();
      if (!rect.width) continue;
      const name = (button.getAttribute("aria-label") || button.getAttribute("title") || button.textContent || "").trim();
      if (!name) out.unnamed.push(path(button));
    }
    return out;
  });
  for (const item of found.overflow.slice(0, 5)) add("overflow", `${view}:${look}:${width}:${item.where}`, { view, look, width, ...item });
  for (const where of found.unnamed) add("unnamed", `${view}:${where}`, { view, where });
}

const state = (page) =>
  page.evaluate(() => ({ hash: location.hash, html: [...document.body.innerHTML].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) | 0, 0), sig: document.body.innerText.length, requests: window.__requests + performance.getEntriesByType("resource").length + document.getAnimations().length, focus: document.activeElement?.outerHTML.slice(0, 80) }));

async function crawl(page, view) {
  const labels = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("button, [role=button], [role=tab], a[href^='#'], [role=menuitem], summary").forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || element.disabled || element.closest("[aria-hidden=true]")) return;
      element.setAttribute("data-crawl", String(index));
      out.push({ id: String(index), name: (element.getAttribute("aria-label") || element.textContent || element.getAttribute("title") || "").trim().slice(0, 60) });
    });
    return out;
  });
  const unique = [];
  const names = new Set();
  for (const label of labels) {
    if (SKIP.test(label.name) || names.has(label.name)) continue;
    names.add(label.name);
    unique.push(label);
  }
  for (const label of unique.slice(0, MAX_CLICKS)) {
    const target = page.locator(`[data-crawl="${label.id}"]`);
    if (!(await target.count()) || !(await target.isVisible().catch(() => false))) continue;
    const before = { ...(await state(page)), events: page.events };
    try {
      await target.click({ timeout: 1500 });
    } catch {
      continue;
    }
    report.clicks++;
    await page.waitForTimeout(400);
    const after = { ...(await state(page)), events: page.events };
    if (after.hash === before.hash && after.html === before.html && after.sig === before.sig && after.requests === before.requests && after.events === before.events && !(await target.evaluate((element) => element.matches(".on, [aria-selected=true], [aria-pressed=true], [aria-current]")).catch(() => false))) {
      add("dead", `${view}:${label.name}`, { view, control: label.name || "(no name)" });
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
    if ((await page.evaluate(() => location.hash)) !== `#${view}` || !(await page.evaluate(() => localStorage.getItem("lighthouse.token")))) {
      await page.evaluate(() => localStorage.setItem("lighthouse.token", "crawl"));
      await page.goto(`${BASE}?page=${view}#${view}`);
      await page.waitForTimeout(600);
      await page.evaluate((labels) => {
        // Mark the controls again after a reload so later clicks still find them.
        document.querySelectorAll("button, [role=button], [role=tab], a[href^='#'], [role=menuitem], summary").forEach((element, index) => element.setAttribute("data-crawl", String(index)));
        return labels;
      }, null);
    }
  }
}

for (const look of ["glass", "light"]) {
  for (const width of [1500, 1280]) {
    const { context, page } = await open(look, width);
    for (const view of views) {
      page.view = view;
      // A fresh load per page, so that one broken page cannot hide the next.
      await page.goto(`${BASE}?page=${view}#${view}`);
      await page.waitForTimeout(700);
      report.pages++;
      await measure(page, view, look, width);
      if (process.env.CRAWL_SHOTS) await page.screenshot({ path: `${process.env.CRAWL_SHOTS}/${view}-${look}-${width}.png` });
      if (look === "glass" && width === 1500 && MAX_CLICKS > 0) await crawl(page, view);
    }
    await context.close();
  }
}
await browser.close();
stop();
writeFileSync(new URL("./report.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(`${report.pages} page loads, ${report.clicks} clicks over ${views.length} pages (${report.operations} API operations stubbed)`);
console.log(`${report.errors.length} errors, ${report.dead.length} dead controls, ${report.unnamed.length} unnamed controls, ${report.overflow.length} overflow findings`);
process.exit(0);
