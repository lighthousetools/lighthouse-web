import { ArrowLeft, Check, CircleDashed, ExternalLink, GitBranch, Loader2, MessageSquare, Rocket, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { dayTime } from "../format";
import { t, useLanguage } from "../i18n";
import { go, useRoute } from "../router";
import { Avatar, Badge, Btn, Empty, Failure, Seg, ServiceIcon, Skeleton, type Tone } from "../ui";
import { DiffViewer, parseUnifiedDiff, type DiffFile } from "../ui/diff";
import { Markdown } from "../ui/markdown";
import { Freshness, NoSource, canDo, field, has, openItem, useAction, useDomains, useItem, useItems, useSources, type Item } from "./connected";
import { age } from "./Ready";
import "./code.css";

type Tab = "all" | "review" | "mine" | "failing";

export const prNumber = (item: Item) => field(item, "number") ?? item.external_id.split("/").pop() ?? item.external_id;
const repoOf = (item: Item) => field(item, "repo") ?? field(item, "repository") ?? field(item, "base_repo") ?? item.source;
const branchOf = (item: Item) => field(item, "head") ?? field(item, "branch") ?? field(item, "head_ref");
const num = (item: Item, key: string) => Number(field(item, key) ?? 0) || 0;

/** The state of a pull request's checks: ok, running or failing, from its check children or its flags. */
export function checkState(item: Pick<Item, "flags">, checks: Pick<Item, "state" | "flags">[] = []): "ok" | "run" | "fail" | "none" {
  if (item.flags.includes("failed") || checks.some((check) => check.flags.includes("failed"))) return "fail";
  if (checks.some((check) => ["pending", "queued", "in_progress", "running"].includes((check.state ?? "").toLowerCase()))) return "run";
  if (checks.length) return "ok";
  return "none";
}

/** A changed file from a pull request, with GitHub's `patch` turned into hunks. */
export function fileDiff(file: Item): DiffFile {
  const path = field(file, "filename") ?? file.title ?? file.external_id;
  const patch = field(file, "patch") ?? "";
  const parsed = patch ? parseUnifiedDiff(`+++ b/${path}\n${patch}`)[0] : undefined;
  return parsed ?? { path, add: num(file, "additions"), del: num(file, "deletions"), hunks: [] };
}

function standOf(item: Item): { label: string; tone: Tone } {
  if (has(item, "review_requested")) return { label: t("code.stand.waiting"), tone: "warn" };
  const state = (item.state ?? "").toLowerCase();
  if (state === "merged") return { label: t("code.stand.merged"), tone: "vio" };
  if (state === "closed") return { label: t("code.stand.closed"), tone: "" };
  if (field(item, "draft") === "true") return { label: t("code.stand.draft"), tone: "" };
  return { label: t("code.stand.review"), tone: "info" };
}

function ChecksBadge({ state }: { state: ReturnType<typeof checkState> }) {
  if (state === "none") return <span className="faint">—</span>;
  return (
    <span className={`cd-ci ${state}`}>
      {state === "ok" ? <Check size={11} /> : state === "run" ? <Loader2 size={11} className="spin" /> : <X size={11} />}
      {t(`code.checks.${state}`)}
    </span>
  );
}

function Detail({ id }: { id: string }) {
  const detail = useItem(id);
  const sources = useSources();
  const action = useAction();
  const [split, setSplit] = useState<"unified" | "split">("unified");
  const [comment, setComment] = useState("");
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !(event.target as HTMLElement).closest("input, textarea") && !document.querySelector(".palbg, .modalbg, .menu")) go("code");
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  if (!detail.data) return <div className="cd-d"><div className="cd-dm">{detail.isPending ? <Skeleton count={5} /> : <Failure error={detail.error} />}</div></div>;
  const pr = detail.data.item;
  const children = detail.data.children;
  // Checks that mention a deployment or preview carry the `deployment` flag and get a section of their own.
  const deployments = children.filter((child) => child.kind === "check" && has(child, "deployment"));
  const checks = children.filter((child) => child.kind === "check" && !has(child, "deployment"));
  const files = children.filter((child) => child.kind === "file").map(fileDiff);
  const reviews = children.filter((child) => child.kind === "review" || child.kind === "comment");
  const state = checkState(pr, checks);
  const canApprove = canDo(sources.data, "code", "approve", pr.source);
  const canComment = canDo(sources.data, "code", "comment", pr.source);
  return (
    <div className="cd-d">
      <div className="cd-dh">
        <Btn icon size="xs" variant="ghost" aria-label={t("common.back")} onClick={() => go("code")}><ArrowLeft /></Btn>
        <span className="mono faint">#{prNumber(pr)}</span>
        <h2 className="clip">{pr.title}</h2>
        <Badge tone={standOf(pr).tone}>{standOf(pr).label}</Badge>
        <span className="grow" />
        <Seg label={t("code.diffMode")} value={split} onChange={setSplit} options={[["unified", t("code.unified")], ["split", t("code.split")]]} />
        {pr.url && <Btn size="sm" variant="ghost" onClick={() => openItem(pr)}><ExternalLink />{t("connected.openIn")}</Btn>}
        {canApprove && (
          <Btn size="sm" variant="primary" disabled={action.isPending} onClick={() => action.mutate({ item: pr.id, action: "approve", input: {} })}>
            <Check />{t("code.approve")}
          </Btn>
        )}
      </div>
      <div className="cd-db">
        <div className="cd-dm">
          {files.length ? (
            <DiffViewer files={files} sideBySide={split === "split"} />
          ) : (
            <Empty title={t("code.noFiles")} sub={t("code.noFilesHint")} />
          )}
        </div>
        <aside className="cd-ds">
          <section>
            <div className="sect">{t("code.about")}</div>
            <div className="cd-rv"><Avatar name={pr.author ?? "?"} size={20} />{pr.author}</div>
            <div className="cd-rv faint" style={{ marginTop: 6 }}><ServiceIcon name="github" size={14} />{repoOf(pr)}</div>
            {branchOf(pr) && <div className="cd-rv faint" style={{ marginTop: 6 }}><GitBranch size={13} /><span className="mono">{branchOf(pr)}</span></div>}
            {pr.summary && <div style={{ marginTop: 10, fontSize: 13 }}><Markdown source={pr.summary} /></div>}
          </section>
          <section>
            <div className="sect">{t("code.checksTitle")} <span className="grow" /><ChecksBadge state={state} /></div>
            <ul className="cd-chk">
              {checks.map((check) => {
                const failed = has(check, "failed");
                const running = ["pending", "queued", "in_progress", "running"].includes((check.state ?? "").toLowerCase());
                return (
                  <li key={check.id}>
                    {failed ? <X size={13} className="down" /> : running ? <CircleDashed size={13} className="faint" /> : <Check size={13} className="up" />}
                    <button type="button" className="cd-cr clip" disabled={!check.url} onClick={() => openItem(check)}>{check.title}</button>
                  </li>
                );
              })}
              {checks.length === 0 && <li className="faint">{t("code.noChecks")}</li>}
            </ul>
          </section>
          {deployments.length > 0 && (
            <section>
              <div className="sect">{t("code.deployments")}<small>{deployments.length}</small></div>
              <ul className="cd-chk">
                {deployments.map((deployment) => {
                  const failed = has(deployment, "failed");
                  const running = ["pending", "queued", "in_progress", "running"].includes((deployment.state ?? "").toLowerCase());
                  return (
                    <li key={deployment.id}>
                      {failed ? <X size={13} className="down" /> : running ? <CircleDashed size={13} className="faint" /> : <Rocket size={13} className="up" />}
                      <button type="button" className="cd-cr clip" disabled={!deployment.url} title={deployment.url ?? undefined} onClick={() => openItem(deployment)}>{deployment.title}</button>
                      {deployment.url && !failed && !running && <Btn size="xs" variant="ghost" onClick={() => openItem(deployment)}><ExternalLink />{t("code.openPreview")}</Btn>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <section>
            <div className="sect">{t("code.reviews")}<small>{reviews.length}</small></div>
            {reviews.map((review) => (
              <div key={review.id} className="cd-msg">
                <Avatar name={review.author ?? "?"} size={20} />
                <div className="grow">
                  <div className="h"><b>{review.author}</b><small>{review.state ?? ""} {review.occurred_at ? dayTime(review.occurred_at) : ""}</small></div>
                  {(review.summary || field(review, "body")) && <p>{field(review, "body") ?? review.summary}</p>}
                </div>
              </div>
            ))}
            {reviews.length === 0 && <p className="faint" style={{ fontSize: 12 }}>{t("code.noReviews")}</p>}
            {canComment && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (comment.trim()) action.mutate({ item: pr.id, action: "comment", input: { body: comment.trim() } }, { onSuccess: () => setComment("") });
                }}
                style={{ marginTop: 8 }}
              >
                <label className="field"><MessageSquare /><input aria-label={t("code.comment")} placeholder={t("code.commentPlaceholder")} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
                <p className="faint" style={{ fontSize: 11, marginTop: 4 }}>{t("code.commentHint")}</p>
              </form>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

export function Code() {
  useLanguage();
  const route = useRoute();
  const domains = useDomains();
  const sources = useSources();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const pulls = useItems("/pulls", { limit: 300 }, domains.has("code"));
  const all = useMemo(() => (pulls.data?.items ?? []).filter((item) => item.kind === "pull_request"), [pulls.data]);
  const needle = query.trim().toLowerCase();
  const match = (item: Item) =>
    tab === "all" || (tab === "review" ? has(item, "review_requested") : tab === "mine" ? has(item, "mine") : has(item, "failed"));
  const shown = all.filter((item) => match(item) && (!needle || `${item.title} ${repoOf(item)} ${item.author} ${prNumber(item)}`.toLowerCase().includes(needle)));
  if (!sources.isPending && !domains.has("code")) return <div className="page"><NoSource domain="code" /></div>;
  if (route.param) return <div className="page flush"><Detail key={route.param} id={route.param} /></div>;
  const count = (value: Tab) => all.filter((item) => value === "all" || (value === "review" ? has(item, "review_requested") : value === "mine" ? has(item, "mine") : has(item, "failed"))).length;
  const repos = new Set(all.map(repoOf)).size;
  return (
    <div className="page">
      <div className="cdv">
        <header className="ph">
          <div className="grow">
            <h1>{t("nav.code")}</h1>
            <p>{t("code.lead", { count: all.length, repos, review: count("review"), failing: count("failing") })}</p>
          </div>
          <div className="acts"><Freshness domain="code" /></div>
        </header>
        <div className="cd-fil">
          <Seg<Tab>
            label={t("code.filter")}
            value={tab}
            onChange={setTab}
            options={[["all", t("approvals.filterAll"), count("all")], ["review", t("code.tab.review"), count("review")], ["mine", t("code.tab.mine"), count("mine")], ["failing", t("code.tab.failing"), count("failing")]]}
          />
          <span className="grow" />
          <div className="cd-search"><label className="field"><Search /><input aria-label={t("ui.search")} placeholder={t("ui.search")} value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        </div>
        <Failure error={pulls.error} />
        {pulls.isPending ? (
          <Skeleton count={6} height={52} />
        ) : shown.length === 0 ? (
          <div className="card"><Empty title={all.length ? t("approvals.nothingHere") : t("code.empty")} sub={all.length ? undefined : t("code.emptyHint")} /></div>
        ) : (
          <div className="card cd-t">
            <div className="cd-th">
              <span>PR</span><span>{t("code.title")}</span><span>{t("code.by")}</span><span>{t("code.stand")}</span><span>{t("code.checksTitle")}</span><span className="r">{t("code.change")}</span><span className="r">{t("code.age")}</span>
            </div>
            {shown.map((item) => {
              const stand = standOf(item);
              return (
                <div key={item.id} className={`cd-tr ${item.state === "closed" ? "off" : ""}`} role="button" tabIndex={0} onClick={() => go("code", item.id)} onKeyDown={(event) => event.key === "Enter" && go("code", item.id)}>
                  <span className="mono id tn">#{prNumber(item)}</span>
                  <span className="tt">
                    <b className="clip">{item.title}</b>
                    <span className="meta faint clip" style={{ display: "flex", gap: 8, fontSize: 12 }}>
                      <ServiceIcon name="github" size={12} />{repoOf(item)}
                      {branchOf(item) && <><GitBranch size={11} />{branchOf(item)}</>}
                    </span>
                  </span>
                  <span className="clip" style={{ display: "flex", alignItems: "center", gap: 6 }}><Avatar name={item.author ?? "?"} size={18} />{item.author}</span>
                  <span><Badge tone={stand.tone}>{stand.label}</Badge></span>
                  <span><ChecksBadge state={checkState(item)} /></span>
                  <span className="r tn"><span className="up">+{num(item, "additions")}</span> <span className="down">−{num(item, "deletions")}</span></span>
                  <span className="r faint tn">{age(item.occurred_at ?? item.synced_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
