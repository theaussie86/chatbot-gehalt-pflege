'use server';

import { createClient, createAdminClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

export type Member = {
  id: string;
  user_id: string;
  email: string;
  role: string;
  created_at: string;
};

/** Returns the authenticated user's effective role for a project (global admins get 'admin'). */
async function getEffectiveRole(userId: string, projectId: string) {
  const admin = createAdminClient();

  const [{ data: profile }, { data: membership }] = await Promise.all([
    admin.from('profiles').select('is_admin').eq('id', userId).single(),
    admin.from('project_users').select('role').eq('project_id', projectId).eq('user_id', userId).single(),
  ]);

  if (profile?.is_admin) return 'admin';
  return membership?.role || null;
}

export async function getProjectMembers(projectId: string): Promise<Member[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('project_users')
    .select('id, user_id, role, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const userIds = (data || []).map((r: any) => r.user_id);
  const { data: profiles } = userIds.length > 0
    ? await admin.from('profiles').select('id, email').in('id', userIds)
    : { data: [] };

  const emailMap = new Map((profiles || []).map((p: any) => [p.id, p.email]));

  return (data || []).map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    email: emailMap.get(row.user_id) || 'Unknown',
    role: row.role,
    created_at: row.created_at,
  }));
}

export async function searchUserByEmail(email: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Unauthorized' };
  }

  // Use admin client since profiles RLS only allows reading own profile
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('profiles')
    .select('id, email')
    .eq('email', email.trim().toLowerCase())
    .single();

  if (error || !data) {
    return { error: 'No user found with this email address' };
  }

  return { user: { id: data.id, email: data.email } };
}

export async function addProjectMember(projectId: string, userId: string, role: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Unauthorized' };
  }

  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return { error: 'Invalid role' };
  }

  const effectiveRole = await getEffectiveRole(user.id, projectId);
  if (effectiveRole !== 'admin') {
    return { error: 'Only admins can add members' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('project_users')
    .insert({ project_id: projectId, user_id: userId, role });

  if (error) {
    if (error.code === '23505') {
      return { error: 'User is already a member of this project' };
    }
    return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

export async function updateMemberRole(projectId: string, userId: string, newRole: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Unauthorized' };
  }

  if (!['admin', 'editor', 'viewer'].includes(newRole)) {
    return { error: 'Invalid role' };
  }

  const effectiveRole = await getEffectiveRole(user.id, projectId);
  if (effectiveRole !== 'admin') {
    return { error: 'Only admins can change roles' };
  }

  const admin = createAdminClient();

  // Prevent demoting the last admin
  if (newRole !== 'admin') {
    const { data: admins } = await admin
      .from('project_users')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('role', 'admin');

    if (admins && admins.length === 1 && admins[0].user_id === userId) {
      return { error: 'Cannot change the role of the last admin' };
    }
  }

  const { error } = await admin
    .from('project_users')
    .update({ role: newRole })
    .eq('project_id', projectId)
    .eq('user_id', userId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

export async function removeMember(projectId: string, userId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Unauthorized' };
  }

  const effectiveRole = await getEffectiveRole(user.id, projectId);
  if (effectiveRole !== 'admin') {
    return { error: 'Only admins can remove members' };
  }

  const admin = createAdminClient();

  // Prevent removing the last admin
  const { data: admins } = await admin
    .from('project_users')
    .select('user_id')
    .eq('project_id', projectId)
    .eq('role', 'admin');

  const memberIsAdmin = admins?.some(a => a.user_id === userId);
  if (memberIsAdmin && admins && admins.length === 1) {
    return { error: 'Cannot remove the last admin' };
  }

  const { error } = await admin
    .from('project_users')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}
