"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe, GlobeLock } from "lucide-react";
import { toast } from "sonner";
import { setPublishedAction } from "@/app/actions/editor";
import { Button } from "@/components/ui/button";

/** A website version is a draft (a 404 for guests) until the couple publishes it; it can go offline again. */
export function PublishControl({ websiteId, published, online }: { websiteId: string; published: boolean; online: boolean }) {
  const t = useTranslations("editor.publish");
  const router = useRouter();
  const [pending, start] = useTransition();
  const toggle = () =>
    start(async () => {
      const result = await setPublishedAction(websiteId, !published);
      if (result.ok) toast.success(t(published ? "unpublishedToast" : "publishedToast"));
      router.refresh();
    });
  return (
    <div className="space-y-2 rounded-xl border border-border bg-background p-4" data-testid="publish-control" data-published={published}>
      <p className="flex items-center gap-2 text-sm font-medium">
        {online ? <Globe className="size-4 text-primary" aria-hidden /> : <GlobeLock className="size-4 text-muted-foreground" aria-hidden />}
        {published ? t("published") : t("draft")}
      </p>
      {published && !online && <p className="text-sm text-muted-foreground">{t("offlineExtra")}</p>}
      <Button type="button" variant={published ? "outline" : "default"} className="w-full" disabled={pending} onClick={toggle}>
        {published ? t("unpublish") : t("publish")}
      </Button>
    </div>
  );
}
