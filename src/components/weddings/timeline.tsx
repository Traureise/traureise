import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Check, Eye, Send } from "lucide-react";
import type { HomeStep, WeddingHome } from "@/application/weddings";
import { markEngagementSharedAction } from "@/app/actions/cards";
import { CardFrame } from "@/components/cards/card-frame";
import { ShareDialog } from "@/components/share/share-dialog";
import { Button } from "@/components/ui/button";
import { container } from "@/composition/container";
import { themeAssetUrl, uploadUrl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { versionHref } from "@/lib/routes";
import { VersionChips } from "./versions";

/** One step of the timeline: preview, when couples usually do it, status, versions, and a way in. */
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
  return (
    <li className="relative pl-12" data-testid="timeline-step" data-item={step.item} data-state={step.state}>
      <span
        aria-hidden
        className={cn(
          "absolute top-6 left-1 flex size-7 items-center justify-center rounded-full border-2",
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
          <p className="text-xs tracking-[0.12em] text-accent-foreground uppercase">{now ? t("next") : t(`when.${step.item}`)}</p>
          <h2 className="font-heading text-2xl font-medium">{name}</h2>
          <p className="text-sm text-muted-foreground" data-testid="step-status">
            {statusText}
          </p>
          <div className="pt-1">
            <VersionChips weddingId={weddingId} item={step.item} versions={step.versions} canAdd={step.canAddVersion} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
          <Button asChild size="sm" variant={now ? "default" : "outline"}>
            <Link href={versionHref(weddingId, step.item, first.id)}>{now ? t("continue") : t("openStep")}</Link>
          </Button>
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
                triggerLabel={step.versions.length > 1 ? `${t("share")}: ${v.label}` : t("share")}
              />
            ))}
          {status.kind === "household" && (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/hochzeiten/${weddingId}/gaeste?karte=${step.item}`}>
                <Send aria-hidden />
                {t("send")}
              </Link>
            </Button>
          )}
          {step.item === "website" &&
            step.versions
              .filter((v) => v.online)
              .map((v) => (
                <span key={v.id} className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="ghost">
                    <a href={v.publicUrl!} target="_blank" rel="noopener">
                      <Eye aria-hidden />
                      {step.versions.length > 1 ? `${t("view")}: ${v.label}` : t("view")}
                    </a>
                  </Button>
                  <ShareDialog url={v.publicUrl!} slug={new URL(v.publicUrl!).pathname.slice(1)} triggerLabel={step.versions.length > 1 ? `${t("share")}: ${v.label}` : t("share")} />
                </span>
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
      <div aria-hidden className="absolute top-8 bottom-8 left-[1.05rem] w-0.5 bg-border">
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
