import {
  Bell, Bot, Brain, Layers, ListTodo, Newspaper, Plug, ScrollText, Settings2, Sun, Sunrise, Terminal, UserRound,
  Briefcase, Workflow, Zap, FileText, type LucideIcon,
} from "lucide-react";
import type { Key } from "../i18n";
import type { View } from "../router";

export type NavItem = { view: View; label: Key; icon: LucideIcon };
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

export function groupOf(view: View): NavGroup {
  return NAV.find((group) => group.items.some((item) => item.view === view)) ?? NAV[0]!;
}
