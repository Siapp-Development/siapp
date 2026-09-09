/**
 * Assignee picker for the bulk-actions bar (#156). Lists firm teammates and
 * active collaborators; picking one emits a `TTaskAssignee` shaped exactly like
 * the detail-panel selects so the bulk writer reuses the same append logic.
 * Kept local to this surface (Q3): extracting the detail-panel picker is out of
 * scope. Rendered inside a Popover panel, so it is a plain filterable listbox.
 */

import { Avatar, Input } from '@siapp/ui';
import type { TTaskAssignee } from '@siapp/shared';
import { useMemo, useState } from 'react';

import type { IMemberRow } from '../../settings/useTeamData.ts';
import type { ICollaboratorRow } from '../../collaborators/useCollaborators.ts';

export interface ITaskAssigneeBulkPickerProps {
  members: readonly IMemberRow[];
  collaborators: readonly ICollaboratorRow[];
  /** Called with the chosen assignee entry. */
  onSelect: (assignee: TTaskAssignee) => void;
  /** Disables every option (e.g. while a bulk write is in flight). */
  disabled?: boolean;
}

export function TaskAssigneeBulkPicker({
  members,
  collaborators,
  onSelect,
  disabled = false,
}: ITaskAssigneeBulkPickerProps) {
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();

  const filteredMembers = useMemo(
    () =>
      members.filter(
        (member) => query === '' || member.displayName.toLowerCase().includes(query),
      ),
    [members, query],
  );
  // Archived collaborators can't take new work (D-035); opted-out ones can.
  const filteredCollaborators = useMemo(
    () =>
      collaborators.filter(
        (collaborator) =>
          collaborator.status === 'active' &&
          (query === '' || collaborator.name.toLowerCase().includes(query)),
      ),
    [collaborators, query],
  );

  const hasResults = filteredMembers.length > 0 || filteredCollaborators.length > 0;

  return (
    <div className="flex w-64 flex-col gap-2">
      <Input
        aria-label="Filter people"
        placeholder="Search people…"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        className="h-9"
        autoFocus
      />
      <div className="max-h-64 overflow-y-auto" role="listbox" aria-label="Add assignee">
        {filteredMembers.length > 0 && (
          <>
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Teammates</p>
            {filteredMembers.map((member) => (
              <button
                key={member.uid}
                type="button"
                role="option"
                aria-selected={false}
                disabled={disabled}
                onClick={() =>
                  onSelect({ type: 'user', id: member.uid, name: member.displayName })
                }
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Avatar
                  size="xs"
                  name={member.displayName}
                  seed={member.uid}
                  photoUrl={member.photoUrl}
                />
                <span className="truncate">{member.displayName}</span>
              </button>
            ))}
          </>
        )}
        {filteredCollaborators.length > 0 && (
          <>
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Collaborators</p>
            {filteredCollaborators.map((collaborator) => (
              <button
                key={collaborator.id}
                type="button"
                role="option"
                aria-selected={false}
                disabled={disabled}
                onClick={() =>
                  onSelect({
                    type: 'collaborator',
                    id: collaborator.id,
                    name: collaborator.name,
                    phone: collaborator.phone,
                  })
                }
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Avatar size="xs" name={collaborator.name} seed={collaborator.id} />
                <span className="truncate">
                  {collaborator.name}
                  {collaborator.notificationsOptOut ? ' (notifications off)' : ''}
                </span>
              </button>
            ))}
          </>
        )}
        {!hasResults && (
          <p className="px-2 py-3 text-sm text-muted-foreground">No people found.</p>
        )}
      </div>
    </div>
  );
}
