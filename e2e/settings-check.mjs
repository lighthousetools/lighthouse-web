// Opens and submits the forms of settings, connections, sources and agents in a real browser against a running server.
//
//   node e2e/settings-check.mjs http://localhost:5180 http://127.0.0.1:18089 <owner token> <member token> <screenshots>
//
// The first address is the web app, the second the API. The server needs an instance connector `demo` with the
// `list_threads` tool, a `mock` provider and an agent called `reader`. Use a database of its own: this changes settings.
import { chromium } from "playwright-core";

const [web, server, ownerToken, memberToken, shots] = process.argv.slice(2);
const failures = [];

async function check(name, run) {
  try {
    await run();
    console.log(`ok    ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}

const eq = (actual, expected, what) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: ${JSON.stringify(actual)} is not ${JSON.stringify(expected)}`);
};

async function get(token, path) {
  const response = await fetch(`${server}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return response.json();
}

const value = async (token, key) => (await get(token, "/settings/values")).find((item) => item.key === key);
const effective = (token) => get(token, "/settings/effective");
const until = async (test, what) => {
  for (let tries = 0; tries < 50; tries++) {
    if (await test()) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`${what} did not happen`);
};

const browser = await chromium.launch({ channel: process.env.CRAWL_CHANNEL ?? "chrome", headless: true });

async function open(token, hash) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: "en-US" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.errors = errors;
  await page.goto(`${web}/`);
  await page.evaluate((value) => {
    localStorage.setItem("lighthouse.token", value);
    localStorage.setItem("lighthouse.language", "en");
  }, token);
  await page.goto(`${web}/${hash}`);
  await page.reload();
  return page;
}

async function go(page, hash) {
  await page.evaluate((value) => {
    location.hash = value;
  }, hash);
}

// Flips a switch and waits until the page shows the new state, as a person would see it.
async function flip(page, name) {
  const toggle = page.getByRole("switch", { name, exact: true });
  const before = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await until(async () => (await toggle.getAttribute("aria-checked")) !== before, `the switch ${name}`);
}

const button = (scope, name) => scope.getByRole("button", { name, exact: true });
const dialog = (page) => page.getByRole("dialog");
const shot = (page, name) => page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });

const owner = await open(ownerToken, "#settings/models");
const member = await open(memberToken, "#settings/models");

await check("models: an owner adds a provider from a preset with key and model", async () => {
  await button(owner, "Add provider").click();
  const form = dialog(owner);
  await button(form, "OpenAI").click();
  await form.getByLabel("API key").fill("sk-browser");
  await shot(owner, "models-add");
  await button(form, "Add").click();
  await until(async () => (await effective(ownerToken)).providers.find((item) => item.name === "openai")?.key === "tenant", "the provider with its key");
  const provider = (await effective(ownerToken)).providers.find((item) => item.name === "openai");
  eq(provider.source, "tenant", "source");
  eq(provider.key, "tenant", "key");
  eq(provider.models.length, 1, "models");
});

await check("models: an owner routes the task to it for the workspace, and resets it", async () => {
  await button(owner, "Change").click();
  const form = dialog(owner);
  await form.getByRole("button", { name: "Provider" }).click();
  await owner.getByRole("menuitem", { name: /openai/ }).click();
  await button(form, "Save").click();
  await until(async () => (await effective(ownerToken)).routing[0].provider === "openai", "the route");
  eq((await effective(memberToken)).routing[0].source, "tenant", "the member's route source");
  await owner.getByRole("button", { name: "Reset Text to the default" }).click();
  await until(async () => (await effective(ownerToken)).routing[0].source === "instance", "the reset");
});

await check("models: a member adds their own model and sees no workspace controls", async () => {
  await member.getByText("You can add your own providers").waitFor();
  eq(await button(member, "Remove").count(), 0, "remove buttons");
  await member.getByRole("button", { name: "Add model" }).first().click();
  const form = dialog(member);
  await form.getByLabel("Model name").fill("robins-model");
  await form.getByLabel("Input price").fill("1,5");
  await form.getByLabel("Output price").fill("3");
  await button(form, "Save").click();
  await until(async () => (await get(memberToken, "/settings/me/entries")).providers.length === 1, "the personal entry");
  const entry = (await get(memberToken, "/settings/me/entries")).providers[0];
  eq(entry.models[0].input_eur_per_mtok, 1.5, "the price with a comma");
  await shot(member, "models-member");
});

await check("preferences: a member saves notifications, zone, accounts and Slack, and resets one", async () => {
  await go(member, "#settings/preferences");
  await flip(member, "A run finished");
  await until(async () => (await value(memberToken, "notifications")).source === "personal", "notifications");
  eq((await value(memberToken, "notifications")).value.done, true, "done");
  await member.getByRole("textbox", { name: "Time zone" }).fill("Asia/Tokyo");
  await button(member.locator(".st-row", { hasText: "Time zone" }), "Save").click();
  await until(async () => (await get(memberToken, "/me")).timezone === "Asia/Tokyo", "the time zone");
  await member.getByRole("textbox", { name: "Names in services" }).fill("linear=robin");
  await button(member.locator(".st-row", { hasText: "Names in services" }), "Save").click();
  await until(async () => (await value(memberToken, "accounts"))?.value.linear === "robin", "accounts");
  await member.getByRole("textbox", { name: "Aliases" }).fill("#mine");
  await button(member.locator(".st-row", { hasText: "Aliases" }), "Save").click();
  await until(async () => (await value(memberToken, "slack_channels")).source === "personal", "Slack aliases");
  await member.getByRole("textbox", { name: "Image model" }).fill("my-eyes");
  await button(member.locator(".st-add", { has: member.getByRole("textbox", { name: "Image model" }) }), "Save").click();
  await until(async () => (await value(memberToken, "brain")).source === "personal", "Brain models");
  await shot(member, "preferences");
  await member.locator(".st-row", { hasText: "A run waits for a decision" }).getByRole("button", { name: "Reset to the default" }).click();
  await until(async () => (await value(memberToken, "notifications")).source !== "personal", "the reset");
});

await check("preferences: an owner sets the workspace's embedding model; a member has no such field", async () => {
  eq(await member.getByRole("textbox", { name: "Embedding model" }).count(), 0, "the member's field");
  await go(owner, "#settings/preferences");
  await button(owner, "Whole workspace").click();
  await owner.getByRole("textbox", { name: "Provider" }).fill("openai");
  await owner.getByRole("textbox", { name: "Embedding model" }).fill("small");
  await button(owner.locator(".st-add", { has: owner.getByRole("textbox", { name: "Embedding model" }) }), "Save").click();
  await until(async () => (await value(ownerToken, "brain")).value.embedding_model === "small", "the model");
  eq((await value(ownerToken, "brain")).source, "tenant", "source");
});

await check("connections: a member adds, edits, switches and removes their own", async () => {
  await go(member, "#connections");
  await button(member, "Add connection").first().click();
  const form = dialog(member);
  await form.getByLabel("Name").fill("mymail");
  await form.getByLabel("Server URL").fill("http://127.0.0.1:9/mcp");
  await button(form, "Token").click();
  await form.getByLabel("Reading tools").fill("list_threads, get_thread");
  await shot(member, "connection-add");
  await form.getByRole("button", { name: "Add connection" }).click();
  await until(async () => (await effective(memberToken)).connectors.some((item) => item.name === "mymail"), "the connection");
  const added = (await effective(memberToken)).connectors.find((item) => item.name === "mymail");
  eq([added.source, added.auth, added.read_tools], ["personal", "bearer", ["list_threads", "get_thread"]], "the connection");
  eq((await effective(ownerToken)).connectors.some((item) => item.name === "mymail"), false, "the owner's view");
  await member.getByRole("button", { name: "Connect my account" }).click();
  const token = dialog(member);
  await token.getByLabel("Value").fill("a-token");
  await button(token, "Store").click();
  await until(async () => (await effective(memberToken)).connectors.find((item) => item.name === "mymail").connected === "personal", "the token");
  await button(member, "Edit").click();
  const edit = dialog(member);
  await edit.getByLabel("Reading tools").fill("list_threads");
  await button(edit, "Save").click();
  await until(async () => (await effective(memberToken)).connectors.find((item) => item.name === "mymail").read_tools.length === 1, "the edit");
  await flip(member, "In use");
  await until(async () => !(await effective(memberToken)).connectors.find((item) => item.name === "mymail").enabled, "the switch");
  await flip(member, "In use");
  await until(async () => (await effective(memberToken)).connectors.find((item) => item.name === "mymail").enabled, "the switch back");
  await shot(member, "connection-detail");
  await button(member, "Delete").click();
  await button(dialog(member), "Delete").click();
  await until(async () => !(await effective(memberToken)).connectors.some((item) => item.name === "mymail"), "the removal");
});

await check("connections: an owner switches a server connection off for the workspace and on again", async () => {
  await go(owner, "#connections/demo");
  await flip(owner, "Use in this workspace");
  await until(async () => !(await effective(memberToken)).connectors.find((item) => item.name === "demo").enabled, "the switch");
  await flip(owner, "Use in this workspace");
  await until(async () => (await effective(memberToken)).connectors.find((item) => item.name === "demo").enabled, "the switch back");
});

await check("sources: a member adds their mail, refreshes it and sees it in their inbox alone", async () => {
  await go(member, "#settings/sources");
  await button(member, "Add source").click();
  const form = dialog(member);
  await button(form, "Mail").click();
  await form.getByRole("button", { name: "Connection" }).click();
  await member.getByRole("menuitem", { name: "demo" }).click();
  await shot(member, "source-add");
  await button(form, "Save").click();
  await until(async () => (await effective(memberToken)).sources.some((item) => item.name === "mail"), "the source");
  await member.getByRole("button", { name: "Edit mail" }).click();
  const edit = dialog(member);
  const definition = JSON.parse(await edit.getByLabel("Definition as JSON").inputValue());
  await edit.getByLabel("Definition as JSON").fill(JSON.stringify({ ...definition, interval: "30m" }));
  await button(edit, "Save").click();
  await until(async () => (await effective(memberToken)).sources.find((item) => item.name === "mail").interval === "30m", "the edit");
  await member.getByRole("button", { name: "Refresh mail" }).click();
  await until(async () => (await get(memberToken, "/mail/threads")).items.length > 0, "items");
  eq((await get(ownerToken, "/mail/threads")).items.length, 0, "the owner's mail");
  await shot(member, "sources");
  const subject = (await get(memberToken, "/mail/threads")).items[0].title;
  await go(member, "#inbox");
  await member.getByText(subject).first().waitFor({ timeout: 5000 });
  await shot(member, "inbox");
  await go(member, "#settings/sources");
  await member.getByRole("button", { name: "Remove mail" }).click();
  await button(dialog(member), "Delete").click();
  await until(async () => (await get(memberToken, "/mail/threads")).items.length === 0, "the items going away");
});

await check("agents: a member writes their own agent, switches it and removes it", async () => {
  await go(member, "#agents/new");
  await button(member, "Write the file myself").click();
  const file = "---\nname: Browser\nscope: org\ntrigger:\n  manual: true\n---\nGo.\n";
  await member.locator("textarea.ta.mono").fill(file);
  await button(member, "Save").click();
  await until(async () => (await get(memberToken, "/agents")).some((item) => item.id === "browser"), "the agent");
  eq((await get(memberToken, "/agents/browser")).layer, "personal", "layer");
  await flip(member, "browser for me");
  await until(async () => (await get(memberToken, "/agents/browser")).enabled === false, "the switch");
  await shot(member, "agent");
  await flip(member, "browser for me");
  await until(async () => (await get(memberToken, "/agents/browser")).enabled === true, "the switch back");
  await member.getByRole("button", { name: "Delete", exact: true }).first().click();
  await button(dialog(member), "Delete").click();
  await until(async () => !(await get(memberToken, "/agents")).some((item) => item.id === "browser"), "the removal");
});

await check("agents: switching a built-in agent off for me leaves it on for the owner", async () => {
  await go(member, "#agents/reader");
  await flip(member, "reader for me");
  await until(async () => (await get(memberToken, "/agents/reader")).enabled === false, "the switch");
  eq((await get(ownerToken, "/agents/reader")).enabled, true, "the owner's");
  eq(await member.getByRole("button", { name: "Edit" }).count(), 0, "edit buttons on a built-in agent");
  await flip(member, "reader for me");
});

await check("automations: a member's own one shows its layer and switches for them alone", async () => {
  const file = "---\nname: Daily\ntrigger:\n  event: mine.happened\nsteps:\n  - agent: reader\n---\nMine.\n";
  const response = await fetch(`${server}/automations`, { method: "POST", headers: { Authorization: `Bearer ${memberToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ source: file }) });
  eq(response.status, 200, "saving");
  await go(member, "#automations/daily");
  await flip(member, "daily for me");
  await until(async () => (await get(memberToken, "/automations/daily")).enabled === false, "the switch");
  await shot(member, "automation");
  eq((await get(ownerToken, "/automations")).some((item) => item.id === "daily"), false, "the owner's list");
  await flip(member, "daily for me");
});

await check("skills: a member adds one and removes it", async () => {
  await go(member, "#settings/skills");
  await button(member, "Add skill").click();
  const form = dialog(member);
  await form.getByLabel("Name").fill("tone");
  await form.getByLabel("File").fill("---\nname: tone\ndescription: How I write\n---\nBe brief.\n");
  await button(form, "Save").click();
  await until(async () => (await get(memberToken, "/skills")).some((item) => item.name === "tone"), "the skill");
  await shot(member, "skills");
  await member.getByRole("button", { name: "Remove tone" }).click();
  await until(async () => !(await get(memberToken, "/skills")).some((item) => item.name === "tone"), "the removal");
});

await check("no page threw an error", async () => {
  eq([...owner.errors, ...member.errors], [], "page errors");
});

await browser.close();
if (failures.length) {
  console.log(`${failures.length} failed`);
  process.exit(1);
}
console.log("all passed");
