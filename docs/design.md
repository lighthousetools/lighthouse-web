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

Slot times, the calendar's days and the editor's date are in the owner's time zone from `GET /me` (`timezone`, set by
`server.timezone`), not the browser's. A post dropped on a slot gets the instant that `/posts/calendar` returns for it. Slides move by dragging them in the grid or the slide editor, or with Alt and the arrow keys.

`posts.changed`, `decks.changed` and `branding.changed` reload the matching data.

## Later, delegation and branches

- **Later.** Every item in Ready has a Later menu (in an hour, this evening, tomorrow, Monday) through
  `POST /ready/{kind}/{id}/snooze`; it leaves the feed until then. Post ideas that agents propose with `posts.propose`
  show up there as suggestions: keep them as a draft, discard them or open them in Posts.
- **Tasks** can be handed to an agent (`POST /tasks/{id}/delegate`). The task shows that the agent works on it, links
  the run, and shows its report as the result. You still decide when the task is done.
- **Mail** hides threads for later (`/connected/items/{id}/snooze`; the Later tab lists them with `snoozed=true`), saves
  the current search and box as a split tab (`/connected/splits`), and archives or postpones several selected threads
  at once (`POST /connected/actions/bulk`, each writing call waits for approval).
- **Calendar** lists free slots from `/calendar/suggestions` for 30, 60 or 90 minutes. A slot starts a new event or
  blocks focus time (`POST /calendar/focus`), and "Block focus" takes the next free slot. Creating events waits for
  approval.
- **Issues** have a new-issue form for trackers with `create` and code hosts with `create_issue`.
- **Pull requests** show checks flagged `deployment` as their own Deployments section with a link to the preview.
- **Automations** draw an `if` with branches as two lanes that join again. "Two ways" turns a stop condition into a
  branch, and every lane has its own add button. The Try tab runs `POST /automations/dry-run` on the unsaved file with
  a sample payload. The sentence above the list writes a draft through `POST /automations/draft` to review before saving.
  An agent step that waits for an approval makes the automation wait too.

## Talk, usage and alert charts

- **Talk** (`#talk`) keeps conversations as threads (`/talk/threads`): new chat, search, pin, rename and delete, grouped
  into pinned, today, yesterday, this week and older. An empty thread greets you with what waits in Ready and a few
  starting questions. A message goes to `POST /talk/threads/{id}/messages`. With a talk agent, the answer is pending
  (`202`) until its run ends; `talk.changed` brings it in, and polling takes over while the stream is down. The run is
  one click away, and anything the agent wants to send still waits for approval. Without a talk agent, the Brain answers
  at once with its sources, which open in the Brain.
- **Claude Code sessions** show their usage from `GET /sessions/{node}/{id}`: cost in USD, tokens in and out, and how
  much came from the cache.
- **Alerts** chart their runs or refreshes per day from `GET /alerts/{id}/series`, failed ones in red, over 7, 14 or 30
  days. Alerts without a history show no chart.

## Writing and business tools

- **Posts** keep up to ten variants next to the main text: keep the current text as a variant, or swap a variant in.
  A first comment (for the link you would rather not put in the post) shows under the preview. Sharper, Shorter, Other
  first line or your own instruction ask `POST /posts/{id}/rewrite` for a proposal in your voice; it changes nothing
  until you use it or keep it as a variant, and its run is one click away.
- **Presentations** start empty or from a brief (`POST /decks/generate`, gaps marked `[TODO]`), and can be attached to
  a deal room (`POST /decks/{id}/attach`), which waits for approval.
- **Rooms** show next steps and milestones, and add a next step through the room source's `add_step` action.
- **Contracts** fill a template from the Brain (`/contracts/templates`, `POST /contracts/compose`) and can hand the text
  to a source's `draft` action. Missing fields stay as `[TODO]`; nothing is sent or signed.
- **Pipeline** suggests a value for a deal from won deals like it (`GET /deals/{id}/suggestion`), and proposes tasks for
  the top open deals (`POST /deals/top-tasks`), which you accept in Ready.
- **Numbers** compare the revenue of the chosen months with as many months before, and export everything as CSV
  (`GET /numbers/export`).
- **Stocks** keep your theses on a holding as notes in the Brain and propose a reminder before each earnings date
  (`POST /holdings/reminders`). No advice, no trading.

## Loading and motion

Only the start page and the sign-in are in the first bundle; every other page, the presenter and the film load when
first opened. Focus shows as a ring on every control and field. With reduced motion, transitions, the film, the light
and smooth scrolling stand still.

## Pages not ported yet

The navigation shows only pages with real data behind them. These pages of the design wait for the API:

| Design page | Missing in the API |
|---|---|
| Posts: blocked days; Branding: post-to-meeting funnel, comment briefing; Presentations: style choice and PDF export | Not in the API yet |
| Branding: reactions from target accounts | Network analytics export counts only, and Lighthouse reads no profiles; imports keep `icp_share` instead |
| Presentations: PPTX export | No PPTX writer on the server; print the HTML for a PDF, or import HTML or Markdown |
| Rooms: publishing to the customer | Lighthouse never publishes a room; that stays in the room tool |
| Stocks: own metrics and questions | Not in the API yet |
| Mail: context column | Related records next to a thread |
| Calendar: drag to move | Moving an event goes through an approval; dragging needs a move action |
| Issues: board and bulk edit | Board columns in the issue source |
| Session detail: rules in effect | The session's rules from the desktop agent |
| Alert detail: cause tree | Root-cause analysis for alerts |
| Automation builder: dry run over past days | Dry runs replay a payload, not the events of past days |
