import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { CalendarClock, ChevronRight, ClipboardPen, Download, Lock, Mail, MessageCircle } from "lucide-react";
import type { GuestListEntry, GuestPage } from "@/application/guests";
import { CardShareButtons, HouseholdMenu, MarkAllSentButton, RemindAllButton, SendAllButton } from "@/components/guests/card-sending";
import { RequestActions } from "@/components/guests/guest-actions";
import { CardPicker, Segmented } from "@/components/guests/card-picker";
import { AddGuests } from "@/components/guests/household-dialog";
import { ResponseBar } from "@/components/guests/response-bar";
import { VersionSelects } from "@/components/guests/version-select";
import { CopyLinkButton } from "@/components/share/copy-link-button";
import { WhatsAppButton } from "@/components/share/whatsapp-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cardCounts, deliveryStatus, emailRecipients, sentAt, type DeliveryStatus, type HouseholdCardKind } from "@/domain/cards";
import type { HouseholdStatus } from "@/domain/guests";
import { loadGuestPage } from "@/lib/guests";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; karte?: string; versand?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page } = await loadGuestPage((await params).id);
  return { title: `${(await getTranslations("guests"))("title")} · ${page.wedding.title}` };
}

const STATUSES: HouseholdStatus[] = ["open", "answered", "declined"];
/** The dot in a household's margin: filled once it answered, hollow while open. */
const STATUS_DOT: Record<HouseholdStatus, string> = { open: "border border-primary/50", answered: "bg-primary", declined: "bg-primary/35" };
/** Filters by what happened with the chosen card ("Einladung nicht geöffnet"). */
const DELIVERY_FILTERS = {
  "nicht-gesendet": (s: DeliveryStatus) => s === "notSent" || s === "queued" || s === "failed",
  "nicht-geoeffnet": (s: DeliveryStatus) => s === "sent",
  geoeffnet: (s: DeliveryStatus) => s === "opened",
} as const;
type DeliveryFilter = keyof typeof DELIVERY_FILTERS;

/** Sent how and when, or opened when: one line per household and card; with versions, which one it gets. */
async function DeliveryBadge({ entry, kind, timeZone, version }: { entry: GuestListEntry; kind: HouseholdCardKind; timeZone: string; version: string | null }) {
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
      {version ? `${version} · ${label}` : label}
    </Badge>
  );
}
/** A small group of counts under the response bar (per event, per dish, per poll answer). */
function Facts({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-2" data-testid={testId}>
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Counts({ rows }: { rows: { key: string; label: string; count: number }[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((r) => (
        <li key={r.key} className="flex justify-between gap-4 border-b border-dotted border-border pb-1 last:border-0">
          <span className="text-muted-foreground">{r.label}</span>
          <span className="font-medium tabular-nums">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Where the answers stand: the response bar by person, then only the counts there are (events, dishes, polls,
 * allergies). Requests to bring someone come first, because they wait for the couple.
 */
async function Overview({ page }: { page: GuestPage }) {
  const t = await getTranslations("guests.overview");
  const { overview, wedding } = page;
  const { people } = overview;
  const parts = [
    { key: "coming" as const, label: t("coming"), value: people.coming },
    { key: "notComing" as const, label: t("notComing"), value: people.notComing },
    { key: "open" as const, label: t("open"), value: people.open },
  ];
  const showMeals = overview.meals.length > 0 && overview.meals.some((m) => m.count > 0);
  return (
    <section aria-labelledby="overview-title" className="space-y-8" data-testid="guest-overview">
      <h2 id="overview-title" className="sr-only">
        {t("title")}
      </h2>
      {overview.requests.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-primary/30 bg-primary/[0.04] p-5" data-testid="overview-requests">
          <h3 className="font-heading text-xl font-medium">{t("requests")}</h3>
          <ul className="divide-y divide-primary/15">
            {overview.requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0" data-testid="guest-request">
                <span>{t("request", { name: r.name, household: r.household })}</span>
                <RequestActions weddingId={wedding.id} requestId={r.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="space-y-3" data-testid="overview-people">
        <ResponseBar parts={parts} label={t("chartLabel", people)} />
        <p className="text-sm text-muted-foreground" data-testid="overview-households">
          {t("households", overview.households)}
        </p>
      </div>
      {(overview.events.length > 0 || showMeals || overview.polls.length > 0 || overview.allergies.length > 0) && (
        <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {overview.events.length > 0 && (
            <Facts title={t("events")} testId="overview-events">
              <Counts rows={overview.events.map((e) => ({ key: e.id, label: e.name, count: e.count }))} />
            </Facts>
          )}
          {showMeals && (
            <Facts title={t("meals")} testId="overview-meals">
              <Counts rows={overview.meals.map((m) => ({ key: m.id, label: m.label, count: m.count }))} />
            </Facts>
          )}
          {overview.polls.map((poll) => (
            <Facts key={poll.id} title={poll.question} testId="overview-poll">
              <Counts rows={poll.options.map((o) => ({ key: o.id, label: o.label, count: o.count }))} />
              {poll.other.length > 0 && <p className="text-sm text-muted-foreground">{t("otherAnswers", { answers: poll.other.join(", ") })}</p>}
            </Facts>
          ))}
          {overview.allergies.length > 0 && (
            <Facts title={t("allergies")} testId="overview-allergies">
              <ul className="space-y-1 text-sm">
                {overview.allergies.map((a, i) => (
                  <li key={i}>{t("allergyLine", a)}</li>
                ))}
              </ul>
            </Facts>
          )}
        </div>
      )}
    </section>
  );
}

async function HouseholdDetails({ entry, page }: { entry: GuestListEntry; page: GuestPage }) {
  const tAnswer = await getTranslations("guests.answerFor");
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
    <details className="group text-sm">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-primary underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
        {t("show")}
      </summary>
      <div className="mt-3 space-y-4 rounded-xl bg-secondary/40 p-4">
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
        <Link href={`/hochzeiten/${page.wedding.id}/gaeste/${entry.id}/antwort`} className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline">
          <ClipboardPen className="size-4" aria-hidden />
          {entry.respondedAt ? tAnswer("change") : tAnswer("menu")}
        </Link>
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
  const tAnswer = await getTranslations("guests.answerFor");
  const tSending = await getTranslations("guests.sending");
  const tKinds = await getTranslations("cardKinds");
  const format = await getFormatter();
  const status = STATUSES.find((s) => s === statusParam);
  const card = page.cards.find((c) => c.kind === karte) ?? null;
  const deliveryFilter = card && versand && versand in DELIVERY_FILTERS ? (versand as DeliveryFilter) : null;
  const shown = page.households
    .filter((h) => !status || h.status === status)
    .filter((h) => !card || !deliveryFilter || DELIVERY_FILTERS[deliveryFilter](deliveryStatus(h.deliveries[card.kind])));
  const base = `/hochzeiten/${id}/gaeste`;
  const query = (patch: Record<string, string | undefined>) => {
    const all: Record<string, string | undefined> = { status, karte: card?.kind, versand: deliveryFilter ?? undefined, ...patch };
    const params = new URLSearchParams(Object.entries(all).flatMap(([k, v]) => (v ? [[k, v]] : [])));
    return params.size ? `${base}?${params}` : base;
  };
  const whatsappMessage = page.settings.whatsappMessage ?? t("list.whatsappDefault", { title: page.wedding.title });
  const versionLabel = (entry: GuestListEntry, kind: HouseholdCardKind) => page.versionChoices.find((c) => c.item === kind)?.versions.find((v) => v.id === entry.versions[kind])?.label ?? null;
  const locked = page.billingEnabled && !page.sending;
  const openHouseholds = page.households.filter((h) => h.status === "open");
  const remindable = page.replyOpen && (page.sending || page.emailReminders);
  const counts = card ? cardCounts(page.households.map((h) => h.deliveries[card.kind])) : null;
  const recipients = card ? emailRecipients(page.households.map((h) => ({ ...h, delivery: h.deliveries[card.kind] }))).length : 0;
  // Households the card is meant for that have not had it yet (what "Alle als gesendet markieren" marks).
  const unsent = card ? page.households.filter((h) => !h.deliveries[card.kind]?.excluded && !sentAt(h.deliveries[card.kind])).length : 0;

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
          </div>
        </div>
        <AddGuests weddingId={id} events={page.events} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label={t("list.filter")}
            items={[undefined, ...STATUSES].map((s) => {
              const count = s ? page.households.filter((h) => h.status === s).length : page.households.length;
              const label = s ? tStatus(s) : t("list.all");
              return { key: s ?? "all", label, count, ariaLabel: t("list.filterItem", { label, count }), href: query({ status: s }), current: s === status };
            })}
          />
          <div className="flex flex-wrap items-center gap-3">
            {remindable && (!card || card.kind === "invitation") && (
              <RemindAllButton weddingId={id} open={openHouseholds.length} withEmail={page.emailReminders && page.cards.some((c) => c.kind === "invitation") ? openHouseholds.filter((h) => h.email).length : 0} />
            )}
            {page.cards.length > 0 && (
              <CardPicker
                label={tSending("choose")}
                options={[null, ...page.cards.map((c) => c.kind)].map((kind) => ({
                  key: kind ?? "rsvp",
                  label: kind ? tKinds(kind) : tSending("rsvpLink"),
                  href: query({ karte: kind ?? undefined, versand: undefined }),
                  current: (card?.kind ?? null) === kind,
                }))}
              />
            )}
          </div>
        </div>
        {card && counts && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4" data-testid="card-sending">
            <div className="space-y-3">
              <p className="text-sm" data-testid="card-sending-counts">
                {tSending("counts", counts)}
              </p>
              <Segmented
                label={tSending("filter")}
                testId="delivery-filter"
                items={[undefined, ...(Object.keys(DELIVERY_FILTERS) as DeliveryFilter[])].map((f) => ({
                  key: f ?? "all",
                  label: f ? tSending(`filters.${f}`, { kind: tKinds(card.kind) }) : t("list.all"),
                  href: query({ versand: f }),
                  current: f === (deliveryFilter ?? undefined),
                }))}
              />
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              {card.waitsForDate ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="card-waits-for-date">
                  <CalendarClock className="size-4" aria-hidden />
                  {tSending("waitsForDate")}{" "}
                  <Link href={`/hochzeiten/${id}/hochzeit`} className="text-primary underline-offset-4 hover:underline">
                    {tSending("setDate")}
                  </Link>
                </p>
              ) : !card.active ? (
                <Button asChild>
                  <Link href="/preise">
                    <Lock aria-hidden />
                    {tSending("unlock")}
                  </Link>
                </Button>
              ) : (
                <>
                  <MarkAllSentButton weddingId={id} kind={card.kind} count={unsent} />
                  {page.emailSending ? (
                    <SendAllButton weddingId={id} kind={card.kind} count={recipients} />
                  ) : (
                    <Button asChild variant="outline">
                      <Link href="/preise">
                        <Lock aria-hidden />
                        {tSending("emailLocked")}
                      </Link>
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-muted-foreground" data-testid="guests-empty">
            {page.households.length === 0 ? t("list.empty") : t("list.emptyFilter")}
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {shown.map((h) => {
              const household = h.link ? { id: h.id, name: h.name, email: h.email, link: h.link } : null;
              const delivery = card ? (h.deliveries[card.kind] ?? null) : null;
              const canRemind = !!household && h.status === "open" && remindable && (!card || card.kind === "invitation");
              return (
                <li key={h.id} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 px-4 py-4 sm:px-5" data-testid="household">
                  <span className={cn("mt-2 size-2.5 rounded-full", STATUS_DOT[h.status])} aria-hidden />
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h3 className="font-heading text-xl font-medium">{h.name}</h3>
                        <span className={cn("text-xs font-medium", h.status === "open" ? "text-muted-foreground" : "text-primary")} data-testid="household-status">
                          {tStatus(h.status)}
                          {h.respondedAt && h.answeredBy === "couple" && <span className="font-normal text-muted-foreground"> · {tAnswer("byCouple")}</span>}
                        </span>
                        {card && <DeliveryBadge entry={h} kind={card.kind} timeZone={page.wedding.timezone} version={versionLabel(h, card.kind)} />}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {card && card.waitsForDate ? null : card && household && card.active ? (
                          <CardShareButtons
                            weddingId={id}
                            kind={card.kind}
                            household={household}
                            message={h.messages[card.kind]}
                            emailSending={page.emailSending}
                            excluded={delivery?.excluded ?? false}
                          />
                        ) : !card && h.link ? (
                          <>
                            <CopyLinkButton url={h.link} copiedMessage={t("list.linkCopied", { household: h.name })} />
                            <WhatsAppButton message={whatsappMessage} name={h.name} link={h.link} />
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
                        <HouseholdMenu
                          weddingId={id}
                          events={page.events}
                          household={{
                            id: h.id,
                            name: h.name,
                            link: h.link,
                            invitedEventIds: h.invitedEventIds,
                            email: h.email,
                            personalLine: h.personalLine,
                            unsubscribed: !!h.unsubscribedAt && !h.email,
                            people: h.people.map((p) => ({ id: p.id, name: p.name, isChild: p.isChild })),
                          }}
                          card={
                            card && household && card.active && !card.waitsForDate
                              ? { kind: card.kind, sent: !!sentAt(delivery), markedByHand: delivery?.sharedVia === "manual" && !delivery?.emailedAt, excluded: delivery?.excluded ?? false }
                              : null
                          }
                          reminder={canRemind ? { byEmail: page.emailReminders && page.cards.some((c) => c.kind === "invitation"), message: h.reminderMessage } : null}
                        />
                      </div>
                    </div>
                    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>{t("list.people", { count: h.people.length, names: h.people.map((p) => (p.isChild ? t("list.child", { name: p.name }) : p.name)).join(", ") })}</span>
                      {h.invitedEventIds && page.events.length > 0 && <span>{t("list.invitedTo", { events: h.events.map((e) => e.name).join(", ") || t("list.noEvent") })}</span>}
                      <span className="inline-flex items-center gap-1" data-testid="household-channel">
                        {h.email ? <Mail className="size-3.5" aria-hidden /> : <MessageCircle className="size-3.5" aria-hidden />}
                        {h.email ? tSending("channelEmail", { email: h.email }) : h.unsubscribedAt ? tSending("channelUnsubscribed") : tSending("channelLink")}
                      </span>
                    </p>
                    <VersionSelects weddingId={id} household={{ id: h.id, name: h.name, versions: h.versions }} choices={page.versionChoices} />
                    <HouseholdDetails entry={h} page={page} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
