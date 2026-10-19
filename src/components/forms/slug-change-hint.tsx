import { TriangleAlert } from "lucide-react";

/**
 * Shown while an address field differs from the saved address: links to the old address stop working, as there
 * are no redirects. Nothing shows for a first address.
 */
export function SlugChangeHint({ id, saved, value, message }: { id: string; saved: string | null; value: string; message: string }) {
  if (!saved || value.trim() === saved) return null;
  return (
    <p id={id} role="note" className="flex gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs" data-testid="slug-change-hint">
      <TriangleAlert className="mt-px size-3.5 shrink-0 text-primary" aria-hidden />
      {message}
    </p>
  );
}
