"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { LogOut, Mail, Send, UserMinus } from "lucide-react";
import { toast } from "sonner";
import {
  changeMemberRoleAction,
  inviteMemberAction,
  leaveWeddingAction,
  removeMemberAction,
  setContactPersonAction,
  withdrawInvitationAction,
} from "@/app/actions/members";
import { FieldError } from "@/components/forms/field-error";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isRole, type Role } from "@/domain/members";
import type { ActionResult } from "@/lib/action-result";

export type MemberRow = {
  userId: string;
  email: string;
  firstName: string | null;
  role: Role;
};
export type InvitationRow = {
  id: string;
  email: string;
  role: Role;
  expiresAt: Date;
};

const SELECT = "h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50";
const ROLES: Role[] = ["editor", "admin"];

/** The error code of a failed action, whichever field the use case put it on. */
function errorOf(result: ActionResult): string | null {
  if (result.ok) return null;
  const fields = result.fieldErrors ?? {};
  return fields._ ?? fields.role ?? fields.contact ?? fields.email ?? result.error ?? "unknown";
}

/**
 * The Personen section of the Hochzeit tab: who works on the wedding. Admins change roles, the contact person
 * and invite or remove people; editors see the list. Everyone may leave, except the last admin.
 */
export function MembersSection({
  weddingId,
  weddingTitle,
  currentUserId,
  members,
  invitations,
  contactUserId,
  canManage,
}: {
  weddingId: string;
  weddingTitle: string;
  currentUserId: string;
  members: MemberRow[];
  invitations: InvitationRow[];
  contactUserId: string | null;
  canManage: boolean;
}) {
  const t = useTranslations("weddings.members");
  const tErrors = useTranslations("errors");
  const format = useFormatter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const name = (m: { firstName: string | null; email: string }) => m.firstName || m.email;

  /** Runs a member action; a failure shows above the list, a success as a toast. */
  function run(action: () => Promise<ActionResult>, done?: string) {
    start(async () => {
      const result = await action();
      setError(errorOf(result));
      if (result.ok && done) toast.success(done);
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {tErrors.has(error) ? tErrors(error) : tErrors("unknown")}
        </p>
      )}

      <ul className="divide-y divide-border rounded-2xl border border-border" data-testid="member-list">
        {members.map((m) => {
          const self = m.userId === currentUserId;
          return (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="member">
              <div className="min-w-0 space-y-0.5">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <span className="break-all">{name(m)}</span>
                  {self && <span className="text-sm font-normal text-muted-foreground">{t("you")}</span>}
                  {m.userId === contactUserId && <Badge variant="secondary">{t("contact")}</Badge>}
                </p>
                {m.firstName && <p className="text-sm break-all text-muted-foreground">{m.email}</p>}
              </div>
              {canManage ? (
                <div className="flex items-center gap-2">
                  <select
                    aria-label={t("roleOf", { name: name(m) })}
                    className={SELECT}
                    value={m.role}
                    disabled={pending}
                    onChange={(e) => isRole(e.target.value) && run(() => changeMemberRoleAction(weddingId, m.userId, e.target.value as Role), t("roleChanged"))}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`roles.${r}`)}
                      </option>
                    ))}
                  </select>
                  {!self && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" aria-label={t("removeLabel", { name: name(m) })} disabled={pending}>
                          <UserMinus aria-hidden />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("removeTitle", { name: name(m) })}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("removeBody", {
                              name: name(m),
                              title: weddingTitle,
                            })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => run(() => removeMemberAction(weddingId, m.userId), t("removed", { name: name(m) }))}
                          >
                            {t("remove")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">{t(`roles.${m.role}`)}</span>
              )}
            </li>
          );
        })}
      </ul>

      {canManage && (
        <div className="space-y-2">
          <Label htmlFor="contact-person">{t("contactLabel")}</Label>
          <select
            id="contact-person"
            className={`${SELECT} block w-full max-w-sm`}
            value={contactUserId ?? ""}
            disabled={pending}
            aria-describedby="contact-person-hint"
            onChange={(e) => run(() => setContactPersonAction(weddingId, e.target.value), t("contactChanged"))}
          >
            {contactUserId === null && <option value="" />}
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {name(m)}
              </option>
            ))}
          </select>
          <p id="contact-person-hint" className="text-sm text-muted-foreground">
            {t("contactHint")}
          </p>
        </div>
      )}

      {canManage && invitations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t("invitations.title")}</h3>
          <ul className="divide-y divide-border rounded-2xl border border-dashed border-border" data-testid="invitation-list">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="invitation">
                <div className="min-w-0 space-y-0.5">
                  <p className="flex items-center gap-2 font-medium">
                    <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="break-all">{i.email}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("invitations.details", {
                      role: t(`roles.${i.role}`),
                      date: format.dateTime(i.expiresAt, { dateStyle: "long" }),
                    })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => withdrawInvitationAction(weddingId, i.id), t("invitations.withdrawn"))}
                >
                  {t("invitations.withdraw")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canManage && <InviteForm weddingId={weddingId} />}

      {/* Alone in the wedding there is no one to leave it to: deleting it is the way out. */}
      {members.length > 1 && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={pending}>
              <LogOut aria-hidden />
              {t("leave.button")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("leave.title")}</AlertDialogTitle>
              <AlertDialogDescription>{t("leave.body", { title: weddingTitle })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => run(() => leaveWeddingAction(weddingId))}>
                {t("leave.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

/** Email address and role; the invitee gets a link by mail. */
function InviteForm({ weddingId }: { weddingId: string }) {
  const t = useTranslations("weddings.members.invite");
  const tRoles = useTranslations("weddings.members.roles");
  const tErrors = useTranslations("errors");
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  // onSubmit, not a form action: an action resets the fields, which would lose the address on an error.
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    start(async () => {
      const result = await inviteMemberAction(weddingId, null, form);
      setState(result);
      if (!result.ok) return;
      toast.success(t("sent", { email: String(form.get("email")) }));
      formElement.reset();
    });
  }

  return (
    <form onSubmit={submit} aria-label={t("title")} className="space-y-4 rounded-2xl bg-secondary/40 p-5" noValidate>
      <h3 className="text-sm font-medium">{t("title")}</h3>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-2">
          <Label htmlFor="invite-email">{t("email")}</Label>
          <Input id="invite-email" name="email" type="email" autoComplete="off" required aria-describedby="invite-email-error" className="h-10" />
          <FieldError id="invite-email-error" code={errors.email} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-role">{t("role")}</Label>
          <select id="invite-role" name="role" defaultValue="editor" className={`${SELECT} block h-10 w-full`}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {tRoles(r)}
              </option>
            ))}
          </select>
          <FieldError code={errors.role} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      {state && !state.ok && state.error && (
        <p role="alert" className="text-sm text-destructive">
          {tErrors.has(state.error) ? tErrors(state.error) : tErrors("unknown")}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        <Send aria-hidden />
        {pending ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
