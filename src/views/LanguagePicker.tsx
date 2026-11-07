import { languageChoice, setLanguage, t, useLanguage, type Choice } from "../i18n";
import { Seg } from "../ui";

export function LanguagePicker() {
  useLanguage();
  return (
    <Seg<Choice>
      label={t("lang.label")}
      value={languageChoice()}
      onChange={setLanguage}
      options={[["system", t("lang.system")], ["de", "Deutsch"], ["en", "English"]]}
    />
  );
}
