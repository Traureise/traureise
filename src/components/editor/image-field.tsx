"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ImageUp, Trash2 } from "lucide-react";
import { uploadImageAction } from "@/app/actions/editor";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { uploadUrl } from "@/lib/format";

/** Uploads immediately (re-encoded, EXIF stripped on the server) and reports the new key. */
export function ImageField({
  websiteId,
  label,
  value,
  onChange,
  error,
}: {
  websiteId: string;
  label: string;
  value: string | null;
  onChange: (key: string | null) => void;
  error?: string;
}) {
  const t = useTranslations("editor.home");
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [uploadError, setUploadError] = useState<string>();

  function upload(file: File) {
    const form = new FormData();
    form.set("file", file);
    start(async () => {
      const result = await uploadImageAction(websiteId, form);
      if (result.ok) {
        setUploadError(undefined);
        onChange(result.data);
      } else {
        setUploadError(result.fieldErrors?.file ?? result.error ?? "unknown");
      }
      if (input.current) input.current.value = "";
    });
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={uploadUrl(value)} alt={label} className="max-h-48 rounded-lg border object-cover" />
      )}
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          className="sr-only"
          aria-label={value ? t("replace") : t("upload")}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => input.current?.click()}>
          <ImageUp aria-hidden />
          {pending ? t("uploading") : value ? t("replace") : t("upload")}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            <Trash2 aria-hidden />
            {t("remove")}
          </Button>
        )}
      </div>
      <FieldError code={uploadError ?? error} />
    </div>
  );
}
