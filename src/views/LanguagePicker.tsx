import { languageChoice, setLanguage, t, useLanguage, type Choice } from "../i18n";

export function LanguagePicker() {
  useLanguage();
  return (
    <label className="lab">
      {t("lang.label")}
      <select
        className="field"
        value={languageChoice()}
        onChange={(event) => setLanguage(event.target.value as Choice)}
      >
        <option value="system">{t("lang.system")}</option>
        <option value="de">Deutsch</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
