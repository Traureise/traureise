import { cn } from "@/lib/utils";

/**
 * One section of a settings page: an icon, the title and a sentence on what it does, then the fields
 * beneath, indented to the title. Sections are separated by a rule, not boxed, so a page reads as one form.
 */
export function SettingsSection({
  title,
  description,
  children,
  testId,
  tone,
  id,
  icon,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
  /** "danger": for what cannot be undone (deleting the account). */
  tone?: "danger";
  id?: string;
  /** A small icon in a medallion beside the title; it says what the section is about at a glance. */
  icon?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      data-testid={testId}
      className="scroll-mt-24 space-y-5 border-t border-border py-9 first:border-t-0"
    >
      <div className="flex gap-4">
        {icon && (
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full [&_svg]:size-[1.15rem]",
              tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-accent text-primary",
            )}
            aria-hidden
          >
            {icon}
          </span>
        )}
        <div className="space-y-1.5">
          <h2 id={id ? `${id}-title` : undefined} className={cn("font-heading text-xl font-medium", tone === "danger" && "text-destructive")}>
            {title}
          </h2>
          {description && <div className="max-w-prose text-sm text-muted-foreground">{description}</div>}
        </div>
      </div>
      <div className="min-w-0 space-y-5 sm:pl-14">{children}</div>
    </section>
  );
}
