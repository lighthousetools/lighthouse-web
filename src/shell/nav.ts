import {
  Bot, Brain, Layers, Newspaper, Plug, ScrollText, Settings2, ShieldCheck, Sun, Terminal, Zap, type LucideIcon,
} from "lucide-react";
import type { Key } from "../i18n";
import type { View } from "../router";

export type NavItem = { view: View; label: Key; icon: LucideIcon };
export type NavGroup = { id: string; label: Key; icon: LucideIcon; items: NavItem[] };

// Only pages with real data behind them appear here. A group with one item opens it directly.
export const NAV: NavGroup[] = [
  {
    id: "today", label: "nav.group.today", icon: Sun, items: [
      { view: "today", label: "nav.today", icon: Layers },
      { view: "approvals", label: "nav.approvals", icon: ShieldCheck },
      { view: "weekly", label: "nav.weekly", icon: Newspaper },
    ],
  },
  { id: "work", label: "nav.sessions", icon: Terminal, items: [{ view: "sessions", label: "nav.sessions", icon: Terminal }] },
  { id: "brain", label: "nav.brain", icon: Brain, items: [{ view: "brain", label: "nav.brain", icon: Brain }] },
  {
    id: "auto", label: "nav.group.auto", icon: Zap, items: [
      { view: "agents", label: "nav.agents", icon: Bot },
      { view: "log", label: "nav.log", icon: ScrollText },
    ],
  },
  {
    id: "sys", label: "nav.group.settings", icon: Settings2, items: [
      { view: "connections", label: "nav.connections", icon: Plug },
      { view: "settings", label: "nav.settings", icon: Settings2 },
    ],
  },
];

export function groupOf(view: View): NavGroup {
  return NAV.find((group) => group.items.some((item) => item.view === view)) ?? NAV[0]!;
}
