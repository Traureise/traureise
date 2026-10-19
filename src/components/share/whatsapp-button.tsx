"use client";

import { useTranslations } from "next-intl";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { whatsappUrl } from "@/domain/guests";

/**
 * The one WhatsApp button: opens wa.me in a new tab inside the click (so no popup blocker stops it), then
 * calls `onOpened` (to record the share).
 */
export function WhatsAppButton({
  message,
  link,
  name,
  onOpened,
  label,
  size = "sm",
  variant = "secondary",
  className,
}: {
  message: string;
  link: string;
  name?: string;
  onOpened?: () => void;
  label?: string;
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
      onClick={() => {
        // `{name}` is the household's name; texts to everyone have none.
        window.open(whatsappUrl(message, name ?? "", link), "_blank", "noopener,noreferrer");
        onOpened?.();
      }}
    >
      <MessageCircle aria-hidden />
      {label ?? t("whatsapp")}
    </Button>
  );
}
