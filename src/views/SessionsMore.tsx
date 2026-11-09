import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, History, Play, Plus, RotateCcw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { dateTime } from "../format";
import { t, type Key } from "../i18n";
import { go } from "../router";
import { toast } from "../shell/state";
import { Btn, Empty, Failure, Field, Modal, SearchField, Seg, Skeleton } from "../ui";
import { Select } from "../ui/select";

type Node = Schemas["Node"];
type Past = Schemas["HistoryEntry"];
type Skill = Schemas["StoredSkill"];

export function useHistory(query: string) {
  return useQuery({
    queryKey: ["sessions", "history", query],
    queryFn: () => must(api.GET("/sessions/history", { params: { query: { q: query || undefined, limit: 200 } } })),
  });
}

export function useLocalSkills() {
  return useQuery({ queryKey: ["sessions", "skills"], queryFn: () => must(api.GET("/sessions/skills")) });
}

function useLaunch(onDone: () => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["NewLaunch"]) => must(api.POST("/sessions/launch", { body })),
    onSuccess: () => {
      toast(t("sessions.launched"));
      void client.invalidateQueries({ queryKey: ["sessions"] });
      onDone();
    },
  });
}

/** The last part of a folder, as a name. */
export function folderName(path: string) {
  return path.replace(/\/+$/, "").split("/").pop() || path;
}

function Prompt({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <label className="sm-ta">
      <span>{label}</span>
      <textarea rows={5} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NodePick({ nodes, value, onChange }: { nodes: Node[]; value: string; onChange: (id: string) => void }) {
  if (nodes.length < 2) return null;
  return <Select label={t("sessions.machine")} value={value} onChange={onChange} options={nodes.map((node) => [node.id, node.name] as const)} />;
}

/** Starts a new Claude Code session on a machine. */
export function NewSessionModal({ nodes, folders, onClose }: { nodes: Node[]; folders: string[]; onClose: () => void }) {
  const [node, setNode] = useState(nodes[0]?.id ?? "");
  const [cwd, setCwd] = useState(folders[0] ?? "");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const launch = useLaunch(onClose);
  const valid = node && cwd.trim().startsWith("/") && prompt.trim();
  return (
    <Modal
      wide
      title={t("sessions.newTitle")}
      sub={t("sessions.newHint")}
      onClose={onClose}
      actions={
        <>
          <Btn onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn variant="primary" disabled={!valid || launch.isPending} onClick={() => launch.mutate({ node, cwd: cwd.trim(), prompt: prompt.trim(), model: model.trim() || null })}>
            <Play />
            {t("sessions.start")}
          </Btn>
        </>
      }
    >
      <div className="lay-form">
        <NodePick nodes={nodes} value={node} onChange={setNode} />
        <Field value={cwd} onChange={setCwd} label={t("sessions.folder")} placeholder={t("sessions.folderHint")} />
        {folders.length > 0 && (
          <div className="lay-chips">
            {folders.slice(0, 12).map((folder) => (
              <Btn key={folder} size="sm" variant={cwd === folder ? "primary" : ""} onClick={() => setCwd(folder)}>{folderName(folder)}</Btn>
            ))}
          </div>
        )}
        <Prompt value={prompt} onChange={setPrompt} label={t("sessions.instruction")} />
        <Field value={model} onChange={setModel} label={t("sessions.model")} placeholder={t("sessions.modelHint")} />
        <Failure error={launch.error} />
      </div>
    </Modal>
  );
}

/** Continues a past session with a new instruction. */
function ResumeModal({ past, onClose }: { past: Past; onClose: () => void }) {
  const [prompt, setPrompt] = useState("");
  const launch = useLaunch(onClose);
  return (
    <Modal
      title={t("sessions.resumeTitle", { project: past.project })}
      sub={past.first_prompt ?? undefined}
      onClose={onClose}
      actions={
        <>
          <Btn onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn
            variant="primary"
            disabled={!prompt.trim() || !past.cwd || launch.isPending}
            onClick={() => launch.mutate({ node: past.node_id, cwd: past.cwd ?? "", prompt: prompt.trim(), resume: past.session_id })}
          >
            <RotateCcw />
            {t("sessions.resume")}
          </Btn>
        </>
      }
    >
      <div className="lay-form">
        <Prompt value={prompt} onChange={setPrompt} label={t("sessions.instruction")} />
        {!past.cwd && <small className="faint">{t("sessions.noFolder")}</small>}
        <Failure error={launch.error} />
      </div>
    </Modal>
  );
}

/** Past sessions of the machines, to continue. Live ones are left out. */
export function HistoryView({ live }: { live: Set<string> }) {
  const [query, setQuery] = useState("");
  const history = useHistory(query.trim());
  const [resuming, setResuming] = useState<Past | null>(null);
  const shown = (history.data ?? []).filter((past) => !live.has(past.session_id));
  return (
    <div className="cl-ov">
      <div className="z-hd">
        <div>
          <h2>{t("sessions.history")}</h2>
          <p>{t("sessions.historyLead")}</p>
        </div>
      </div>
      <SearchField value={query} onChange={setQuery} placeholder={t("sessions.historySearch")} />
      {history.isPending ? (
        <Skeleton count={6} />
      ) : history.isError ? (
        <Failure error={history.error} />
      ) : shown.length === 0 ? (
        <Empty icon={<History />} title={t("sessions.historyEmpty")} sub={t("sessions.historyEmptyHint")} />
      ) : (
        <div className="sm-list">
          {shown.map((past) => (
            <div key={`${past.node_id}:${past.session_id}`} className="sm-row">
              <div className="grow">
                <b>{past.project}</b>
                {past.branch && <span className="mono faint"> · {past.branch}</span>}
                <p className="clip">{past.first_prompt ?? t("sessions.noPrompt")}</p>
                <small className="faint">{t("sessions.historyMeta", { when: dateTime(past.last_active_at), count: past.messages })}</small>
              </div>
              <Btn size="sm" onClick={() => setResuming(past)}>
                <RotateCcw />
                {t("sessions.resume")}
              </Btn>
            </div>
          ))}
        </div>
      )}
      {resuming && <ResumeModal past={resuming} onClose={() => setResuming(null)} />}
    </div>
  );
}

type When = "daily" | "weekly" | "cron";
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

/** A cron expression for a daily or weekly time such as `08:30`. */
export function cronOf(when: When, at: string, day: string, cron: string) {
  if (when === "cron") return cron.trim();
  const [hour, minute] = at.split(":").map((part) => Number(part) || 0);
  return when === "daily" ? `${minute} ${hour} * * *` : `${minute} ${hour} * * ${day}`;
}

/** The automation file that launches a skill on a machine. */
export function skillAutomation(skill: Skill, node: string, cron: string, prompt: string) {
  const id = `skill-${skill.name}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const cwd = skill.project ?? "~";
  return [
    "---",
    `name: ${JSON.stringify(`${skill.name} (${node})`)}`,
    `id: ${id}`,
    "trigger:",
    `  cron: ${JSON.stringify(cron)}`,
    "steps:",
    "  - launch:",
    `      node: ${JSON.stringify(node)}`,
    `      cwd: ${JSON.stringify(cwd)}`,
    `      prompt: ${JSON.stringify(prompt)}`,
    "---",
    skill.description ?? `Runs the skill ${skill.name}.`,
    "",
  ].join("\n");
}

function ScheduleModal({ skill, node, onClose }: { skill: Skill; node: Node; onClose: () => void }) {
  const client = useQueryClient();
  const [when, setWhen] = useState<When>("daily");
  const [at, setAt] = useState("08:00");
  const [day, setDay] = useState<string>("MON");
  const [cron, setCron] = useState("0 8 * * MON-FRI");
  const [prompt, setPrompt] = useState(t("sessions.skillPrompt", { name: skill.name }));
  const save = useMutation({
    mutationFn: () => must(api.POST("/automations", { body: { source: skillAutomation(skill, node.name, cronOf(when, at, day, cron), prompt.trim()) } })),
    onSuccess: () => {
      toast(t("sessions.scheduled", { name: skill.name }));
      void client.invalidateQueries({ queryKey: ["automations"] });
      onClose();
    },
  });
  return (
    <Modal
      title={t("sessions.scheduleTitle", { name: skill.name })}
      sub={t("sessions.scheduleHint", { machine: node.name })}
      onClose={onClose}
      actions={
        <>
          <Btn onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn variant="primary" disabled={!prompt.trim() || save.isPending} onClick={() => save.mutate()}>
            <CalendarClock />
            {t("sessions.schedule")}
          </Btn>
        </>
      }
    >
      <div className="lay-form">
        <Seg<When> label={t("sessions.when")} value={when} onChange={setWhen} options={[["daily", t("sessions.daily")], ["weekly", t("sessions.weekly")], ["cron", "Cron"]]} />
        {when === "cron" ? (
          <Field value={cron} onChange={setCron} label="Cron" />
        ) : (
          <div className="lay-two">
            <Field value={at} onChange={setAt} label={t("sessions.at")} type="time" />
            {when === "weekly" && (
              <Select label={t("sessions.day")} value={day} onChange={setDay} options={DAYS.map((name, index) => [name, t(`sessions.weekday.${index}` as Key)] as const)} />
            )}
          </div>
        )}
        <Prompt value={prompt} onChange={setPrompt} label={t("sessions.instruction")} />
        <Failure error={save.error} />
      </div>
    </Modal>
  );
}

/** Skills on the machines, by project, to run now or on a schedule. */
export function SkillsView({ nodes }: { nodes: Node[] }) {
  const skills = useLocalSkills();
  const [query, setQuery] = useState("");
  const [scheduling, setScheduling] = useState<Skill | null>(null);
  const launch = useLaunch(() => go("sessions"));
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const map = new Map<string, Skill[]>();
    for (const skill of skills.data ?? []) {
      if (needle && !`${skill.name} ${skill.description ?? ""} ${skill.project ?? ""}`.toLowerCase().includes(needle)) continue;
      const key = skill.project ?? "";
      map.set(key, [...(map.get(key) ?? []), skill]);
    }
    return [...map.entries()];
  }, [skills.data, query]);
  const nodeOf = (skill: Skill) => nodes.find((node) => node.id === skill.node_id);
  return (
    <div className="cl-ov">
      <div className="z-hd">
        <div>
          <h2>{t("sessions.skills")}</h2>
          <p>{t("sessions.skillsLead")}</p>
        </div>
      </div>
      <SearchField value={query} onChange={setQuery} placeholder={t("sessions.skillsSearch")} />
      {skills.isPending ? (
        <Skeleton count={6} />
      ) : skills.isError ? (
        <Failure error={skills.error} />
      ) : groups.length === 0 ? (
        <Empty icon={<Sparkles />} title={t("sessions.skillsEmpty")} sub={t("sessions.skillsEmptyHint")} />
      ) : (
        groups.map(([project, list]) => (
          <section key={project} className="sm-group">
            <div className="ch2">{project ? folderName(project) : t("sessions.ownSkills")}<em>{list.length}</em></div>
            <div className="sm-list">
              {list.map((skill) => {
                const node = nodeOf(skill);
                return (
                  <div key={`${skill.node_id}:${skill.path}`} className="sm-row">
                    <div className="grow">
                      <b>{skill.name}</b>
                      {skill.description && <p>{skill.description}</p>}
                    </div>
                    <Btn
                      size="sm"
                      disabled={!node || launch.isPending}
                      onClick={() => node && launch.mutate({ node: node.id, cwd: skill.project ?? "~", prompt: t("sessions.skillPrompt", { name: skill.name }) })}
                    >
                      <Play />
                      {t("sessions.runNow")}
                    </Btn>
                    <Btn size="sm" disabled={!node} onClick={() => setScheduling(skill)}>
                      <CalendarClock />
                      {t("sessions.planAsAgent")}
                    </Btn>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
      <Failure error={launch.error} />
      {scheduling && nodeOf(scheduling) && <ScheduleModal skill={scheduling} node={nodeOf(scheduling)!} onClose={() => setScheduling(null)} />}
    </div>
  );
}

/** The button that opens a new session, for the rail. */
export function NewSessionButton({ nodes }: { nodes: Node[] }) {
  const [open, setOpen] = useState(false);
  const history = useHistory("");
  const skills = useLocalSkills();
  const folders = useMemo(() => {
    const seen = new Set<string>();
    for (const past of history.data ?? []) if (past.cwd) seen.add(past.cwd);
    for (const skill of skills.data ?? []) if (skill.project) seen.add(skill.project);
    return [...seen];
  }, [history.data, skills.data]);
  if (!nodes.length) return null;
  return (
    <>
      <Btn size="sm" variant="primary" onClick={() => setOpen(true)} aria-label={t("sessions.new")}>
        <Plus />
        {t("sessions.new")}
      </Btn>
      {open && <NewSessionModal nodes={nodes} folders={folders} onClose={() => setOpen(false)} />}
    </>
  );
}
