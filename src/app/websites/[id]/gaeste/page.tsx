import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Download, Lock, Mail, MessageCircle } from "lucide-react";
import type { GuestListEntry, GuestPage } from "@/application/guests";
import { CardSendButtons, ReminderButton, RemindAllButton, SendAllButton } from "@/components/guests/card-sending";
import { CopyLinkButton } from "@/components/guests/copy-link-button";
import { DeleteHouseholdButton, RequestActions } from "@/components/guests/guest-actions";
import { HouseholdDialog } from "@/components/guests/household-dialog";
import { PieChart } from "@/components/guests/pie-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cardCounts, deliveryStatus, emailRecipients, sentAt, type DeliveryStatus, type HouseholdCardKind } from "@/domain/cards";
import { whatsappUrl, type HouseholdStatus } from "@/domain/guests";
import { loadGuestPage } from "@/lib/guests";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; karte?: string; versand?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page } = await loadGuestPage((await params).id);
  return { title: `${(await getTranslations("guests"))("title")} · ${page.website.title}` };
}

const STATUSES: HouseholdStatus[] = ["open", "answered", "declined"];
/** Filters by what happened with the chosen card ("Einladung nicht geöffnet"). */
const DELIVERY_FILTERS = {
  "nicht-gesendet": (s: DeliveryStatus) => s === "notSent" || s === "queued" || s === "failed",
  "nicht-geoeffnet": (s: DeliveryStatus) => s === "sent",
  geoeffnet: (s: DeliveryStatus) => s === "opened",
} as const;
type DeliveryFilter = keyof typeof DELIVERY_FILTERS;

/** Sent how and when, or opened when: one line per household and card. */
async function DeliveryBadge({ entry, kind, timeZone }: { entry: GuestListEntry; kind: HouseholdCardKind; timeZone: string }) {
  const t = await getTranslations("guests.sending.status");
  const format = await getFormatter();
  const d = entry.deliveries[kind];
  const status = deliveryStatus(d);
  const date = (at: Date | null) => (at ? format.dateTime(at, { dateStyle: "medium", timeStyle: "short", timeZone }) : "");
  const via = d?.emailedAt && (!d.sharedAt || d.emailedAt <= d.sharedAt) ? "email" : (d?.sharedVia ?? "link");
  const label =
    status === "opened"
      ? t("opened", { date: date(d!.openedAt) })
      : status === "sent"
        ? t(`sent.${via}`, { date: date(sentAt(d)) })
        : status === "failed"
          ? t("failed")
          : t(status);
  return (
    <Badge variant={status === "opened" ? "secondary" : "outline"} data-testid="delivery-status" data-status={status}>
      {label}
    </Badge>
  );
}
const COLORS = { coming: "var(--color-primary)", notComing: "var(--color-muted-foreground)", open: "color-mix(in srgb, var(--color-primary) 22%, white)" };

function Card({ title, children, testId, className }: { title: string; children: React.ReactNode; testId: string; className?: string }) {
  return (
    <section className={cn("space-y-3 rounded-2xl border border-border bg-card p-5", className)} data-testid={testId}>
      <h3 className="font-heading text-xl font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Counts({ rows, empty }: { rows: { key: string; label: string; count: number }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((r) => (
        <li key={r.key} className="flex justify-between gap-4">
          <span>{r.label}</span>
          <span className="font-medium tabular-nums">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

async function Overview({ page }: { page: GuestPage }) {
  const t = await getTranslations("guests.overview");
  const { overview, website } = page;
  const { people } = overview;
  const legend = [
    { key: "coming" as const, value: people.coming },
    { key: "notComing" as const, value: people.notComing },
    { key: "open" as const, value: people.open },
  ];
  return (
    <section aria-labelledby="overview-title" className="space-y-4" data-testid="guest-overview">
      <h2 id="overview-title" className="sr-only">
        {t("title")}
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t("people")} testId="overview-people" className="md:row-span-2">
          <div className="flex flex-wrap items-center gap-6">
            <PieChart label={t("chartLabel", people)} slices={legend.map((l) => ({ value: l.value, color: COLORS[l.key], label: `${t(l.key)}: ${l.value}` }))} />
            <ul className="space-y-2 text-sm">
              {legend.map((l) => (
                <li key={l.key} className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: COLORS[l.key] }} aria-hidden />
                  <span>{t(l.key)}</span>
                  <span className="font-medium tabular-nums" data-testid={`count-${l.key}`}>
                    {l.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="overview-households">
            {t("households", overview.households)}
          </p>
        </Card>
        <Card title={t("events")} testId="overview-events">
          <Counts rows={overview.events.map((e) => ({ key: e.id, label: e.name, count: e.count }))} empty={t("noEvents")} />
        </Card>
        <Card title={t("meals")} testId="overview-meals">
          <Counts rows={overview.meals.map((m) => ({ key: m.id, label: m.label, count: m.count }))} empty={t("noMeal")} />
        </Card>
        <Card title={t("allergies")} testId="overview-allergies">
          {overview.allergies.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noAllergies")}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {overview.allergies.map((a, i) => (
                <li key={i}>{t("allergyLine", a)}</li>
              ))}
            </ul>
          )}
        </Card>
        {overview.polls.map((poll) => (
          <Card key={poll.id} title={poll.question} testId="overview-poll">
            <Counts rows={poll.options.map((o) => ({ key: o.id, label: o.label, count: o.count }))} empty="" />
            {poll.other.length > 0 && <p className="text-sm text-muted-foreground">{t("otherAnswers", { answers: poll.other.join(", ") })}</p>}
          </Card>
        ))}
        <Card title={t("requests")} testId="overview-requests" className="md:col-span-2">
          {overview.requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noRequests")}</p>
          ) : (
            <ul className="space-y-2">
              {overview.requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 text-sm" data-testid="guest-request">
                  <span>{t("request", { name: r.name, household: r.household })}</span>
                  <RequestActions websiteId={website.id} requestId={r.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </section>
  );
}

async function HouseholdDetails({ entry, page }: { entry: GuestListEntry; page: GuestPage }) {
  const t = await getTranslations("guests.details");
  const tRequest = await getTranslations("guests.requestStatus");
  const meal = page.settings.meal;
  const answer = (pollId: string, answers: GuestListEntry["pollAnswers"]) => {
    const poll = page.polls.find((p) => p.id === pollId);
    const a = answers[pollId];
    if (!poll || !a) return null;
    return [...poll.options.filter((o) => a.optionIds.includes(o.id)).map((o) => o.label), ...(a.other ? [a.other] : [])].join(", ");
  };
  const pollLines = (answers: GuestListEntry["pollAnswers"], per: "person" | "household") =>
    page.polls
      .filter((p) => p.per === per && answer(p.id, answers))
      .map((p) => (
        <li key={p.id}>{t("poll", { question: p.question, answer: answer(p.id, answers) ?? "" })}</li>
      ));
  return (
    <details className="group rounded-xl bg-secondary/40 px-4 py-2 text-sm">
      <summary className="cursor-pointer py-1 text-primary">{t("show")}</summary>
      <div className="space-y-4 py-3">
        <ul className="space-y-3">
          {entry.people.map((p) => (
            <li key={p.id} data-testid="guest-person" data-guest-id={p.id}>
              <p className="font-medium">
                {p.name}
                {p.isChild && <span className="font-normal text-muted-foreground"> · {t("child")}</span>}
                {" · "}
                <span data-testid="guest-person-status">{p.attending === null ? t("open") : p.attending ? t("coming") : t("notComing")}</span>
              </p>
              {p.attending && (
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {p.eventIds.length > 0 && <li>{t("events", { events: page.events.filter((e) => p.eventIds.includes(e.id)).map((e) => e.name).join(", ") })}</li>}
                  {p.mealOptionId && <li>{t("meal", { meal: meal?.options.find((o) => o.id === p.mealOptionId)?.label ?? "" })}</li>}
                  {p.allergies && <li>{t("allergies", { allergies: p.allergies })}</li>}
                  {pollLines(p.pollAnswers, "person")}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {pollLines(entry.pollAnswers, "household").length > 0 && <ul className="list-inside list-disc text-muted-foreground">{pollLines(entry.pollAnswers, "household")}</ul>}
        {entry.message && (
          <blockquote className="border-l-2 border-primary/40 pl-3 whitespace-pre-line" data-testid="household-message">
            {entry.message}
          </blockquote>
        )}
        {entry.requests.length > 0 && (
          <ul className="text-muted-foreground">
            {entry.requests.map((r) => (
              <li key={r.id}>{t("request", { name: r.name, status: tRequest(r.status) })}</li>
            ))}
          </ul>
        )}
        {!entry.respondedAt && <p className="text-muted-foreground">{t("noAnswer")}</p>}
      </div>
    </details>
  );
}

export default async function GuestsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { status: statusParam, karte, versand } = await searchParams;
  const { page } = await loadGuestPage(id);
  const t = await getTranslations("guests");
  const tStatus = await getTranslations("guests.status");
  const tSending = await getTranslations("guests.sending");
  const tKinds = await getTranslations("cardKinds");
  const format = await getFormatter();
  const status = STATUSES.find((s) => s === statusParam);
  const card = page.cards.find((c) => c.kind === karte) ?? null;
  const deliveryFilter = card && versand && versand in DELIVERY_FILTERS ? (versand as DeliveryFilter) : null;
  const shown = page.households
    .filter((h) => !status || h.status === status)
    .filter((h) => !card || !deliveryFilter || DELIVERY_FILTERS[deliveryFilter](deliveryStatus(h.deliveries[card.kind])));
  const base = `/websites/${id}/gaeste`;
  const query = (patch: Record<string, string | undefined>) => {
    const all: Record<string, string | undefined> = { status, karte: card?.kind, versand: deliveryFilter ?? undefined, ...patch };
    const params = new URLSearchParams(Object.entries(all).flatMap(([k, v]) => (v ? [[k, v]] : [])));
    return params.size ? `${base}?${params}` : base;
  };
  const whatsappMessage = page.settings.whatsappMessage ?? t("list.whatsappDefault", { title: page.website.title });
  const locked = page.billingEnabled && !page.sending;
  const openHouseholds = page.households.filter((h) => h.status === "open");
  const remindable = page.replyOpen && (page.sending || page.emailReminders);
  const counts = card ? cardCounts(page.households.map((h) => h.deliveries[card.kind])) : null;
  const recipients = card ? emailRecipients(page.households.map((h) => ({ ...h, delivery: h.deliveries[card.kind] }))).length : 0;

  return (
    <div className="space-y-10">
      {locked && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm" data-testid="rsvp-locked">
          <Lock className="size-4 text-primary" aria-hidden />
          {t("locked")}
          <Link href="/preise" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("lockedLink")}
          </Link>
        </p>
      )}
      {page.deletionSoon && page.deleteAt && (
        <p role="status" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm" data-testid="deletion-notice">
          {t("deletionNotice", { date: format.dateTime(page.deleteAt, { dateStyle: "long", timeZone: "UTC" }) })}{" "}
          <a href={`${base}/export`} className="font-medium text-primary underline-offset-4 hover:underline">
            {t("list.csv")}
          </a>
        </p>
      )}

      <Overview page={page} />

      <section aria-labelledby="list-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="list-title" className="font-heading text-3xl font-medium">
            {t("list.title")}
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={`${base}/export`} download>
                <Download aria-hidden />
                {t("list.csv")}
              </a>
            </Button>
            <HouseholdDialog websiteId={id} events={page.events} />
          </div>
        </div>

        {page.cards.length > 0 && (
          <nav aria-label={tSending("choose")} className="flex flex-wrap items-center gap-2 text-sm" data-testid="card-picker">
            <span className="text-muted-foreground">{tSending("choose")}</span>
            {[null, ...page.cards.map((c) => c.kind)].map((kind) => (
              <Link
                key={kind ?? "rsvp"}
                href={query({ karte: kind ?? undefined, versand: undefined })}
                aria-current={(card?.kind ?? null) === kind ? "page" : undefined}
                className={cn("rounded-full border px-3 py-1", (card?.kind ?? null) === kind ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/40")}
              >
                {kind ? tKinds(kind) : tSending("rsvpLink")}
              </Link>
            ))}
          </nav>
        )}

        {card && counts && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4" data-testid="card-sending">
            <p className="text-sm" data-testid="card-sending-counts">
              {tSending("counts", counts)}
            </p>
            <div className="ml-auto flex flex-wrap gap-2">
              {!card.active ? (
                <Button asChild>
                  <Link href="/preise">
                    <Lock aria-hidden />
                    {tSending("unlock")}
                  </Link>
                </Button>
              ) : page.emailSending ? (
                <SendAllButton websiteId={id} kind={card.kind} count={recipients} />
              ) : (
                <Button asChild variant="outline">
                  <Link href="/preise">
                    <Lock aria-hidden />
                    {tSending("emailLocked")}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label={t("list.filter")} className="flex flex-wrap gap-2 text-sm">
            {[undefined, ...STATUSES].map((s) => {
              const count = s ? page.households.filter((h) => h.status === s).length : page.households.length;
              return (
                <Link
                  key={s ?? "all"}
                  href={query({ status: s })}
                  aria-current={s === status ? "page" : undefined}
                  className={cn("rounded-full border px-3 py-1", s === status ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/40")}
                >
                  {t("list.filterItem", { label: s ? tStatus(s) : t("list.all"), count })}
                </Link>
              );
            })}
          </nav>
          {remindable && (!card || card.kind === "invitation") && (
            <RemindAllButton websiteId={id} open={openHouseholds.length} withEmail={page.emailReminders && page.cards.some((c) => c.kind === "invitation") ? openHouseholds.filter((h) => h.email).length : 0} />
          )}
        </div>
        {card && (
          <nav aria-label={tSending("filter")} className="flex flex-wrap gap-2 text-sm" data-testid="delivery-filter">
            {[undefined, ...(Object.keys(DELIVERY_FILTERS) as DeliveryFilter[])].map((f) => (
              <Link
                key={f ?? "all"}
                href={query({ versand: f })}
                aria-current={f === (deliveryFilter ?? undefined) ? "page" : undefined}
                className={cn("rounded-full border px-3 py-1", f === (deliveryFilter ?? undefined) ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/40")}
              >
                {f ? tSending(`filters.${f}`, { kind: tKinds(card.kind) }) : t("list.all")}
              </Link>
            ))}
          </nav>
        )}
        {shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-muted-foreground" data-testid="guests-empty">
            {page.households.length === 0 ? t("list.empty") : t("list.emptyFilter")}
          </p>
        ) : (
          <ul className="space-y-3">
            {shown.map((h) => {
              const household = h.link ? { id: h.id, name: h.name, email: h.email, link: h.link } : null;
              return (
                <li key={h.id} className="space-y-3 rounded-2xl border border-border bg-card p-4" data-testid="household">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-heading text-xl font-medium">{h.name}</h3>
                    <Badge variant={h.status === "open" ? "outline" : "secondary"} data-testid="household-status">
                      {tStatus(h.status)}
                    </Badge>
                    {card && <DeliveryBadge entry={h} kind={card.kind} timeZone={page.website.timezone} />}
                    <span className="text-sm text-muted-foreground">{t("list.people", { count: h.people.length, names: h.people.map((p) => p.name).join(", ") })}</span>
                    {h.invitedEventIds && page.events.length > 0 && (
                      <span className="text-sm text-muted-foreground">{t("list.invitedTo", { events: h.events.map((e) => e.name).join(", ") || t("list.noEvent") })}</span>
                    )}
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground" data-testid="household-channel">
                      {h.email ? <Mail className="size-3.5" aria-hidden /> : <MessageCircle className="size-3.5" aria-hidden />}
                      {h.email ? tSending("channelEmail", { email: h.email }) : h.unsubscribedAt ? tSending("channelUnsubscribed") : tSending("channelLink")}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {card && household && card.active ? (
                      <CardSendButtons
                        websiteId={id}
                        kind={card.kind}
                        household={household}
                        message={card.message}
                        emailSending={page.emailSending}
                        excluded={h.deliveries[card.kind]?.excluded ?? false}
                      />
                    ) : !card && h.link ? (
                      <>
                        <CopyLinkButton url={h.link} household={h.name} />
                        <Button asChild variant="secondary" size="sm">
                          <a href={whatsappUrl(whatsappMessage, h.name, h.link)} target="_blank" rel="noopener noreferrer">
                            <MessageCircle aria-hidden />
                            {t("list.whatsapp")}
                          </a>
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button asChild variant="secondary" size="sm">
                          <Link href="/preise">
                            <Lock aria-hidden />
                            {t("list.copyLink")}
                          </Link>
                        </Button>
                        <Button asChild variant="secondary" size="sm">
                          <Link href="/preise">
                            <Lock aria-hidden />
                            {t("list.whatsapp")}
                          </Link>
                        </Button>
                      </>
                    )}
                    {household && h.status === "open" && remindable && (!card || card.kind === "invitation") && (
                      <ReminderButton websiteId={id} household={household} byEmail={page.emailReminders && page.cards.some((c) => c.kind === "invitation")} message={page.reminderMessage} />
                    )}
                    <span className="ml-auto flex gap-1">
                      <HouseholdDialog
                        websiteId={id}
                        events={page.events}
                        household={{
                          id: h.id,
                          name: h.name,
                          invitedEventIds: h.invitedEventIds,
                          email: h.email,
                          personalLine: h.personalLine,
                          unsubscribed: !!h.unsubscribedAt && !h.email,
                          people: h.people.map((p) => ({ id: p.id, name: p.name, isChild: p.isChild })),
                        }}
                      />
                      <DeleteHouseholdButton websiteId={id} householdId={h.id} name={h.name} />
                    </span>
                  </div>
                  <HouseholdDetails entry={h} page={page} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
