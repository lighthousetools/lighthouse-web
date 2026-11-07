import {
  Bell, Bot, Brain, Layers, ListTodo, Newspaper, Plug, ScrollText, Settings2, Sun, Sunrise, Terminal, UserRound,
  Briefcase, Workflow, Zap, FileText, Inbox, Mail, Calendar, CheckSquare, GitPullRequest, type LucideIcon,
} from "lucide-react";
import type { Key } from "../i18n";
import type { View } from "../router";

/** `domain` hides an item until a source of that domain is configured. */
export type NavItem = { view: View; label: Key; icon: LucideIcon; domain?: string };
export type NavGroup = { id: string; label: Key; icon: LucideIcon; items: NavItem[] };

// Only pages with real data behind them appear here. A group with one item opens it directly.
export const NAV: NavGroup[] = [
  {
    id: "today", label: "nav.group.today", icon: Sun, items: [
      { view: "ready", label: "nav.ready", icon: Layers },
      { view: "tasks", label: "nav.tasks", icon: ListTodo },
      { view: "brief", label: "nav.brief", icon: Sunrise },
      { view: "recap", label: "nav.recap", icon: Newspaper },
    ],
  },
  {
    id: "work", label: "nav.group.work", icon: Briefcase, items: [
      { view: "inbox", label: "nav.inbox", icon: Inbox },
      { view: "mail", label: "nav.mail", icon: Mail, domain: "mail" },
      { view: "calendar", label: "nav.calendar", icon: Calendar, domain: "calendar" },
      { view: "issues", label: "nav.issues", icon: CheckSquare, domain: "issues" },
      { view: "code", label: "nav.code", icon: GitPullRequest, domain: "code" },
      { view: "sessions", label: "nav.sessions", icon: Terminal },
      { view: "alerts", label: "nav.alerts", icon: Bell },
    ],
  },
  { id: "brain", label: "nav.brain", icon: Brain, items: [{ view: "brain", label: "nav.brain", icon: Brain }] },
  {
    id: "auto", label: "nav.group.auto", icon: Zap, items: [
      { view: "automations", label: "nav.automations", icon: Workflow },
      { view: "agents", label: "nav.agents", icon: Bot },
      { view: "log", label: "nav.log", icon: FileText },
    ],
  },
  {
    id: "sys", label: "nav.group.settings", icon: Settings2, items: [
      { view: "connections", label: "nav.connections", icon: Plug },
      { view: "rules", label: "nav.rules", icon: ScrollText },
      { view: "me", label: "nav.me", icon: UserRound },
      { view: "settings", label: "nav.settings", icon: Settings2 },
    ],
  },
];

/** The navigation without pages whose source is missing. Inbox needs at least one source. */
export function visibleNav(domains: Set<string>): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => (item.view === "inbox" ? domains.size > 0 : !item.domain || domains.has(item.domain))),
  }));
}

export function groupOf(view: View): NavGroup {
  return NAV.find((group) => group.items.some((item) => item.view === view)) ?? NAV[0]!;
}
