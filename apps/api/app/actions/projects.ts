'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

export type Project = {
  id: string;
  created_at: string;
  name: string | null;
  public_key: string;
  allowed_origins: string[] | null;
  gemini_api_key: string | null;
  // user_id removed
};

export async function getProjects() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  // RLS ensures we only see our projects
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data as Project[];
}

export async function createProject(prevState: any, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Unauthorized' };
  }

  const name = formData.get('name') as string;
  const allowedOriginsStr = formData.get('allowed_origins') as string;
  
  if (!name) {
    return { error: 'Name is required' };
  }

  const allowed_origins = allowedOriginsStr
    ? allowedOriginsStr.split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean)
    : [];

  const publicKey = crypto.randomUUID();

  const { error } = await supabase
    .from('projects')
    .insert({
      name,
      // user_id removed, trigger handles membership
      public_key: publicKey,
      allowed_origins,
      gemini_api_key: (formData.get('gemini_api_key') as string) || null,
    });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/projects');
  return { success: true };
}

export async function updateProject(prevState: any, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Unauthorized' };
  }

  const id = formData.get('id') as string;
  const name = formData.get('name') as string;
  const allowedOriginsStr = formData.get('allowed_origins') as string;

  if (!id) {
    return { error: 'Project ID is required' };
  }

  const allowed_origins = allowedOriginsStr
    ? allowedOriginsStr.split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean)
    : [];

  const { error } = await supabase
    .from('projects')
    .update({
      name,
      allowed_origins,
      gemini_api_key: (formData.get('gemini_api_key') as string) || null,
    })
    .eq('id', id);
    // .eq('user_id', user.id) removed - RLS handles permission

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/projects');
  return { success: true };
}

export async function deleteProject(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Unauthorized' };
  }

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);
    // .eq('user_id', user.id) removed - RLS handles permission

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/projects');
  return { success: true };
}
