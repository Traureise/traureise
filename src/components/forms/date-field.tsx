import { FieldError } from "@/components/forms/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  label: string;
  name?: string;
  /** Controlled when `onChange` is set, else the initial value. */
  value?: string | null;
  onChange?: (value: string) => void;
  disabled?: boolean;
  hint?: string;
  error?: string;
  className?: string;
};

/** The one date input: label, a native date picker (German format in the browser), hint and error. */
export function DateField({ id, label, name, value, onChange, disabled, hint, error, className }: Props) {
  const controlled = onChange ? { value: value ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) } : { defaultValue: value ?? undefined };
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type="date" disabled={disabled} className="w-auto" aria-describedby={hint ? `${id}-hint` : undefined} {...controlled} />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      <FieldError code={error} />
    </div>
  );
}
