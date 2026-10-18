import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { CalendarDays, Eye, MapPin, PencilLine } from "lucide-react";
import type { Website } from "@/application/ports";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { dateFromIso, uploadUrl } from "@/lib/format";
import { DeleteWebsiteButton } from "./delete-website-button";
import { ShareDialog } from "./share-dialog";

export async function WebsiteCard({ website, appUrl }: { website: Website; appUrl: string }) {
  const t = await getTranslations("dashboard.card");
  const format = await getFormatter();
  const publicUrl = `${appUrl}/${website.slug}`;
  return (
    <article className="grid gap-6 rounded-2xl border border-border bg-card p-5 sm:grid-cols-[220px_1fr] sm:p-6" data-testid="website-card">
      <div className="aspect-[4/5] overflow-hidden rounded-xl bg-secondary sm:aspect-square">
        {website.coverImageKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={uploadUrl(website.coverImageKey)} alt={t("coverAlt", { title: website.title })} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-primary/40">
            <LogoMark className="w-20" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <h2 className="font-heading text-3xl font-medium tracking-tight">{website.title}</h2>
        <dl className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2">
            <dt>
              <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
            </dt>
            <dd>{website.weddingDate ? format.dateTime(dateFromIso(website.weddingDate), { dateStyle: "long", timeZone: "UTC" }) : t("dateOpen")}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt>
              <MapPin className="size-4 text-muted-foreground" aria-hidden />
            </dt>
            <dd>{website.location ?? t("locationOpen")}</dd>
          </div>
        </dl>
        <a href={publicUrl} className="truncate text-sm text-primary underline-offset-4 hover:underline" data-testid="public-url">
          {publicUrl}
        </a>
        <div className="mt-auto flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href={`/${website.slug}`} target="_blank">
              <Eye aria-hidden />
              {t("view")}
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/websites/${website.id}/edit`}>
              <PencilLine aria-hidden />
              {t("edit")}
            </Link>
          </Button>
          <ShareDialog url={publicUrl} slug={website.slug} />
          <div className="sm:ml-auto">
            <DeleteWebsiteButton websiteId={website.id} title={website.title} />
          </div>
        </div>
      </div>
    </article>
  );
}
