import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Earth, MessageSquareText, MoreHorizontal, Repeat2, Send, ThumbsUp } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, must, originalBlob, type Schemas } from "../api/client";
import { useMe } from "../data";
import { t } from "../i18n";
import { toast } from "../shell/state";
import { initials, type Tone } from "../ui";

export type Post = Schemas["Post"];
export type Pillar = Schemas["Pillar"];
export type Slot = Schemas["PostSlot"];
export type Metrics = { impressions?: number; reactions?: number; comments?: number; shares?: number; clicks?: number; followers?: number; icp_share?: number };

export const usePosts = (query: { status?: string; q?: string } = {}) =>
  useQuery({ queryKey: ["posts", query], queryFn: () => must(api.GET("/posts", { params: { query: { ...query, limit: 500 } } })) });
export const usePillars = () => useQuery({ queryKey: ["posts", "pillars"], queryFn: () => must(api.GET("/posts/pillars")) });
export const useSlots = () => useQuery({ queryKey: ["posts", "slots"], queryFn: () => must(api.GET("/posts/slots")) });
export const useBranding = () => useQuery({ queryKey: ["branding"], queryFn: () => must(api.GET("/branding")) });

/** Brain entries whose original is an image, for posts. */
export function useBrainImages() {
  return useQuery({
    queryKey: ["brain", "list", "images"],
    queryFn: async () => (await must(api.GET("/brain/entries", { params: { query: { limit: 500 } } }))).filter((entry) => /\.(png|jpe?g|gif|webp|heic)$/i.test(entry.original ?? "")),
  });
}

export function usePostActions() {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["posts"] });
    void client.invalidateQueries({ queryKey: ["ready"] });
  };
  const fail = (error: Error) => toast(error.message, "bad");
  return {
    create: (body: Schemas["NewPost"]) => must(api.POST("/posts", { body })).then((post) => (refresh(), post)),
    patch: (id: string, body: Schemas["PostPatch"]) => must(api.PATCH("/posts/{id}", { params: { path: { id } }, body })).then((post) => (refresh(), post), fail),
    remove: (id: string) => must(api.DELETE("/posts/{id}", { params: { path: { id } } })).then(refresh, fail),
    publish: (id: string) => must(api.POST("/posts/{id}/publish", { params: { path: { id } } })).then((result) => (refresh(), result)),
  };
}

/** Checks a text while it is typed, a moment after the last key. */
export function useCheck(text: string) {
  const [term, setTerm] = useState(text);
  useEffect(() => {
    const pause = setTimeout(() => setTerm(text), 400);
    return () => clearTimeout(pause);
  }, [text]);
  return useQuery({ queryKey: ["posts", "check", term], queryFn: () => must(api.POST("/posts/check", { body: { text: term } })), placeholderData: (previous) => previous });
}

export function useImport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (raw: string) => {
      const text = raw.trim();
      const body = text.startsWith("[") || text.startsWith("{") ? { posts: (JSON.parse(text).posts ?? JSON.parse(text)) as Schemas["ImportedPost"][] } : { csv: text, posts: [] };
      return must(api.POST("/posts/import", { body }));
    },
    onSuccess: (result) => {
      toast(t("posts.imported", { count: result.imported }));
      void client.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (error) => toast(error.message, "bad"),
  });
}

export const metricsOf = (post: Pick<Post, "metrics">): Metrics => (post.metrics && typeof post.metrics === "object" ? (post.metrics as Metrics) : {});

/** The first line, as the feed shows it above "…more". */
export const titleOf = (post: Pick<Post, "title" | "body">) => post.title?.trim() || post.body.split("\n").find((line) => line.trim())?.trim() || t("posts.untitled");

export const STEPS = ["draft", "scheduled", "publishing", "published"] as const;
export function stepOf(status: string) {
  const index = STEPS.indexOf(status as (typeof STEPS)[number]);
  return index === -1 ? 0 : index;
}
export const statusTone = (status: string): Tone =>
  status === "published" ? "ok" : status === "publishing" ? "warn" : status === "scheduled" ? "info" : "";
export const statusLabel = (status: string) => t(`posts.status.${status as "draft"}`);

/** Posts that are not planned yet and not out: the pool the calendar fills from. */
export const inPool = (post: Pick<Post, "status" | "scheduled_at">) => !post.scheduled_at && (post.status === "idea" || post.status === "draft");

/** A Brain image as an object URL, loaded with the token. */
export function useImageUrl(id: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    let created: string | null = null;
    let gone = false;
    originalBlob(id)
      .then((blob) => {
        if (gone) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch(() => setUrl(null));
    return () => {
      gone = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id]);
  return url;
}

/** A post's picture: its first Brain image, or a quiet tile with the pillar's color. */
export function Tile({ post, image, color }: { post?: Pick<Post, "images" | "pillar">; image?: string; color?: string | null }) {
  const url = useImageUrl(image ?? post?.images[0]);
  return (
    <span className={`ptile ${url ? "" : "none"}`} style={!url ? { background: color ? `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 40%, #111))` : undefined } : undefined}>
      {url && <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
    </span>
  );
}

/** How the post will look in the feed: the text cut after three lines with "…more", the image, the bar. */
export function FeedPreview({ text, image, comment, width }: { text: string; image?: string; comment?: string; width: number | string }) {
  const me = useMe();
  const branding = useBranding();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || open) {
      setCut(false);
      return;
    }
    setCut(element.scrollHeight > element.clientHeight + 1);
  }, [text, open, width]);
  const name = me.data?.name ?? "";
  const picture = useImageUrl(image);
  return (
    <article className="lifeed" style={{ width }} aria-label={t("posts.preview")}>
      <header>
        <span className="pic m">{initials(name) || "·"}</span>
        <div className="who">
          <b>{name}<span className="deg"> • 1.</span></b>
          <span>{branding.data?.headline ?? ""}</span>
          <span className="tm">{t("posts.now")} • <Earth size={12} /></span>
        </div>
        <span className="more"><MoreHorizontal size={20} /></span>
      </header>
      <div className="txtw">
        <div ref={ref} className={`txt ${open ? "" : "clamp"}`}>{text || " "}</div>
        {cut && <button type="button" className="mehr" onClick={() => setOpen(true)}>{t("posts.more")}</button>}
        {open && <button type="button" className="mehr in" onClick={() => setOpen(false)}>{t("posts.less")}</button>}
      </div>
      {picture && <div className="med"><img src={picture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>}
      <div className="soc"><span><i /><i /><i />{t("posts.reactionsPreview")}</span><span>{t("posts.commentsPreview")}</span></div>
      <footer>
        {([[ThumbsUp, t("posts.like")], [MessageSquareText, t("posts.comment")], [Repeat2, t("posts.repost")], [Send, t("posts.send")]] as const).map(([Icon, label]) => (
          <span key={label}><Icon size={18} /><em>{label}</em></span>
        ))}
      </footer>
      {comment && (
        <div className="cm">
          <span className="pic m mini">{initials(name) || "·"}</span>
          <div><b>{name}</b><span className="liau">{t("posts.author")}</span><p>{comment}</p></div>
        </div>
      )}
    </article>
  );
}
