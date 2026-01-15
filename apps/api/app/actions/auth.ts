'use server';

import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const headersList = await headers();
  const origin = headersList.get('origin') || headersList.get('host');
  
  // Ensure protocol is https unless localhost
  let redirectUrl;
  if (origin?.startsWith('http')) {
    redirectUrl = `${origin}/auth/callback/`;
  } else {
    const protocol = origin?.includes('localhost') ? 'http' : 'https';
    redirectUrl = `${protocol}://${origin}/auth/callback/`;
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
    },
  });

  if (data.url) {
    redirect(data.url);
  }

  if (error) {
    // You might want to handle errors more gracefully
    redirect('/login?error=auth');
  }
}
