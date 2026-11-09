import { useMutation, useQuery } from "@tanstack/react-query";
import { PencilLine, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { t } from "../i18n";
import { Btn, Failure, Field, Modal, Skeleton } from "../ui";
import { LayerSwitch, TargetPicker, useManage, useRefresh, type Layer, type Target } from "./layers";
import { Group, SettingRow } from "./settingsKit";

type Skill = Schemas["SkillInfo"];

const TEMPLATE = (name: string) => `---\nname: ${name}\ndescription: \n---\n`;

function useSkills() {
  return useQuery({ queryKey: ["settings", "skills"], queryFn: () => must(api.GET("/skills")) });
}

function SkillModal({ existing, onClose }: { existing?: Skill; onClose: () => void }) {
  const manage = useManage();
  const refresh = useRefresh();
  const [target, setTarget] = useState<Target>(existing?.layer === "tenant" ? "tenant" : "me");
  const [name, setName] = useState(existing?.name ?? "");
  const [source, setSource] = useState(existing?.source ?? "");
  const save = useMutation({
    mutationFn: () => must(api.PUT("/settings/{layer}/skills/{name}", { params: { path: { layer: manage ? target : "me", name } }, body: { source: source || TEMPLATE(name) } })),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });
  return (
    <Modal
      wide
      title={existing ? existing.name : t("skills.add")}
      sub={t("skills.hint")}
      onClose={onClose}
      actions={
        <>
          <Btn onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn variant="primary" disabled={!name || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</Btn>
        </>
      }
    >
      <div className="lay-form">
        {!existing && <TargetPicker value={target} onChange={setTarget} />}
        <Field value={name} disabled={!!existing} onChange={(next) => { setName(next); if (!source || source === TEMPLATE(name)) setSource(TEMPLATE(next)); }} label={t("skills.name")} placeholder={t("skills.name")} />
        <textarea className="ta mono lay-ta" aria-label={t("skills.file")} spellCheck={false} rows={12} value={source} onChange={(event) => setSource(event.target.value)} />
        <Failure error={save.error} />
      </div>
    </Modal>
  );
}

/** Skills: built-in ones of the server, and those of the workspace and the person. */
export function SkillSettings() {
  const skills = useSkills();
  const manage = useManage();
  const refresh = useRefresh();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);
  const remove = useMutation({
    mutationFn: (skill: Skill) => must(api.DELETE("/settings/{layer}/skills/{name}", { params: { path: { layer: skill.layer === "personal" ? "me" : "tenant", name: skill.name } } })),
    onSuccess: refresh,
  });
  if (skills.isPending) return <Skeleton count={3} height={52} />;
  return (
    <>
      <Group title={t("settings.skills")} hint={t("skills.lead")}>
        {(skills.data ?? []).map((skill) => {
          const own = skill.layer === "personal" || (skill.layer === "tenant" && manage);
          return (
            <SettingRow key={skill.name} title={skill.name} sub={skill.description}>
              <LayerSwitch kind="skills" id={skill.name} layer={(skill.layer ?? "instance") as Layer} disabledBy={skill.disabled_by as Layer | null | undefined} />
              {own && <Btn size="sm" icon variant="ghost" aria-label={t("skills.edit", { name: skill.name })} onClick={() => setEditing(skill)}><PencilLine /></Btn>}
              {own && <Btn size="sm" icon variant="ghost" aria-label={t("skills.remove", { name: skill.name })} onClick={() => remove.mutate(skill)}><Trash2 /></Btn>}
            </SettingRow>
          );
        })}
        {skills.data?.length === 0 && <p className="st-emp">{t("skills.none")}</p>}
        <Failure error={skills.error ?? remove.error} />
      </Group>
      <div className="lay-cta"><Btn variant="primary" onClick={() => setAdding(true)}><Plus />{t("skills.add")}</Btn></div>
      {adding && <SkillModal onClose={() => setAdding(false)} />}
      {editing && <SkillModal existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
