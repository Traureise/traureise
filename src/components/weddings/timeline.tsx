import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Check, Eye, PencilLine, Send } from "lucide-react";
import type { HomeStep, WeddingHome } from "@/application/weddings";
import { markEngagementSharedAction } from "@/app/actions/cards";
import { CardFrame } from "@/components/cards/card-frame";
import { ShareDialog } from "@/components/share/share-dialog";
import { Button } from "@/components/ui/button";
import { container } from "@/composition/container";
import { dateFromIso, themeAssetUrl, uploadUrl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { versionHref } from "@/lib/routes";
import { VersionChips } from "./versions";

/** The column left of the line: when couples usually do this step, dated from the wedding day once there is one. */
async function When({ step, weddingId }: { step: HomeStep; weddingId: string }) {
  const t = await getTranslations("weddings.home");
  const format = await getFormatter();
  const day = (iso: string) => format.dateTime(dateFromIso(iso), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const { timing } = step;
  const done = step.state === "done";
  const rule = t(`when.${step.item}`);
  let title = rule;
  let detail: React.ReactNode = null;
  let tone: "open" | "late" | "quiet" = "quiet";
  if (timing.kind === "relative") {
    detail = (
      <Link href={`/hochzeiten/${weddingId}/hochzeit`} className="text-primary underline-offset-4 hover:underline">
        {t("timing.setDate")}
      </Link>
    );
  } else if (timing.kind === "dated") {
    if (timing.phase === "open") {
      title = t("timing.now");
      detail = t("timing.until", { date: day(timing.end) });
      tone = done ? "quiet" : "open";
    } else if (timing.phase === "before") {
      title = t("timing.from", { date: day(timing.start) });
      detail = rule;
    } else if (done) {
      detail = t("timing.range", { start: day(timing.start), end: day(timing.end) });
    } else {
      title = t("timing.catchUp");
      detail = t("timing.recommended", { date: day(timing.end) });
      tone = "late";
    }
  } else if (step.item === "website") {
    detail = t("timing.websiteHint");
  }
  return (
    <div className="mb-2 sm:mb-0 sm:pt-5 sm:text-right" data-testid="step-when">
      <p className={cn("font-heading text-lg leading-tight font-medium text-balance", tone === "open" && "text-primary", tone === "late" && "text-destructive", tone === "quiet" && done && "text-muted-foreground")}>
        {title}
      </p>
      {detail && <p className={cn("mt-0.5 text-sm text-balance", tone === "late" ? "text-destructive" : "text-muted-foreground")}>{detail}</p>}
    </div>
  );
}

/** Every action of a step: the same width, an icon each, one order (open, send, share, view). */
const ACTION = "sm:w-full sm:justify-start";

/** One step of the timeline: when it is due, preview, status, versions, and its actions. */
async function Step({ step, weddingId }: { step: HomeStep; weddingId: string }) {
  const t = await getTranslations("weddings.home");
  const tItems = await getTranslations("weddings.items");
  const name = tItems(step.item);
  const first = step.versions[0]!;
  const { status } = step;
  const statusText =
    status.kind === "website"
      ? status.online > 0
        ? t("status.websiteOnline", { online: status.online })
        : t("status.websiteDraft")
      : status.needsDate
        ? t("status.waitsForDate")
        : status.counts.sent === 0 && status.shared
          ? t("status.engagementShared")
          : status.counts.households === 0
            ? t("status.noHouseholds")
            : t("status.household", status.counts);
  const now = step.state === "now";
  const theme = "website" in step.preview ? container().themes.get(step.preview.website.themeId) : null;
  const online = step.item === "website" ? step.versions.filter((v) => v.online) : [];
  const labelled = (label: string, version: string) => (step.versions.length > 1 ? `${label}: ${version}` : label);
  return (
    <li className="relative pl-12 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-x-14 sm:pl-0" data-testid="timeline-step" data-item={step.item} data-state={step.state}>
      <When step={step} weddingId={weddingId} />
      <span
        aria-hidden
        className={cn(
          "absolute top-6 left-1 flex size-7 items-center justify-center rounded-full border-2 max-sm:top-1 sm:left-[calc(11.75rem-0.875rem)]",
          step.state === "done" && "border-primary bg-primary text-primary-foreground",
          now && "border-primary bg-background ring-6 ring-primary/15",
          step.state === "later" && "border-border bg-background",
        )}
      >
        {step.state === "done" && <Check className="size-4" />}
      </span>
      <article className={cn("flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center", now ? "border-primary shadow-lg shadow-primary/10" : "border-border", step.state === "later" && "opacity-80")}>
        <Link href={versionHref(weddingId, step.item, first.id)} className="shrink-0 self-start" tabIndex={-1} aria-hidden>
          {"card" in step.preview ? (
            <CardFrame model={step.preview.card} className="w-16" label={t("cardPreviewAlt", { item: name })} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={step.preview.website.coverImageKey ? uploadUrl(step.preview.website.coverImageKey) : theme ? themeAssetUrl(theme.id, theme.assets.preview) : ""}
              alt={t("websitePreviewAlt")}
              className="aspect-[32/22] w-24 rounded-md border border-border object-cover"
            />
          )}
        </Link>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="font-heading text-2xl font-medium">{name}</h2>
          <p className="text-sm text-muted-foreground" data-testid="step-status">
            {statusText}
          </p>
          <div className="pt-1">
            <VersionChips weddingId={weddingId} item={step.item} versions={step.versions} canAdd={step.canAddVersion} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:w-40 sm:shrink-0 sm:flex-col">
          <Button asChild size="sm" variant={now ? "default" : "outline"} className={cn(ACTION, !now && "border-primary/40 text-primary")}>
            <Link href={versionHref(weddingId, step.item, first.id)}>
              <PencilLine aria-hidden />
              {now ? t("continue") : t("openStep")}
            </Link>
          </Button>
          {status.kind === "household" && (
            <Button asChild size="sm" variant="outline" className={ACTION}>
              <Link href={`/hochzeiten/${weddingId}/gaeste?karte=${step.item}`}>
                <Send aria-hidden />
                {t("send")}
              </Link>
            </Button>
          )}
          {/* Each household's personal link to its website version: the guest list without a card chosen. */}
          {online.length > 0 && (
            <Button asChild size="sm" variant="outline" className={ACTION}>
              <Link href={`/hochzeiten/${weddingId}/gaeste`} data-testid="website-send">
                <Send aria-hidden />
                {t("send")}
              </Link>
            </Button>
          )}
          {step.item === "engagement" &&
            status.kind === "household" &&
            status.active &&
            step.versions.map((v) => (
              <ShareDialog
                key={v.id}
                url={v.publicUrl!}
                slug={new URL(v.publicUrl!).pathname.slice(1).replaceAll("/", "-")}
                title={t("shareTitle", { item: step.versions.length > 1 ? `${name} (${v.label})` : name })}
                message={step.messages[v.id] ?? ""}
                onShared={markEngagementSharedAction.bind(null, weddingId, v.id)}
                triggerLabel={labelled(t("share"), v.label)}
                triggerClassName={ACTION}
              />
            ))}
          {online.map((v) => (
            <ShareDialog key={v.id} url={v.publicUrl!} slug={new URL(v.publicUrl!).pathname.slice(1)} triggerLabel={labelled(t("share"), v.label)} triggerClassName={ACTION} />
          ))}
          {online.map((v) => (
            <Button key={v.id} asChild size="sm" variant="outline" className={ACTION}>
              <a href={v.publicUrl!} target="_blank" rel="noopener">
                <Eye aria-hidden />
                {labelled(t("view"), v.label)}
              </a>
            </Button>
          ))}
        </div>
      </article>
    </li>
  );
}

/** The wedding as a path: finished steps filled, the next one lifted out, later ones quiet. One column on phones. */
export async function Timeline({ home }: { home: WeddingHome }) {
  const t = await getTranslations("weddings.home");
  const done = home.steps.filter((s) => s.state === "done").length;
  return (
    <section aria-label={t("timeline")} className="relative">
      <div aria-hidden className="absolute top-8 bottom-8 left-[1.05rem] w-0.5 bg-border sm:left-[calc(11.75rem-1px)]">
        <div className="w-full bg-primary" style={{ height: `${(done / home.steps.length) * 100}%` }} />
      </div>
      <ol className="relative space-y-4" data-testid="timeline">
        {home.steps.map((step) => (
          <Step key={step.item} step={step} weddingId={home.wedding.id} />
        ))}
      </ol>
    </section>
  );
}
