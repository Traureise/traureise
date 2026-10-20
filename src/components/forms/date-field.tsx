"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover } from "radix-ui";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { germanDate, isoFromGermanDate } from "@/domain/days";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  label: string;
  name?: string;
  /** An ISO day (YYYY-MM-DD). Controlled when `onChange` is set, else the initial value. */
  value?: string | null;
  onChange?: (value: string) => void;
  disabled?: boolean;
  hint?: string;
  error?: string;
  className?: string;
};

/** What the form sends: the ISO day, or what was typed when it is not a date (the server then says so). */
const submitted = (text: string) => isoFromGermanDate(text) ?? text.trim();

const isoOf = (day: Date) => format(day, "yyyy-MM-dd");
const dayOf = (iso: string) => new Date(`${iso}T12:00:00`);

/**
 * The one date input, in German whatever the browser's language: typed as TT.MM.JJJJ or picked in a calendar
 * that starts on Monday. A hidden input sends the ISO day under `name`.
 */
export function DateField({ id, label, name, value, onChange, disabled, hint, error, className }: Props) {
  const t = useTranslations("forms");
  const [text, setText] = useState(germanDate(value ?? ""));
  const [open, setOpen] = useState(false);
  const iso = isoFromGermanDate(text);
  const [month, setMonth] = useState(() => startOfMonth(iso ? dayOf(iso) : new Date()));

  function change(next: string) {
    setText(next);
    onChange?.(submitted(next));
  }

  function openCalendar(next: boolean) {
    if (next) setMonth(startOfMonth(iso ? dayOf(iso) : new Date()));
    setOpen(next);
  }

  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  const monthTitle = format(month, "LLLL yyyy", { locale: de });

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {name && <input type="hidden" name={name} value={submitted(text)} />}
      <div className="flex w-full max-w-56 gap-1">
        <Input
          id={id}
          data-field={name}
          value={text}
          onChange={(e) => change(e.target.value)}
          placeholder={t("datePlaceholder")}
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          aria-describedby={[hint ? `${id}-hint` : null, `${id}-error`].filter(Boolean).join(" ")}
          aria-invalid={error ? true : undefined}
        />
        <Popover.Root open={open} onOpenChange={openCalendar}>
          <Popover.Trigger asChild>
            <Button type="button" variant="outline" size="icon" disabled={disabled} aria-label={t("openCalendar")}>
              <CalendarDays aria-hidden />
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content role="dialog" aria-label={monthTitle} align="start" sideOffset={4} className="z-50 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-md">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t("previousMonth")} onClick={() => setMonth((m) => addMonths(m, -1))}>
                  <ChevronLeft aria-hidden />
                </Button>
                <span className="text-sm font-medium">{monthTitle}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t("nextMonth")} onClick={() => setMonth((m) => addMonths(m, 1))}>
                  <ChevronRight aria-hidden />
                </Button>
              </div>
              <table className="border-collapse text-center text-sm">
                <thead>
                  <tr>
                    {weeks[0]!.map((day) => (
                      <th key={day.toISOString()} scope="col" className="size-9 font-normal text-muted-foreground">
                        {format(day, "EEEEEE", { locale: de })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week) => (
                    <tr key={week[0]!.toISOString()}>
                      {week.map((day) => {
                        const selected = isoOf(day) === iso;
                        return (
                          <td key={day.toISOString()} className="p-0">
                            <button
                              type="button"
                              aria-label={format(day, "EEEE, d. MMMM yyyy", { locale: de })}
                              aria-pressed={selected}
                              onClick={() => {
                                change(germanDate(isoOf(day)));
                                setOpen(false);
                              }}
                              className={cn(
                                "size-9 rounded-lg hover:bg-secondary",
                                !isSameMonth(day, month) && "text-muted-foreground/60",
                                selected && "bg-primary text-primary-foreground hover:bg-primary",
                              )}
                            >
                              {format(day, "d")}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`} code={error} />
    </div>
  );
}
