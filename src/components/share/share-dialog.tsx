"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { Copy, Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CopyLinkButton } from "./copy-link-button";
import { WhatsAppButton } from "./whatsapp-button";

/**
 * A public link to share: QR code (made in the browser, no external service), the link to copy, and with a
 * `message` (the engagement announcement) a WhatsApp button; the copied text then has the message before the
 * link. `onShared` runs after copying or opening WhatsApp. Everything wraps, so it fits a phone.
 */
export function ShareDialog({
  url,
  slug,
  title,
  message,
  onShared,
  triggerLabel,
}: {
  url: string;
  slug: string;
  title?: string;
  message?: string;
  onShared?: () => void;
  triggerLabel?: string;
}) {
  const t = useTranslations("share");
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: "M", color: { dark: "#1f1d2b", light: "#ffffff" } }).then(setQr);
  }, [open, url]);

  async function copyQr() {
    try {
      const blob = await (await fetch(qr!)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success(t("qrCopied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  const text = message?.trim() ? `${message.trim()}\n${url}` : url;
  const wrap = "h-auto min-h-9 min-w-0 whitespace-normal py-2";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 aria-hidden />
          {triggerLabel ?? t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md" data-testid="share-dialog">
        <DialogHeader className="min-w-0">
          <DialogTitle className="pr-8 font-heading text-2xl font-medium">{title ?? t("title")}</DialogTitle>
          <DialogDescription className="sr-only">{url}</DialogDescription>
        </DialogHeader>
        <div className="mx-auto flex aspect-square w-full max-w-56 items-center justify-center rounded-xl border bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt={t("qrAlt", { url })} className="size-full" data-testid="share-qr" />}
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          <Button asChild variant="secondary" disabled={!qr} className={wrap}>
            <a href={qr ?? undefined} download={`${slug}-qr-code.png`}>
              <Download aria-hidden />
              {t("download")}
            </a>
          </Button>
          <Button variant="secondary" onClick={copyQr} disabled={!qr} className={wrap}>
            <Copy aria-hidden />
            {t("copyQr")}
          </Button>
        </div>
        <div className="min-w-0 space-y-2">
          <label className="sr-only" htmlFor={`share-url-${slug}`}>
            {t("urlLabel")}
          </label>
          <Input id={`share-url-${slug}`} readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 truncate" />
          <div className="grid min-w-0 grid-cols-1 gap-2">
            {message !== undefined && <WhatsAppButton message={message} link={url} onOpened={onShared} label={t("whatsappShare")} size="default" variant="default" className={wrap} />}
            <CopyLinkButton url={url} text={text} label={message?.trim() ? t("copyText") : t("copyLink")} onCopied={onShared} size="default" variant={message !== undefined ? "secondary" : "default"} className={wrap} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
