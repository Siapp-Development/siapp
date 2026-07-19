import { Button, Input, Label } from '@siapp/ui';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';

import { SkipLink } from '@/components/SkipLink.tsx';
import { provisionWorkspaceFn, type IProvisionInput } from '../lib/adminFunctions.ts';

type TVertical = 'construction' | 'legal';
type TPlan = 'trial' | 'standard' | 'business';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

const SLUG_RE = /^[a-z0-9-]{3,40}$/;

interface IFieldErrors {
  workspaceName?: string;
  workspaceSlug?: string;
  ownerEmail?: string;
  seatLimit?: string;
  planExpiresAt?: string;
}

/** Workspace provisioning form — creates workspace + first owner + starter project. */
export function ProvisionWorkspacePage() {
  const navigate = useNavigate();

  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [seatLimit, setSeatLimit] = useState(5);
  const [plan, setPlan] = useState<TPlan>('trial');
  const [planExpiresAt, setPlanExpiresAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [vertical, setVertical] = useState<TVertical>('construction');

  const [fieldErrors, setFieldErrors] = useState<IFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ wid: string; pid: string } | null>(null);
  const [pending, setPending] = useState(false);

  function handleNameChange(value: string): void {
    setWorkspaceName(value);
    if (!slugTouched) {
      setWorkspaceSlug(slugify(value));
    }
  }

  function validate(): IFieldErrors {
    const errors: IFieldErrors = {};
    if (workspaceName.trim() === '') errors.workspaceName = 'Workspace name is required.';
    if (!SLUG_RE.test(workspaceSlug)) {
      errors.workspaceSlug = 'Slug must be 3–40 lowercase letters, digits, or hyphens.';
    }
    if (!ownerEmail.includes('@')) errors.ownerEmail = 'Enter a valid email address.';
    if (seatLimit < 1 || seatLimit > 100 || !Number.isInteger(seatLimit)) {
      errors.seatLimit = 'Seat limit must be a whole number between 1 and 100.';
    }
    if (planExpiresAt === '' || Number.isNaN(Date.parse(planExpiresAt))) {
      errors.planExpiresAt = 'Enter a valid expiry date.';
    }
    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    try {
      const input: IProvisionInput = {
        workspaceName: workspaceName.trim(),
        workspaceSlug,
        ownerEmail,
        seatLimit,
        plan,
        planExpiresAt,
        vertical,
      };
      const result = await provisionWorkspaceFn(input);
      setSuccess(result.data);
      void navigate(`/workspaces/${result.data.wid}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Provisioning failed. Please try again.';
      setFormError(message);
    } finally {
      setPending(false);
    }
  }

  if (success !== null) {
    return (
      <main id="main" className="mx-auto max-w-xl py-10">
        <p role="status" aria-live="polite" className="text-sm">
          Redirecting to new workspace…
        </p>
      </main>
    );
  }

  return (
    <>
      <SkipLink />
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-semibold">Provision workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates the workspace, first owner, and a vertical-specific starter project.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="mt-6 space-y-4">
          {formError !== null && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}

          <div className="space-y-1">
            <Label htmlFor="workspaceName">Workspace name</Label>
            <Input
              id="workspaceName"
              value={workspaceName}
              onChange={(e) => handleNameChange(e.target.value)}
              aria-invalid={fieldErrors.workspaceName !== undefined}
              aria-describedby={fieldErrors.workspaceName !== undefined ? 'workspaceName-err' : undefined}
              required
            />
            {fieldErrors.workspaceName !== undefined && (
              <p id="workspaceName-err" className="text-xs text-destructive">
                {fieldErrors.workspaceName}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="workspaceSlug">Slug</Label>
            <Input
              id="workspaceSlug"
              value={workspaceSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setWorkspaceSlug(e.target.value);
              }}
              aria-invalid={fieldErrors.workspaceSlug !== undefined}
              aria-describedby={fieldErrors.workspaceSlug !== undefined ? 'slug-err' : 'slug-hint'}
              required
            />
            {fieldErrors.workspaceSlug !== undefined ? (
              <p id="slug-err" className="text-xs text-destructive">
                {fieldErrors.workspaceSlug}
              </p>
            ) : (
              <p id="slug-hint" className="text-xs text-muted-foreground">
                3–40 lowercase letters, digits, or hyphens.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="ownerEmail">Owner email</Label>
            <Input
              id="ownerEmail"
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              aria-invalid={fieldErrors.ownerEmail !== undefined}
              aria-describedby={fieldErrors.ownerEmail !== undefined ? 'email-err' : undefined}
              required
            />
            {fieldErrors.ownerEmail !== undefined && (
              <p id="email-err" className="text-xs text-destructive">
                {fieldErrors.ownerEmail}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="seatLimit">Seat limit</Label>
              <Input
                id="seatLimit"
                type="number"
                min={1}
                max={100}
                value={seatLimit}
                onChange={(e) => setSeatLimit(parseInt(e.target.value, 10))}
                aria-invalid={fieldErrors.seatLimit !== undefined}
                aria-describedby={fieldErrors.seatLimit !== undefined ? 'seats-err' : undefined}
                required
              />
              {fieldErrors.seatLimit !== undefined && (
                <p id="seats-err" className="text-xs text-destructive">
                  {fieldErrors.seatLimit}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="plan">Plan</Label>
              <select
                id="plan"
                value={plan}
                onChange={(e) => setPlan(e.target.value as TPlan)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                <option value="trial">Trial</option>
                <option value="standard">Standard</option>
                <option value="business">Business</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="planExpiresAt">Plan expires</Label>
            <Input
              id="planExpiresAt"
              type="date"
              value={planExpiresAt}
              onChange={(e) => setPlanExpiresAt(e.target.value)}
              aria-invalid={fieldErrors.planExpiresAt !== undefined}
              aria-describedby={fieldErrors.planExpiresAt !== undefined ? 'expiry-err' : undefined}
              required
            />
            {fieldErrors.planExpiresAt !== undefined && (
              <p id="expiry-err" className="text-xs text-destructive">
                {fieldErrors.planExpiresAt}
              </p>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Vertical</legend>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="vertical"
                  value="construction"
                  checked={vertical === 'construction'}
                  onChange={() => setVertical('construction')}
                />
                Residential build (~60 tasks)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="vertical"
                  value="legal"
                  checked={vertical === 'legal'}
                  onChange={() => setVertical('legal')}
                />
                Conveyancing (~30 tasks)
              </label>
            </div>
          </fieldset>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={pending}>
              {pending ? 'Provisioning…' : 'Provision workspace'}
            </Button>
            <Button type="button" variant="outline" onClick={() => void navigate('/')}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
