import { useLanguageChoice, setLanguage, t, useLanguage, type Choice } from "../i18n";
import { Seg } from "../ui";

export function LanguagePicker() {
  const choice = useLanguageChoice();
  useLanguage();
  return (
    <Seg<Choice>
      label={t("lang.label")}
      value={choice}
      onChange={setLanguage}
      options={[["system", t("lang.system")], ["de", "Deutsch"], ["en", "English"]]}
    />
  );
}
