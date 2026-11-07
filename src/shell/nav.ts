import {
  Bell, Bot, Brain, Layers, ListTodo, Newspaper, Plug, ScrollText, Settings2, Sun, Sunrise, Terminal, UserRound,
  Briefcase, Workflow, Zap, FileText, Inbox, Mail, Calendar, CheckSquare, GitPullRequest, Building2, Handshake, BarChart3, MessageSquare, FileSignature,
  Receipt, Coins, TrendingUp, Radar, Sparkles, Megaphone, Send, LineChart, Presentation, type LucideIcon,
} from "lucide-react";
import type { Key } from "../i18n";
import type { View } from "../router";

/** `domain` hides an item until a source of that domain (or of one of them) is configured. */
export type NavItem = { view: View; label: Key; icon: LucideIcon; domain?: string | string[] };
export type NavGroup = { id: string; label: Key; icon: LucideIcon; items: NavItem[] };

// Only pages with real data behind them appear here. A group with one item opens it directly.
export const NAV: NavGroup[] = [
  { id: "talk", label: "nav.talk", icon: Sparkles, items: [{ view: "talk", label: "nav.talk", icon: Sparkles }] },
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
  {
    id: "biz", label: "nav.group.biz", icon: Building2, items: [
      { view: "pipeline", label: "nav.pipeline", icon: Handshake, domain: "deals" },
      { view: "numbers", label: "nav.numbers", icon: BarChart3, domain: ["deals", "bank", "invoices", "holdings"] },
      { view: "rooms", label: "nav.rooms", icon: MessageSquare, domain: "rooms" },
      { view: "contracts", label: "nav.contracts", icon: FileSignature, domain: "documents" },
      { view: "invoices", label: "nav.invoices", icon: Receipt, domain: "invoices" },
      { view: "finance", label: "nav.finance", icon: Coins, domain: "bank" },
      { view: "stocks", label: "nav.stocks", icon: TrendingUp, domain: "holdings" },
    ],
  },
  {
    id: "brand", label: "nav.group.brand", icon: Megaphone, items: [
      { view: "posts", label: "nav.posts", icon: Send },
      { view: "branding", label: "nav.branding", icon: LineChart },
      { view: "decks", label: "nav.decks", icon: Presentation },
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
  { id: "center", label: "nav.center", icon: Radar, items: [{ view: "center", label: "nav.center", icon: Radar }] },
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
    items: group.items.filter((item) =>
      item.view === "inbox" ? domains.size > 0 : !item.domain || [item.domain].flat().some((domain) => domains.has(domain)),
    ),
  }));
}

export function groupOf(view: View): NavGroup {
  return NAV.find((group) => group.items.some((item) => item.view === view)) ?? NAV[0]!;
}
