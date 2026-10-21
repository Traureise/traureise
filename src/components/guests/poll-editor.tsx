"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deletePollAction, savePollAction } from "@/app/actions/guests";
import { useSave } from "@/components/editor/use-save";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Poll, PollScope } from "@/domain/guests";
import { blankOption, OptionList, toOptions } from "./rsvp-settings-form";

/** Creates a poll, or edits one (`poll` set). */
export function PollForm({ weddingId, poll, onDone }: { weddingId: string; poll?: Poll; onDone: () => void }) {
  const t = useTranslations("guests.polls");
  const router = useRouter();
  const { pending, errors, save } = useSave();
  const prefix = poll ? `poll-${poll.id}` : "poll-new";
  const [question, setQuestion] = useState(poll?.question ?? "");
  const [options, setOptions] = useState(() => (poll ? toOptions(poll.options) : [blankOption(), blankOption()]));
  const [multiple, setMultiple] = useState(poll?.multiple ?? false);
  const [allowOther, setAllowOther] = useState(poll?.allowOther ?? false);
  const [per, setPer] = useState<PollScope>(poll?.per ?? "person");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    save(
      () => savePollAction(weddingId, poll?.id ?? null, { question, options: options.map(({ id, label }) => ({ id, label })), multiple, allowOther, per }),
      () => {
        router.refresh();
        onDone();
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-background p-4" aria-label={poll ? t("editTitle") : t("newTitle")}>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-question`}>{t("question")}</Label>
        <Input id={`${prefix}-question`} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("questionPlaceholder")} />
        <FieldError code={errors.question} />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("options")}</legend>
        <OptionList options={options} onChange={setOptions} label={(n) => t("option", { n })} addLabel={t("addOption")} removeLabel={(n) => t("removeOption", { n })} />
        <FieldError code={errors.options} />
      </fieldset>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} className="size-4 accent-primary" />
          {t("multiple")}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={allowOther} onChange={(e) => setAllowOther(e.target.checked)} className="size-4 accent-primary" />
          {t("allowOther")}
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <legend className="mb-2 text-sm font-medium">{t("per")}</legend>
        {(["person", "household"] as const).map((scope) => (
          <label key={scope} className="flex items-center gap-2">
            <input type="radio" name={`${prefix}-per`} checked={per === scope} onChange={() => setPer(scope)} className="size-4 accent-primary" />
            {t(`scopes.${scope}`)}
          </label>
        ))}
      </fieldset>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

export function PollList({ weddingId, polls }: { weddingId: string; polls: Poll[] }) {
  const t = useTranslations("guests.polls");
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, start] = useTransition();
  return (
    <div className="space-y-3">
      {polls.length === 0 && editing !== "new" && <p className="rounded-xl border border-dashed border-input px-4 py-3 text-sm text-muted-foreground">{t("empty")}</p>}
      <ul className="space-y-3">
        {polls.map((poll) => (
          <li key={poll.id} data-testid="poll">
            {editing === poll.id ? (
              <PollForm weddingId={weddingId} poll={poll} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background p-4">
                <div className="flex-1">
                  <p className="font-medium">{poll.question}</p>
                  <p className="text-sm text-muted-foreground">{t("summary", { options: poll.options.map((o) => o.label).join(", "), per: t(`scopes.${poll.per}`) })}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(poll.id)}>
                  {t("edit")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={deleting}
                  onClick={() => {
                    if (!window.confirm(t("confirmDelete", { question: poll.question }))) return;
                    start(async () => {
                      await deletePollAction(weddingId, poll.id);
                      toast.success(t("deleted"));
                      router.refresh();
                    });
                  }}
                >
                  <Trash2 aria-hidden />
                  {t("delete")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing === "new" ? (
        <PollForm weddingId={weddingId} onDone={() => setEditing(null)} />
      ) : (
        <Button type="button" variant="outline" onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          {t("add")}
        </Button>
      )}
    </div>
  );
}
