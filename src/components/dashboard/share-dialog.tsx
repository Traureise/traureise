"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { Copy, Download, Link2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** QR code is rendered in the browser (no external service), so sharing works offline. */
export function ShareDialog({ url, slug }: { url: string; slug: string }) {
  const t = useTranslations("dashboard");
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
      toast.success(t("share.qrCopied"));
    } catch {
      toast.error(t("share.copyFailed"));
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("share.linkCopied"));
    } catch {
      // The Clipboard API only exists on https and localhost; self-hosts on plain http (for example a
      // LAN address) fall back to copying the selected text of the URL field.
      const field = document.getElementById(`share-url-${slug}`) as HTMLInputElement | null;
      field?.select();
      if (field && document.execCommand("copy")) toast.success(t("share.linkCopied"));
      else toast.error(t("share.copyFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Share2 aria-hidden />
          {t("card.share")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-medium">{t("share.title")}</DialogTitle>
        </DialogHeader>
        <div className="flex aspect-square items-center justify-center rounded-xl border bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt={t("share.qrAlt", { url })} className="size-full" data-testid="share-qr" />}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="secondary" disabled={!qr}>
            <a href={qr ?? undefined} download={`${slug}-qr-code.png`}>
              <Download aria-hidden />
              {t("share.download")}
            </a>
          </Button>
          <Button variant="secondary" onClick={copyQr} disabled={!qr}>
            <Copy aria-hidden />
            {t("share.copyQr")}
          </Button>
        </div>
        <div className="space-y-2">
          <label className="sr-only" htmlFor={`share-url-${slug}`}>
            {t("share.urlLabel")}
          </label>
          <Input id={`share-url-${slug}`} readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <Button className="w-full" onClick={copyLink}>
            <Link2 aria-hidden />
            {t("share.copyLink")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
