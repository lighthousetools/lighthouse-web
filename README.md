# Lighthouse Web

The web app of [Lighthouse](https://github.com/lighthousetools/lighthouse) by Lighthouse Tools, a personal assistant you
run yourself. It covers the daily briefing with streamed answers, approvals in plain language, Claude Code sessions,
agents, the Second Brain as a Markdown workspace, the weekly report, the log and settings. It updates live, speaks English
and German, and also installs as a PWA.

## Run

```sh
pnpm install
LIGHTHOUSE_URL=http://127.0.0.1:8080 pnpm dev
```

The development server forwards API calls to your Lighthouse server.

## Deploy

`pnpm build` writes the app to `dist`. Set `paths.web` in `lighthouse.toml` to that directory, and the server delivers
the app from its own address. Routes use the URL hash, because paths like `/agents` belong to the API.

## API types

`src/api/schema.d.ts` is generated from `openapi.json`, the description the server publishes at `/openapi.json`. After an
API change, replace `openapi.json` and run `pnpm types`.

## Crawl

`pnpm build && pnpm crawl` opens every page of the built app against a stub API that answers every operation in
`openapi.json` with made-up data (`e2e/stub.mjs`). It clicks every visible control, opens menus, dialogs and panels, and
reports page errors, console errors, controls that do nothing, icon buttons without a name, and horizontal overflow at
1280 and 1500 pixels in both looks. The findings land in `e2e/report.json`. It takes a few minutes and needs Google
Chrome, so it is not part of CI.

- `pnpm crawl -- posts decks` crawls some pages only.
- `CRAWL_CLICKS=0 pnpm crawl` only loads and measures.
- `CRAWL_URL=http://localhost:5173/ pnpm crawl` uses a running dev server, for readable stack traces.
- `CRAWL_SHOTS=<dir>` saves a screenshot of every page.
- `CRAWL_URL=http://localhost:8088/ CRAWL_PASSWORD=lighthouse-demo pnpm crawl` crawls the server's demo
  (`docker compose -f demo/compose.yml up --build` in the lighthouse repository) with its real answers instead of the
  stub. Against a real server the crawl does not delete, remove or discard anything. `pnpm build` replaces `dist`, so
  restart the demo server afterwards (`docker compose -f demo/compose.yml restart demo-server`) to serve the new build.

## Languages

Strings live in `src/i18n`, one file per language, and a test checks that both cover every key. Viewers pick a language on
the sign-in page or in the settings. By default the app follows the browser.

## Design

The app has two looks, Glass and Light, and follows the system by default. The background follows the time of day.
[docs/design.md](docs/design.md) describes the design system, the Mac app bridge, and which pages of the design still wait
for the API.

## Keyboard

`Cmd/Ctrl+K` opens the command palette, which also searches the Brain. `1` to `9` switch views while no field has focus.
In Approvals, `↑` and `↓` move through the queue, `Enter` approves, `E` edits and `R` denies.
In the Brain, `/` at the start of a line offers blocks, and `[[Title]]` links entries.

## Security

The device token lives in the browser's local storage. A strict Content Security Policy limits scripts and fonts to this
origin. Markdown from models and files renders as React elements, never as HTML, so it cannot inject markup.

## License

[MIT](LICENSE)
