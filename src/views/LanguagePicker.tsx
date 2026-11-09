import germany from "circle-flags/flags/de.svg";
import britain from "circle-flags/flags/gb.svg";
import type { ReactNode } from "react";
import { setLanguage, t, useLanguage, type Language } from "../i18n";
import { Select } from "../ui/select";

const flag = (src: string) => <img className="flag" src={src} alt="" width={18} height={18} />;

const option = (mark: ReactNode, name: string) => <span className="lang-o">{mark}{name}</span>;

export function LanguagePicker() {
  const current = useLanguage();
  return (
    <Select<Language>
      width={148}
      label={t("lang.label")}
      value={current}
      onChange={setLanguage}
      options={[
        ["de", option(flag(germany), "Deutsch")],
        ["en", option(flag(britain), "English")],
      ]}
    />
  );
}
