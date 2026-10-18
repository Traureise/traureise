"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { submitGuestResponseAction } from "@/app/actions/guests";
import type { GuestForm as GuestFormData } from "@/application/guests";
import { mealApplies, type Poll, type PollAnswer } from "@/domain/guests";
import type { FieldErrors } from "@/domain/result";
import { dateFromIso } from "@/lib/format";

type PersonState = { attending: boolean | null; eventIds: string[]; mealOptionId: string | null; allergies: string; polls: Record<string, PollAnswer> };

function FormError({ code }: { code?: string }) {
  const t = useTranslations("errors");
  if (!code) return null;
  return (
    <p role="alert" className="site-error">
      {t.has(code) ? t(code) : t("unknown")}
    </p>
  );
}

function PollField({ poll, value, onChange, name, errors }: { poll: Poll; value: PollAnswer | undefined; onChange: (a: PollAnswer) => void; name: string; errors: FieldErrors }) {
  const t = useTranslations("rsvp");
  const answer = value ?? { optionIds: [], other: null };
  const otherOn = answer.other !== null;
  const pick = (id: string, checked: boolean) =>
    onChange(
      poll.multiple
        ? { ...answer, optionIds: checked ? [...answer.optionIds, id] : answer.optionIds.filter((x) => x !== id) }
        : { optionIds: checked ? [id] : [], other: null },
    );
  return (
    <fieldset className="space-y-2">
      <legend className="font-medium">{poll.question}</legend>
      {poll.options.map((o) => (
        <label key={o.id} className="site-choice">
          <input type={poll.multiple ? "checkbox" : "radio"} name={name} checked={answer.optionIds.includes(o.id)} onChange={(e) => pick(o.id, e.target.checked)} />
          {o.label}
        </label>
      ))}
      {poll.allowOther && (
        <div className="space-y-2">
          <label className="site-choice">
            <input
              type={poll.multiple ? "checkbox" : "radio"}
              name={name}
              checked={otherOn}
              onChange={(e) => onChange(poll.multiple ? { ...answer, other: e.target.checked ? "" : null } : { optionIds: [], other: e.target.checked ? "" : null })}
            />
            {t("other")}
          </label>
          {otherOn && <input className="site-field" aria-label={t("otherLabel", { question: poll.question })} value={answer.other ?? ""} onChange={(e) => onChange({ ...answer, other: e.target.value })} />}
        </div>
      )}
      <FormError code={errors[name]} />
    </fieldset>
  );
}

/**
 * One form per household: who is coming, to which events, meal, allergies, polls, requests to bring
 * someone, and a message. The same component is the couple's preview (`token` null, nothing is sent).
 */
export function GuestForm({ form, token }: { form: GuestFormData; token: string | null }) {
  const t = useTranslations("rsvp");
  const tRequest = useTranslations("rsvp.requestStatus");
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);
  const { household, events, meal, polls, website } = form;
  const allEvents = events.map((e) => e.id);
  const [people, setPeople] = useState<Record<string, PersonState>>(() =>
    Object.fromEntries(
      household.people.map((p) => [
        p.id,
        { attending: p.attending, eventIds: p.attending ? p.eventIds : allEvents, mealOptionId: p.mealOptionId, allergies: p.allergies, polls: p.pollAnswers },
      ]),
    ),
  );
  const [householdPolls, setHouseholdPolls] = useState<Record<string, PollAnswer>>(household.pollAnswers);
  const [message, setMessage] = useState(household.message);
  const [requests, setRequests] = useState<string[]>([""]);
  const readOnly = form.state === "closed";
  const date = (iso: string, style: "long" | "full" = "long") => format.dateTime(dateFromIso(iso), { dateStyle: style, timeZone: "UTC" });
  const update = (id: string, patch: Partial<PersonState>) => setPeople((all) => ({ ...all, [id]: { ...all[id]!, ...patch } }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setSaved(false);
    start(async () => {
      const result = await submitGuestResponseAction(token, {
        people: Object.fromEntries(Object.entries(people).map(([id, p]) => [id, { ...p, polls: p.attending ? p.polls : {} }])),
        polls: householdPolls,
        message,
        requests,
      });
      if (result.ok) {
        setErrors({});
        setRequests([""]);
        setSaved(true);
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? { _: result.error ?? "unknown" });
      }
    });
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-10 px-6 py-14" aria-label={t("formLabel")} data-testid="guest-form">
      <header className="space-y-3 text-center">
        <p className="site-eyebrow">{website.title}</p>
        <h1 className="text-4xl sm:text-5xl">{t("greeting", { household: household.name })}</h1>
        {website.weddingDate && <p className="text-lg">{date(website.weddingDate, "full")}</p>}
        {form.replyBy && !readOnly && <p className="site-muted">{t("replyBy", { date: date(form.replyBy) })}</p>}
        <div className="site-divider" aria-hidden />
      </header>

      {form.state === "preview" && (
        <p className="site-surface rounded-xl p-4 text-sm" role="note" data-testid="preview-note">
          {t("previewNote")}
        </p>
      )}
      {readOnly && (
        <p className="site-surface rounded-xl p-4 text-sm" role="note" data-testid="closed-note">
          {t("closed", { title: website.title })}
        </p>
      )}
      {!readOnly && household.respondedAt && !saved && (
        <p className="site-surface rounded-xl p-4 text-sm" role="note" data-testid="answered-note">
          {form.replyBy ? t("answeredUntil", { date: date(form.replyBy) }) : t("answered")}
        </p>
      )}

      <fieldset disabled={readOnly} className="space-y-8">
        {household.people.map((p) => {
          const state = people[p.id]!;
          const key = `people.${p.id}`;
          const personPolls = polls.filter((x) => x.per === "person");
          return (
            <section key={p.id} className="site-surface space-y-5 rounded-2xl p-6" data-testid="guest-form-person" aria-label={p.name}>
              <h2 className="text-2xl">
                {p.name}
                {p.isChild && <span className="site-muted text-base"> · {t("child")}</span>}
              </h2>
              <div className="flex flex-wrap gap-x-8 gap-y-2" role="radiogroup" aria-label={t("attendingLabel", { name: p.name })}>
                <label className="site-choice">
                  <input type="radio" name={`${key}.attending`} checked={state.attending === true} onChange={() => update(p.id, { attending: true })} />
                  {t("yes")}
                </label>
                <label className="site-choice">
                  <input type="radio" name={`${key}.attending`} checked={state.attending === false} onChange={() => update(p.id, { attending: false })} />
                  {t("no")}
                </label>
              </div>
              <FormError code={errors[`${key}.attending`]} />

              {state.attending && (
                <div className="space-y-5">
                  {events.length > 0 && (
                    <fieldset className="space-y-2">
                      <legend className="font-medium">{t("events")}</legend>
                      {events.map((e) => (
                        <label key={e.id} className="site-choice">
                          <input
                            type="checkbox"
                            checked={state.eventIds.includes(e.id)}
                            onChange={(ev) => update(p.id, { eventIds: ev.target.checked ? [...state.eventIds, e.id] : state.eventIds.filter((id) => id !== e.id) })}
                          />
                          {t("event", { name: e.name, date: date(e.startDate), time: e.startTime })}
                        </label>
                      ))}
                      <FormError code={errors[`${key}.eventIds`]} />
                    </fieldset>
                  )}
                  {meal && mealApplies(meal, state.eventIds) && (
                    <fieldset className="space-y-2">
                      <legend className="font-medium">{t("meal")}</legend>
                      {meal.options.map((o) => (
                        <label key={o.id} className="site-choice">
                          <input type="radio" name={`${key}.meal`} checked={state.mealOptionId === o.id} onChange={() => update(p.id, { mealOptionId: o.id })} />
                          {o.label}
                        </label>
                      ))}
                      <FormError code={errors[`${key}.mealOptionId`]} />
                    </fieldset>
                  )}
                  <div className="space-y-2">
                    <label htmlFor={`${p.id}-allergies`} className="font-medium">
                      {t("allergies")}
                    </label>
                    <input id={`${p.id}-allergies`} className="site-field" value={state.allergies} onChange={(e) => update(p.id, { allergies: e.target.value })} placeholder={t("allergiesPlaceholder")} />
                    <FormError code={errors[`${key}.allergies`]} />
                  </div>
                  {personPolls.map((poll) => (
                    <PollField
                      key={poll.id}
                      poll={poll}
                      name={`${key}.polls.${poll.id}`}
                      errors={errors}
                      value={state.polls[poll.id]}
                      onChange={(a) => update(p.id, { polls: { ...state.polls, [poll.id]: a } })}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {polls.some((x) => x.per === "household") && (
          <section className="site-surface space-y-5 rounded-2xl p-6" aria-label={t("householdQuestions")}>
            <h2 className="text-2xl">{t("householdQuestions")}</h2>
            {polls
              .filter((x) => x.per === "household")
              .map((poll) => (
                <PollField key={poll.id} poll={poll} name={`polls.${poll.id}`} errors={errors} value={householdPolls[poll.id]} onChange={(a) => setHouseholdPolls((all) => ({ ...all, [poll.id]: a }))} />
              ))}
          </section>
        )}

        <section className="site-surface space-y-4 rounded-2xl p-6" aria-label={t("bringSomeone")}>
          <h2 className="text-2xl">{t("bringSomeone")}</h2>
          <p className="site-muted text-sm">{t("bringSomeoneHint")}</p>
          {household.requests.length > 0 && (
            <ul className="space-y-1 text-sm" data-testid="request-outcomes">
              {household.requests.map((r) => (
                <li key={r.id}>{t("requestLine", { name: r.name, status: tRequest(r.status) })}</li>
              ))}
            </ul>
          )}
          {!readOnly &&
            requests.map((name, i) => (
              <input
                key={i}
                className="site-field"
                aria-label={t("requestName", { n: i + 1 })}
                value={name}
                onChange={(e) => setRequests((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
              />
            ))}
          {!readOnly && (
            <button type="button" className="site-button" onClick={() => setRequests((list) => [...list, ""])}>
              {t("addRequest")}
            </button>
          )}
          <FormError code={errors.requests} />
        </section>

        <section className="space-y-2">
          <label htmlFor="guest-message" className="font-medium">
            {t("message", { title: website.title })}
          </label>
          <textarea id="guest-message" className="site-field" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          <FormError code={errors.message} />
        </section>
      </fieldset>

      <div className="space-y-3 text-center">
        <FormError code={errors._ ?? errors.people} />
        {saved && (
          <p role="status" className="font-medium" data-testid="guest-form-saved">
            {t("saved")}
          </p>
        )}
        {!readOnly && (
          <button type="submit" className="site-submit" disabled={pending || !token}>
            {household.respondedAt ? t("update") : t("submit")}
          </button>
        )}
      </div>
    </form>
  );
}
