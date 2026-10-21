"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe, Heart, MapPin } from "lucide-react";
import { toast } from "sonner";
import { updateWeddingDetailsAction } from "@/app/actions/weddings";
import { SettingsSection } from "@/components/app/settings-section";
import { LocationPicker, type Coordinates, type PickedPlace } from "@/components/editor/location-picker";
import { FieldError } from "@/components/forms/field-error";
import { SlugChangeHint } from "@/components/forms/slug-change-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WeddingDetailsFields } from "./wedding-details-fields";
import type { ActionResult } from "@/lib/action-result";
import type { TimeZoneOption } from "@/lib/format";

export type WeddingDetails = {
  id: string;
  title: string;
  weddingDate: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  slug: string;
};

/**
 * The Hochzeit tab's form: names and date, the place (found on the map, if the couple wants), the time zone
 * and the wedding's address. `back` is where the couple came from (a card or the website editor); saving returns there.
 */
export function WeddingDetailsForm({ wedding, appUrl, timeZones, back }: { wedding: WeddingDetails; appUrl: string; timeZones: TimeZoneOption[]; back: string | null }) {
  const t = useTranslations("weddings.details");
  const tFields = useTranslations("weddings.fields");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const location = useRef<HTMLInputElement>(null);
  const [place, setPlace] = useState<Coordinates | null>(
    wedding.latitude !== null && wedding.longitude !== null ? { latitude: wedding.latitude, longitude: wedding.longitude } : null,
  );
  const [slug, setSlug] = useState(wedding.slug);
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  // onSubmit, not a form action: an action resets the fields, which would lose what was typed on an error.
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    start(async () => {
      const result = await updateWeddingDetailsAction(wedding.id, null, form);
      setState(result);
      if (!result.ok) return;
      toast.success(t("saved"));
      if (back) router.push(back);
    });
  }

  /** A place found on the map fills the place field (still editable) and keeps its spot. */
  function pick(picked: PickedPlace) {
    setPlace({ latitude: picked.latitude, longitude: picked.longitude });
    if (picked.name && location.current) location.current.value = picked.name;
  }

  return (
    <form onSubmit={submit} aria-label={t("title")}>
      <SettingsSection id="wedding-names" icon={<Heart />} title={t("sections.names.title")} description={t("sections.names.lead")}>
        <WeddingDetailsFields idPrefix="details" value={wedding} errors={errors} />
      </SettingsSection>

      <SettingsSection id="wedding-place" icon={<MapPin />} title={t("sections.place.title")} description={t("sections.place.lead")}>
        <div className="space-y-2">
          <Label htmlFor="details-location">{tFields("locationLabel")}</Label>
          <Input ref={location} id="details-location" name="location" defaultValue={wedding.location ?? undefined} />
          <FieldError code={errors.location} />
        </div>
        <LocationPicker value={place} onPick={pick} onClear={() => setPlace(null)} />
        <input type="hidden" name="latitude" value={place?.latitude ?? ""} />
        <input type="hidden" name="longitude" value={place?.longitude ?? ""} />
        <FieldError code={errors.latitude} />
      </SettingsSection>

      <SettingsSection id="wedding-address" icon={<Globe />} title={t("sections.address.title")} description={t("sections.address.lead")}>
        <div className="space-y-2">
          <Label htmlFor="details-timezone">{tFields("timezoneLabel")}</Label>
          <select id="details-timezone" name="timezone" defaultValue={wedding.timezone} className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm">
            {timeZones.map((tz) => (
              <option key={tz.id} value={tz.id}>
                {tz.label}
              </option>
            ))}
          </select>
          <FieldError code={errors.timezone} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="details-slug">{tFields("slugLabel")}</Label>
          <div className="flex min-w-0 items-center rounded-lg border border-input bg-card focus-within:ring-3 focus-within:ring-ring/50">
            <span className="truncate pl-3 text-sm whitespace-nowrap text-muted-foreground">{appUrl.replace(/^https?:\/\//, "")}/</span>
            <Input
              id="details-slug"
              name="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="min-w-0 border-0 pl-0.5 focus-visible:ring-0"
              aria-describedby="details-slug-hint details-slug-change"
            />
          </div>
          <p id="details-slug-hint" className="text-xs text-muted-foreground">
            {tFields("slugHint")}
          </p>
          <SlugChangeHint id="details-slug-change" saved={wedding.slug} value={slug} message={tFields("slugChangeHint")} />
          <FieldError code={errors.slug} />
        </div>
      </SettingsSection>

      <div className="sticky bottom-0 z-10 -mx-6 flex items-center justify-end gap-3 rounded-b-3xl border-t border-border bg-card/90 px-6 py-3 backdrop-blur sm:-mx-10 sm:px-10">
        {state && !state.ok && state.error && (
          <p role="alert" className="mr-auto text-sm text-destructive">
            {tErrors(state.error)}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
