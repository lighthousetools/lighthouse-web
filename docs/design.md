# Design

The web app follows the Lighthouse design: Inter, two looks (Glass and Light), elevation as a 0.5px ring instead of
borders, only the weights 400 and 500, hierarchy by opacity, and colour for state only. The tokens live in
`src/ui/tokens.css`, the kit in `src/ui`, and the shell (menu bar, rail, sidebar, inspector, palette and the time-of-day
background) in `src/shell`.

## Looks

The look follows the system by default: a dark system shows Glass, a light one shows Light. Settings, the View menu and
the command palette switch it for this device. The background is a WebGL sky that follows the clock. With reduced motion
it draws a still frame, and without WebGL a gradient of the same phase takes its place.

## In the Mac app

The Mac app hosts this web app (see `docs/bridge.md` in lighthouse-apple). When the root carries `data-native-shell`, the
menu bar and the status island hide, the window fills the view, and the rail and sidebar clear
`--native-titlebar-height`, so the top strip stays free for dragging. The bridge, detected through
`window.webkit.messageHandlers.lighthouse`, receives `ready`, `badge` with the number of open requests, `notify` for new
approvals, permission requests and waiting sessions, and `openExternal` for sign-in pages. The app's `palette` and
`newNote` commands arrive as the cancelable `lighthouse:command` event.

## Live updates

`GET /events` names what changed. Each named event reloads only the data it touches (`queriesFor` in `src/data.ts`):
`tasks.changed` the tasks and the ready feed, `alerts.changed` the alerts, `document.created` the briefs and recaps, and
so on. `changed` reloads everything on screen. The sidebar counts come from `GET /ready` and `GET /alerts/counts`, and in
the Mac app the Dock badge shows the ready count.

## Connected data

Inbox, Mail, Calendar, Issues and Pull requests read the server's cache of connected sources (`/inbox`, `/mail/threads`,
`/calendar/events`, `/issues`, `/pulls`, `/connected/items/{id}`). A page appears in the navigation only when
`/connected/sources` lists a source of its domain. Each page shows how fresh its data is and refreshes on request.
Actions such as reply, move, comment or approve go through `POST /connected/items/{id}/actions/{action}`: a `202` means the
action waits for approval in Ready for you, a `200` that it ran, for example as a draft. Connected search is part of the
command palette. The Claude Code page shows a session's plan, todos, timeline and changed files, and queues messages that
the session receives at its next stop.

## Companies

When `/organizations` lists organizations, the menu bar shows a company selector: All, or one organization with its color.
The choice is remembered per device. Every connected list passes `org=` (the inbox filters by the item's `org`), key
numbers come from `/numbers?org=`, and the navigation counts only that organization's sources.

## Business pages

Pipeline, Numbers, Rooms, Contracts, Invoices, Account and Stocks read deals, key numbers, deal rooms, contracts,
invoices, bank accounts and transactions, and holdings. Each appears only when a source of its domain exists. Moving a
deal, creating one, reminding, sending, releasing a payment or signing all go through actions, so they wait for an
approval: nothing pays, signs or sends by itself. Stocks only shows data, with no advice and no trading. Mission control
combines the key numbers, the ready feed, sessions, alerts, runs and source health.

## Publishing

Posts, Personal branding and Presentations are the server's own data, so they show without a connected source.

- **Posts** plan the week: a pool of ideas and drafts, a week and a month calendar per account, and the slots from
  `/posts/slots` that turn into gaps when nothing is planned (`/posts/calendar`). Drag a post onto a day, or fill a gap
  with the suggestion, which prefers the slot's pillar. The editor checks the text while you type (`/posts/check`), shows
  how the feed cuts it after three lines, picks an image from the Brain, and sets pillar, topic and date. A date only
  plans a post. Publish goes through `POST /posts/{id}/publish` on an explicit click and waits for approval in Ready;
  nothing comments, connects or posts by itself. The Posts tab sums up what went out and imports CSV or JSON from
  `/posts/import`. Topics edit the pillars and the posting rhythm.
- **Personal branding** charts reach, reactions, followers and audience share from the posts' metrics, and edits the
  profile in `/branding` that agents write in.
- **Presentations** are Brain entries of the type `deck`. A line with only `---` starts a slide, the first heading is
  its title, `-` lines are points, `>` a quote, and `Note:` lines are speaker notes that only the presenter shows. The
  layout follows from the content. The presenter has a timer with pause, the next slide, notes, a black screen and an
  audience view. Export downloads HTML or Markdown; print the HTML for a PDF.

`posts.changed`, `decks.changed` and `branding.changed` reload the matching data.

## Pages not ported yet

The navigation shows only pages with real data behind them. These pages of the design wait for the API:

| Design page | Missing in the API |
|---|---|
| Assistant conversation | A chat endpoint with history |
| Posts: variants, first comment, rewrite suggestions, blocked days; Branding: post-to-meeting funnel, target-account reactions, comment briefing; Presentations: generated drafts, style choice, PDF and PPTX export, publishing to a room | Not in the API yet |
| Pipeline: suggested values, top deals as tasks; Numbers: export and comparison periods; Contracts: templates and composer; Rooms: publishing, next steps and milestones; Stocks: theses, own metrics and questions | Not in the API yet |
| Mail: splits, snooze, bulk actions, context column | Labels, snooze and related records in the mail source |
| Calendar: drag to move, focus blocks, scheduling assistant | Moving goes through an approval; drag and focus planning need more API |
| Issues: board, bulk edit, new issue form | Board columns and bulk actions in the issue source |
| Pull requests: deployments | A deployment feed |
| Session detail: context usage, rules in effect | Token usage and the session's rules from the desktop agent |
| Alert detail: metric chart and cause tree | Metrics and root-cause analysis for alerts |
| Automation builder: branches, dry run over past days | Branching steps and a dry-run endpoint |
| Tasks: hand a task to Lighthouse | Delegating a task to an agent |
