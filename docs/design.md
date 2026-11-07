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

## Pages not ported yet

The navigation shows only pages with real data behind them. These pages of the design wait for the API:

| Design page | Missing in the API |
|---|---|
| Assistant conversation | A chat endpoint with history |
| Pipeline, Numbers, Rooms, Contracts, Invoices, Account, Stocks | Business data |
| Posts, Personal branding, Decks | Content and publishing data |
| Mission control | A combined live view of all work |
| Mail: splits, snooze, bulk actions, context column | Labels, snooze and related records in the mail source |
| Calendar: drag to move, focus blocks, scheduling assistant | Moving goes through an approval; drag and focus planning need more API |
| Issues: board, bulk edit, new issue form | Board columns and bulk actions in the issue source |
| Pull requests: deployments | A deployment feed |
| Session detail: context usage, rules in effect | Token usage and the session's rules from the desktop agent |
| Alert detail: metric chart and cause tree | Metrics and root-cause analysis for alerts |
| Automation builder: branches, dry run over past days | Branching steps and a dry-run endpoint |
| Tasks: hand a task to Lighthouse | Delegating a task to an agent |
| Workspace or account filter | Accounts |
