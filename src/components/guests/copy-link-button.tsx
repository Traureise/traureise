"use client";

import { useTranslations } from "next-intl";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Copies a household's personal link; on plain http (no Clipboard API) it falls back to a hidden field. */
export function CopyLinkButton({ url, household, onCopied }: { url: string; household: string; onCopied?: () => void }) {
  const t = useTranslations("guests.list");
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("linkCopied", { household }));
      onCopied?.();
    } catch {
      const field = document.createElement("textarea");
      field.value = url;
      document.body.append(field);
      field.select();
      const ok = document.execCommand("copy");
      field.remove();
      if (ok) {
        toast.success(t("linkCopied", { household }));
        onCopied?.();
      } else toast.error(t("copyFailed"));
    }
  }
  return (
    <Button type="button" variant="secondary" size="sm" onClick={copy} data-link={url}>
      <Link2 aria-hidden />
      {t("copyLink")}
    </Button>
  );
}
