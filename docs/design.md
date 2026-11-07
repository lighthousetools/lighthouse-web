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

## Pages not ported yet

The navigation shows only pages with real data behind them. These pages of the design wait for the API:

| Design page | Missing in the API |
|---|---|
| Assistant conversation | A chat endpoint with history |
| Tasks, Waiting for you | Tasks and an inbox across sources |
| Mail, Calendar | Mail and calendar data |
| Linear, Pull requests, Alerts | Issue, pull request and alert feeds |
| Pipeline, Numbers, Rooms, Contracts, Invoices, Account, Stocks | Business data |
| Posts, Personal branding, Decks | Content and publishing data |
| Automations | Automations apart from agents |
| Mission control | A combined live view of all work |
| Rules, What I know | Editable rules and a profile of the owner |
| Session detail: plan, context, diff, prompting | Session transcripts, diffs and input to a running session |
| Workspace or account filter | Accounts |
| Weekly report as a film | Nothing; it is planned for later |
