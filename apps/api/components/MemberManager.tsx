'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
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
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  searchUserByEmail,
  addProjectMember,
  updateMemberRole,
  removeMember,
  type Member,
} from '@/app/actions/project-members';

const ROLE_BADGE_STYLES: Record<string, string> = {
  admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  editor: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  viewer: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

interface MemberManagerProps {
  projectId: string;
  members: Member[];
  currentUserRole: string;
}

export default function MemberManager({ projectId, members, currentUserRole }: MemberManagerProps) {
  const isAdmin = currentUserRole === 'admin';

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Members ({members.length})
        </h2>
        {isAdmin && <AddMemberDialog projectId={projectId} />}
      </div>

      <div className="divide-y dark:divide-gray-700">
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            projectId={projectId}
            isAdmin={isAdmin}
            isSoleMember={members.length === 1}
            adminCount={members.filter((m) => m.role === 'admin').length}
          />
        ))}
      </div>
    </div>
  );
}

function MemberRow({
  member,
  projectId,
  isAdmin,
  isSoleMember,
  adminCount,
}: {
  member: Member;
  projectId: string;
  isAdmin: boolean;
  isSoleMember: boolean;
  adminCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const isLastAdmin = member.role === 'admin' && adminCount === 1;

  function handleRoleChange(newRole: string) {
    startTransition(async () => {
      const result = await updateMemberRole(projectId, member.user_id, newRole);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Role updated to ${newRole}`);
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeMember(projectId, member.user_id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Member removed');
      }
    });
  }

  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm text-gray-800 dark:text-gray-200 truncate">
          {member.email}
        </span>
        {!isAdmin && (
          <Badge variant="outline" className={ROLE_BADGE_STYLES[member.role]}>
            {member.role}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isAdmin ? (
          <Select
            value={member.role}
            onValueChange={handleRoleChange}
            disabled={isPending || isLastAdmin}
          >
            <SelectTrigger size="sm" className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
        ) : null}

        {isAdmin && !isSoleMember && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                disabled={isPending || isLastAdmin}
              >
                Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove member</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to remove <strong>{member.email}</strong> from this project?
                  They will lose access immediately.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleRemove}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

function AddMemberDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [foundUser, setFoundUser] = useState<{ id: string; email: string } | null>(null);
  const [searchError, setSearchError] = useState('');
  const [isPending, startTransition] = useTransition();

  function reset() {
    setEmail('');
    setRole('viewer');
    setFoundUser(null);
    setSearchError('');
  }

  function handleSearch() {
    if (!email.trim()) return;
    setFoundUser(null);
    setSearchError('');

    startTransition(async () => {
      const result = await searchUserByEmail(email);
      if (result.error) {
        setSearchError(result.error);
      } else if (result.user) {
        setFoundUser(result.user);
      }
    });
  }

  function handleAdd() {
    if (!foundUser) return;

    startTransition(async () => {
      const result = await addProjectMember(projectId, foundUser.id, role);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${foundUser.email} added as ${role}`);
        reset();
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm">Add Member</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>
            Search for an existing user by email to add them to this project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFoundUser(null);
                setSearchError('');
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } }}
            />
            <Button
              variant="outline"
              onClick={handleSearch}
              disabled={isPending || !email.trim()}
            >
              Search
            </Button>
          </div>

          {searchError && (
            <p className="text-sm text-red-600">{searchError}</p>
          )}

          {foundUser && (
            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-md border border-green-200 dark:border-green-800">
              <span className="text-sm text-green-800 dark:text-green-200">
                {foundUser.email}
              </span>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger size="sm" className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); setOpen(false); }}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={isPending || !foundUser}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
