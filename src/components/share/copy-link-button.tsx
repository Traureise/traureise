"use client";

import { useTranslations } from "next-intl";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Copies text, falling back to a hidden field where the Clipboard API is missing (plain http, e.g. a LAN address). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    document.body.append(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    return ok;
  }
}

/** The one "Link kopieren" button. `text` defaults to the link (the engagement's copies its message too). */
export function CopyLinkButton({
  url,
  text = url,
  label,
  copiedMessage,
  onCopied,
  size = "sm",
  variant = "secondary",
  className,
}: {
  url: string;
  text?: string;
  label?: string;
  copiedMessage?: string;
  onCopied?: () => void;
  size?: "sm" | "default";
  variant?: "secondary" | "outline" | "default";
  className?: string;
}) {
  const t = useTranslations("share");
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      data-link={url}
      onClick={async () => {
        if (await copyText(text)) {
          toast.success(copiedMessage ?? t("linkCopied"));
          onCopied?.();
        } else toast.error(t("copyFailed"));
      }}
    >
      <Link2 aria-hidden />
      {label ?? t("copyLink")}
    </Button>
  );
}
