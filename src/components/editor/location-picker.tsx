"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, Search, X } from "lucide-react";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PickedPlace = { latitude: number; longitude: number; name?: string; address?: string };

type Result = { place_id: number; lat: string; lon: string; name: string; display_name: string; address?: Record<string, string> };

/** Remembers in this browser that the couple wants the map loaded without asking (no cookie, nothing sent). */
const CONSENT_KEY = "traureise:osm-map";
const SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const TILES_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
/** Nominatim's usage policy: at most one request per second, no search-as-you-type. */
const MIN_SEARCH_INTERVAL_MS = 1000;
const GERMANY: [number, number] = [51.16, 10.45];
/** Who receives the IP address, and what they do with it. A link only: nothing loads until it is followed. */
const OSMF_PRIVACY_URL = "https://osmfoundation.org/wiki/Privacy_Policy";

/** "Hofweg 3, 12345 Beispielstadt" from Nominatim's address parts, or its display name. */
function addressOf(r: Result): string {
  const a = r.address ?? {};
  const street = [a.road ?? a.pedestrian ?? a.footway, a.house_number].filter(Boolean).join(" ");
  const city = [a.postcode, a.city ?? a.town ?? a.village ?? a.municipality].filter(Boolean).join(" ");
  return [street, city].filter(Boolean).join(", ") || r.display_name;
}

/**
 * Finds a place on an OpenStreetMap map. Nothing is loaded from OpenStreetMap until the couple agrees, because
 * tiles and search send their IP address to the OpenStreetMap Foundation (ADR 0026). Without the map the venue
 * and address fields work as before.
 */
export function LocationPicker({ value, onPick, onClear }: { value: { latitude: number; longitude: number } | null; onPick: (place: PickedPlace) => void; onClear: () => void }) {
  const t = useTranslations("editor.location");
  // The form only appears after a click (never rendered on the server), so reading storage here is safe.
  const [consented, setConsented] = useState(storedConsent);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [status, setStatus] = useState<"idle" | "searching" | "failed">("idle");
  const lastSearch = useRef(0);
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<CircleMarker | null>(null);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  });

  function consent(always: boolean) {
    if (always) {
      try {
        window.localStorage.setItem(CONSENT_KEY, "always");
      } catch {
        // Storage blocked: this time only.
      }
    }
    setConsented(true);
  }

  // The map (and with it the first tile requests) exists only after consent.
  useEffect(() => {
    if (!consented || !mapElement.current || map.current) return;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !mapElement.current) return;
      const m = L.map(mapElement.current, { scrollWheelZoom: false }).setView(value ? [value.latitude, value.longitude] : GERMANY, value ? 16 : 5);
      L.tileLayer(TILES_URL, { maxZoom: 19, attribution: `<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">${t("attribution")}</a>` }).addTo(m);
      const dot = L.circleMarker(value ? [value.latitude, value.longitude] : GERMANY, { radius: 9, color: "#4a2342", weight: 3, fillColor: "#fbf7fa", fillOpacity: 1 });
      if (value) dot.addTo(m);
      m.on("click", (e) => {
        dot.setLatLng(e.latlng).addTo(m);
        onPickRef.current({ latitude: round(e.latlng.lat), longitude: round(e.latlng.lng) });
      });
      map.current = m;
      marker.current = dot;
    });
    return () => {
      cancelled = true;
    };
    // `value` only sets the starting view; later changes move the marker below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consented]);

  useEffect(() => () => void map.current?.remove(), []);

  function show(latitude: number, longitude: number) {
    if (!map.current || !marker.current) return;
    marker.current.setLatLng([latitude, longitude]).addTo(map.current);
    map.current.setView([latitude, longitude], 16);
  }

  async function search() {
    const q = query.trim();
    if (!q || status === "searching" || Date.now() - lastSearch.current < MIN_SEARCH_INTERVAL_MS) return;
    lastSearch.current = Date.now();
    setStatus("searching");
    try {
      const params = new URLSearchParams({ q, format: "jsonv2", addressdetails: "1", limit: "5", "accept-language": "de" });
      const response = await fetch(`${SEARCH_URL}?${params}`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(String(response.status));
      setResults((await response.json()) as Result[]);
      setStatus("idle");
    } catch {
      setResults(null);
      setStatus("failed");
    }
  }

  function choose(r: Result) {
    const latitude = round(Number(r.lat));
    const longitude = round(Number(r.lon));
    show(latitude, longitude);
    setResults(null);
    onPick({ latitude, longitude, name: r.name || r.display_name.split(",")[0], address: addressOf(r) });
  }

  if (!consented) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-input bg-secondary/30 p-4 text-sm sm:flex-row sm:items-center" data-testid="location-consent">
        <MapPin className="size-5 shrink-0 text-primary" aria-hidden />
        <p className="flex-1 text-muted-foreground">
          {t.rich("consent", {
            link: (chunks) => (
              <a href={OSMF_PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                {chunks}
              </a>
            ),
          })}
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => consent(false)}>
            {t("load")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => consent(true)}>
            {t("always")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="location-picker">
      <div className="flex gap-2">
        <label htmlFor="location-search" className="sr-only">
          {t("search")}
        </label>
        <Input
          id="location-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Inside the event form: Enter searches instead of saving the event.
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
          className="h-9"
        />
        <Button type="button" variant="secondary" onClick={() => void search()} disabled={status === "searching" || !query.trim()}>
          <Search aria-hidden />
          {t("searchButton")}
        </Button>
      </div>
      {status === "failed" && <p className="text-sm text-destructive">{t("failed")}</p>}
      {results && results.length === 0 && <p className="text-sm text-muted-foreground">{t("noResults")}</p>}
      {results && results.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" aria-label={t("results")}>
          {results.map((r) => (
            <li key={r.place_id}>
              <button type="button" onClick={() => choose(r)} className="flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>
                  <span className="block font-medium">{r.name || r.display_name.split(",")[0]}</span>
                  <span className="block text-xs text-muted-foreground">{r.display_name}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div ref={mapElement} className="relative z-0 h-64 overflow-hidden rounded-xl border border-border" data-testid="location-map" />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{t("hint")}</span>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              marker.current?.remove();
              onClear();
            }}
          >
            <X aria-hidden />
            {t("clear")}
          </Button>
        )}
      </div>
    </div>
  );
}

function storedConsent(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(CONSENT_KEY) === "always";
  } catch {
    // Storage blocked: ask each time.
    return false;
  }
}

/** About a metre: enough for a venue, and short in links. */
const round = (n: number) => Math.round(n * 1e5) / 1e5;
