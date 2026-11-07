import { AlarmClock } from "lucide-react";
import { language, t } from "../i18n";
import { Btn, Menu } from "../ui";

export type Later = { key: "hour" | "evening" | "tomorrow" | "monday"; until: Date };

/** When "later" means: in an hour, this evening at six, tomorrow at eight, Monday at eight. */
export function laterOptions(now = new Date()): Later[] {
  const at = (days: number, hours: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hours, 0, 0, 0);
  const evening = at(0, 18);
  const daysToMonday = ((8 - now.getDay()) % 7) || 7;
  const options: Later[] = [{ key: "hour", until: new Date(now.getTime() + 3_600_000) }];
  if (evening.getTime() - now.getTime() > 2 * 3_600_000) options.push({ key: "evening", until: evening });
  options.push({ key: "tomorrow", until: at(1, 8) }, { key: "monday", until: at(daysToMonday, 8) });
  return options;
}

/** A "later" button with its choices. `onPick` gets the time to hide until. */
export function LaterMenu({ onPick, size, kbd }: { onPick: (until: Date) => void; size?: "sm" | "xs"; kbd?: string }) {
  const options = laterOptions();
  return (
    <Menu
      label={t("later.label")}
      items={options.map((option) => ({
        label: `${t(`later.${option.key}`)} · ${option.until.toLocaleString(language() === "de" ? "de-DE" : "en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`,
        run: () => onPick(option.until),
      }))}
      trigger={(open, isOpen) => (
        <Btn size={size} kbd={kbd} onClick={open} aria-expanded={isOpen} title={t("later.label")}>
          <AlarmClock />
          {t("later.label")}
        </Btn>
      )}
    />
  );
}
