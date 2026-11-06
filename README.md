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

## Languages

Strings live in `src/i18n`, one file per language, and a test checks that both cover every key. Viewers pick a language on
the sign-in page or in the settings. By default the app follows the browser.

## Keyboard

`Cmd/Ctrl+K` opens the command palette, which also searches the Brain. `1` to `8` switch views while no field has focus.
In the Brain, `/` at the start of a line offers blocks, and `[[Title]]` links entries.

## Security

The device token lives in the browser's local storage. A strict Content Security Policy limits scripts and fonts to this
origin, and Markdown from models and files passes through DOMPurify before it renders.

## License

[MIT](LICENSE)
