/**
 * Shared search box for the A6/A7 contact lists (#104): a labelled input with
 * a leading (decorative) search icon that filters cards by name or company.
 * Lives beside PhoneActions so both the Clients and Collaborators pages reuse
 * it without crossing surface boundaries.
 */

import { Input, Label } from '@siapp/ui';
import { Search } from 'lucide-react';
import { useId } from 'react';

export interface IContactSearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

const SEARCH_LABEL = 'Search by name or company';

export function ContactSearchInput({ value, onChange }: IContactSearchInputProps) {
  const inputId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId} className="sr-only">
        {SEARCH_LABEL}
      </Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={inputId}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={SEARCH_LABEL}
          className="pl-9"
        />
      </div>
    </div>
  );
}
