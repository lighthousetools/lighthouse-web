import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, X } from "lucide-react";
import { useState } from "react";
import { api, must, type Schemas } from "../api/client";
import { useMe } from "../data";
import { language, t } from "../i18n";
import { go } from "../router";
import { toast } from "../shell/state";
import { AreaChart, Btn, Card, cx, Empty, Page, PageHeader, Seg, Skeleton, initials } from "../ui";
import { addDays, startOfDay, weekdayOf } from "./postdates";
import { metricsOf, pillarName, titleOf, useBranding, usePillars, usePosts, type Post } from "./publishing";
import "./branding.css";

const locale = () => (language() === "de" ? "de-DE" : "en-GB");
const number = (value: number) => Math.round(value).toLocaleString(locale());
type Range = "30" | "90" | "365";
type Metric = "impressions" | "reactions" | "followers" | "icp_share";
/** A share as percent, whether it came as 0.37 or as 37. */
export const share = (value: number) => (value <= 1 ? value * 100 : value);
const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

/** A metric over the range, by the day the post went out: running totals, or the latest follower count. */
export function series(posts: Post[], metric: Metric, days: number, today = new Date()) {
  const start = addDays(startOfDay(today), 1 - days);
  const values = Array.from({ length: days }, () => 0);
  for (const post of posts) {
    if (post.status !== "published" || !post.published_at) continue;
    const index = Math.floor((new Date(post.published_at).getTime() - start.getTime()) / 86_400_000);
    if (index < 0 || index >= days) continue;
    const value = metricsOf(post)[metric] ?? 0;
    values[index] = metric === "followers" ? Math.max(values[index]!, value) : values[index]! + value;
  }
  // Totals grow over the range; followers carry their last count forward.
  for (let index = 1; index < values.length; index++) {
    values[index] = metric === "followers" ? values[index]! || values[index - 1]! : values[index]! + values[index - 1]!;
  }
  const label = (index: number) => addDays(start, index).toLocaleDateString(locale(), { day: "numeric", month: "short" });
  return { values, labels: [0, 1, 2, 3].map((part) => label(Math.round((part / 3) * (days - 1)))) };
}

/** Average reactions by weekday and hour of the posts that went out. */
export function heat(posts: Post[]) {
  const sum = new Map<string, { total: number; count: number }>();
  for (const post of posts) {
    if (post.status !== "published" || !post.published_at) continue;
    const at = new Date(post.published_at);
    const key = `${weekdayOf(at)}:${at.getHours()}`;
    const cell = sum.get(key) ?? { total: 0, count: 0 };
    cell.total += metricsOf(post).reactions ?? 0;
    cell.count++;
    sum.set(key, cell);
  }
  return (weekday: number, hour: number) => {
    const cell = sum.get(`${weekday}:${hour}`);
    return cell ? cell.total / cell.count : 0;
  };
}

function Chips({ values, onChange, placeholder }: { values: string[]; onChange: (values: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="xp" style={{ alignItems: "center" }}>
      {values.map((value) => (
        <button type="button" key={value} onClick={() => onChange(values.filter((item) => item !== value))} title={t("branding.remove")}>{value} <X size={10} /></button>
      ))}
      <input className="enn" style={{ width: 160 }} aria-label={placeholder} placeholder={placeholder} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Enter" && draft.trim() && !values.includes(draft.trim())) {
          onChange([...values, draft.trim()]);
          setDraft("");
        }
      }} />
    </div>
  );
}

function Profile({ profile }: { profile: Schemas["BrandProfile"] }) {
  const client = useQueryClient();
  const save = (patch: Partial<Schemas["BrandProfile"]>) =>
    must(api.PUT("/branding", { body: { ...profile, ...patch } }))
      .then(() => {
        toast(t("branding.saved"));
        return client.invalidateQueries({ queryKey: ["branding"] });
      }, (error: Error) => toast(error.message, "bad"));
  const field = (key: "headline" | "bio" | "audience" | "voice", rows = 2) => (
    <div className="bvr" key={key}>
      <div><b>{t(`branding.${key}`)}</b><span>{t(`branding.${key}Hint`)}</span></div>
      <textarea className="ecm" rows={rows} aria-label={t(`branding.${key}`)} defaultValue={profile[key] ?? ""} placeholder={t(`branding.${key}Placeholder`)} onBlur={(event) => event.target.value !== (profile[key] ?? "") && void save({ [key]: event.target.value || null })} />
    </div>
  );
  return (
    <Card>
      <div className="bch"><h2>{t("branding.profile")}</h2><small>{profile.updated_at ? t("branding.updated", { date: new Date(profile.updated_at).toLocaleDateString(locale()) }) : t("branding.profileHint")}</small></div>
      <div className="bvo">
        {field("headline", 1)}
        {field("bio", 3)}
        {field("audience")}
        {field("voice", 3)}
      </div>
      <div className="bdos">
        <div><h4>{t("branding.topics")}</h4><Chips values={profile.topics} onChange={(topics) => void save({ topics })} placeholder={t("branding.addTopic")} /></div>
        <div><h4>{t("branding.avoid")}</h4><Chips values={profile.avoid} onChange={(avoid) => void save({ avoid })} placeholder={t("branding.addAvoid")} /></div>
      </div>
    </Card>
  );
}

export default function Branding() {
  const me = useMe();
  const branding = useBranding();
  const posts = usePosts();
  const pillars = usePillars();
  const [range, setRange] = useState<Range>("90");
  const [metric, setMetric] = useState<Metric>("impressions");
  if (branding.isLoading || posts.isLoading) return <Page><Skeleton count={4} height={120} /></Page>;
  const profile: Schemas["BrandProfile"] = branding.data ?? { topics: [], avoid: [], audience: null, bio: null, headline: null, updated_at: null, voice: null };
  const all = posts.data ?? [];
  const out = all.filter((post) => post.status === "published");
  const since = (days: number) => out.filter((post) => post.published_at && Date.now() - Date.parse(post.published_at) < days * 86_400_000);
  const last30 = since(30);
  const sum = (list: Post[], key: Metric) => list.reduce((total, post) => total + (metricsOf(post)[key] ?? 0), 0);
  const followers = Math.max(0, ...out.map((post) => metricsOf(post).followers ?? 0));
  const icp = out.filter((post) => metricsOf(post).icp_share != null);
  const best = Math.max(0, ...last30.map((post) => metricsOf(post).impressions ?? 0));
  const days = Number(range);
  const chart = series(all, metric, days);
  const kpis: [Metric, string, string, string][] = [
    ["impressions", t("posts.metric.impressions"), number(sum(last30, "impressions")), t("branding.in30")],
    ["reactions", t("posts.metric.reactions"), number(sum(last30, "reactions")), t("branding.in30")],
    ["followers", t("posts.metric.followers"), followers ? number(followers) : "–", t("branding.latest")],
    ["icp_share", t("posts.metric.icp_share"), icp.length ? `${number(share(sum(icp, "icp_share") / icp.length))} %` : "–", t("branding.average")],
  ];
  const mix = (pillars.data ?? []).map((pillar) => ({ pillar, out: out.filter((post) => post.pillar === pillar.id).length, planned: all.filter((post) => post.pillar === pillar.id && post.status !== "published").length }));
  const mixMax = Math.max(1, ...mix.map((row) => row.out + row.planned));
  const cell = heat(all);
  const heatMax = Math.max(0.0001, ...[1, 2, 3, 4, 5, 6, 7].flatMap((day) => HOURS.map((hour) => cell(day, hour))));
  const top = [...out].sort((a, b) => (metricsOf(b).impressions ?? 0) - (metricsOf(a).impressions ?? 0)).slice(0, 5);
  const weekdays = [1, 2, 3, 4, 5, 6, 7].map((day) => new Date(2024, 0, day).toLocaleDateString(locale(), { weekday: "short" }).replace(".", ""));
  const name = me.data?.name ?? "";

  return (
    <Page>
      <div className="bnd">
        <PageHeader title={t("nav.branding")} sub={t("branding.sub")} />
        <div className="bhero">
          <Card pad style={{ display: "flex", flexDirection: "column" }}>
            <div className="bprof"><span className="mdav">{initials(name) || "·"}</span><div className="grow"><h3>{name}</h3><p>{profile.headline ?? t("branding.noHeadline")}</p></div></div>
            <blockquote>{profile.bio?.split(/(?<=[.!?])\s/)[0] ?? t("branding.noBio")}</blockquote>
            <dl className="bfacts">
              <div><dt>{t("branding.posts30")}</dt><dd className="tn">{last30.length}</dd></div>
              <div><dt>{t("branding.bestReach")}</dt><dd className="tn">{best ? number(best) : "–"}</dd></div>
              <div><dt>{t("branding.planned")}</dt><dd className="tn">{all.filter((post) => post.status === "scheduled").length}</dd></div>
            </dl>
            <div style={{ marginTop: "auto", display: "flex", gap: "var(--s2)" }}><Btn size="sm" variant="ghost" onClick={() => go("posts")}>{t("nav.posts")}<ArrowRight /></Btn></div>
          </Card>
          <Card style={{ overflow: "hidden" }}>
            <div className="bkpi" role="tablist" aria-label={t("branding.metric")}>
              {kpis.map(([key, label, value, hint]) => (
                <button type="button" key={key} role="tab" aria-selected={metric === key} className={cx(metric === key && "on")} onClick={() => setMetric(key)}>
                  <span>{label}</span><b className="tn">{value}</b><em>{hint}</em>
                </button>
              ))}
            </div>
            <div className="bchart">
              <div className="brange"><Seg label={t("branding.range")} value={range} onChange={setRange} options={[["30", t("branding.days30")], ["90", t("branding.days90")], ["365", t("branding.months12")]]} /></div>
              {out.length ? <AreaChart data={chart.values} labels={chart.labels} height={170} format={number} /> : <Empty title={t("branding.noNumbers")} sub={t("branding.noNumbersSub")} action={<Btn size="sm" onClick={() => go("posts")}>{t("posts.import")}</Btn>} />}
            </div>
          </Card>
        </div>
        <div className="bgrid">
          <Profile profile={profile} />
          <div className="bstack">
            <Card style={{ display: "flex", flexDirection: "column" }}>
              <div className="bch"><h2>{t("branding.mix")}</h2><small className="tn">{t("branding.mixHint", { count: all.length })}</small></div>
              {mix.length ? (
                <>
                  <div className="bmix">
                    {mix.map((row) => (
                      <button type="button" key={row.pillar.id} onClick={() => go("posts")}>
                        <span className="clip">{row.pillar.name}</span>
                        <span className="bbar"><i style={{ width: `${(row.out / mixMax) * 100}%` }} /><u style={{ width: `${(row.planned / mixMax) * 100}%` }} /></span>
                        <span className="tn faint">{row.out} / {row.out + row.planned}</span>
                      </button>
                    ))}
                  </div>
                  <p className="bleg"><i />{t("branding.legendOut")}<u />{t("branding.legendPlanned")}</p>
                </>
              ) : <p className="bleg">{t("branding.noPillars")}</p>}
            </Card>
            <Card style={{ display: "flex", flexDirection: "column" }}>
              <div className="bch"><h2>{t("branding.bestTimes")}</h2><small>{t("branding.bestTimesHint")}</small></div>
              <div className="bheat">
                <div className="bhg" style={{ gridTemplateColumns: `24px repeat(${HOURS.length},minmax(0,1fr))` }}>
                  <span />
                  {HOURS.map((hour) => <span key={hour} className="hh tn">{hour}</span>)}
                  {weekdays.map((label, index) => (
                    <div key={label} style={{ display: "contents" }}>
                      <span className="brax-hd">{label}</span>
                      {HOURS.map((hour) => {
                        const value = cell(index + 1, hour);
                        return <span key={hour} className="hc" title={`${label} ${hour}:00 · ${number(value)}`} style={{ background: `color-mix(in srgb, var(--chart) ${Math.round(6 + (value / heatMax) * 86)}%, var(--wash))` }} />;
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
            <Card>
              <div className="bch"><h2>{t("branding.top")}</h2><small>{t("branding.topHint")}</small></div>
              <div className="blist">
                {top.length ? top.map((post) => (
                  <div className="brow lnk" key={post.id} onClick={() => go("posts", post.id)} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && go("posts", post.id)}>
                    <div className="grow" style={{ minWidth: 0 }}><b className="clip" style={{ display: "block", fontWeight: 400 }}>{titleOf(post)}</b><span className="faint">{post.published_at ? new Date(post.published_at).toLocaleDateString(locale()) : ""}{post.pillar ? ` · ${pillarName(pillars.data, post.pillar)}` : ""}</span></div>
                    <span className="tn muted">{number(metricsOf(post).impressions ?? 0)}</span>
                  </div>
                )) : <p className="bleg">{t("branding.noNumbersSub")}</p>}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Page>
  );
}
