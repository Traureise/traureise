import { cn } from "@/lib/utils";

/**
 * One section of a settings page: what it is about on the left (title and a sentence on what it does),
 * the fields on the right. Sections are separated by a rule, not boxed, so a page reads as one form.
 */
export function SettingsSection({
  title,
  description,
  children,
  testId,
  tone,
  id,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
  /** "danger": for what cannot be undone (deleting the account). */
  tone?: "danger";
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      data-testid={testId}
      className="grid gap-x-12 gap-y-4 border-t border-border py-8 first:border-t-0 first:pt-2 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]"
    >
      <div className="space-y-1.5">
        <h2 id={id ? `${id}-title` : undefined} className={cn("font-heading text-xl font-medium", tone === "danger" && "text-destructive")}>
          {title}
        </h2>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      <div className="min-w-0 space-y-5">{children}</div>
    </section>
  );
}
