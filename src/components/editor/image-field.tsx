"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ImageUp, Trash2 } from "lucide-react";
import { uploadImageAction } from "@/app/actions/editor";
import { ACCEPTED_IMAGE_TYPES, checkUpload } from "@/domain/images";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { uploadUrl } from "@/lib/format";

/** Uploads immediately (re-encoded, EXIF stripped on the server) and reports the new key. */
export function ImageField({
  weddingId,
  label,
  value,
  onChange,
  error,
}: {
  weddingId: string;
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
    if (input.current) input.current.value = "";
    // Same rules as the server, checked first so nobody waits for a doomed 10 MB upload.
    const problem = checkUpload({ size: file.size, contentType: file.type });
    if (problem) {
      setUploadError(problem);
      return;
    }
    const form = new FormData();
    form.set("file", file);
    start(async () => {
      try {
        const result = await uploadImageAction(weddingId, form);
        if (result.ok) {
          setUploadError(undefined);
          onChange(result.data);
        } else {
          setUploadError(result.fieldErrors?.file ?? result.error ?? "unknown");
        }
      } catch {
        setUploadError("unknown");
      }
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
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
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
