import type { SupabaseClient } from '@supabase/supabase-js';
import type { FormState } from '../types/form';

// Minimal message shape stored in DB
export interface StoredMessage {
  role: 'user' | 'bot';
  content: string;
  timestamp: string;
}

// What loadSession returns
export interface ChatSessionData {
  formState: FormState;
  messages: StoredMessage[];
}

const DEFAULT_FORM_STATE: FormState = {
  section: 'job_details',
  data: {
    job_details: {},
    tax_details: {},
  },
  missingFields: ['tarif', 'group', 'experience', 'hours', 'state'],
};

/**
 * Load or create a chat session from the database.
 * If no session exists for the given sessionId, creates a new one.
 */
export async function loadSession(
  supabase: SupabaseClient,
  sessionId: string,
  projectId: string
): Promise<ChatSessionData> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('form_state, messages')
    .eq('session_id', sessionId)
    .single();

  if (data && !error) {
    return {
      formState: data.form_state as FormState,
      messages: (data.messages || []) as StoredMessage[],
    };
  }

  // Session not found — create a new one
  const newFormState = JSON.parse(JSON.stringify(DEFAULT_FORM_STATE));
  const { error: insertError } = await supabase
    .from('chat_sessions')
    .insert({
      session_id: sessionId,
      project_id: projectId,
      form_state: newFormState,
      messages: [],
    });

  if (insertError) {
    console.error('[ChatSession] Failed to create session:', insertError);
  }

  return {
    formState: newFormState,
    messages: [],
  };
}

/**
 * Save updated session state after processing a turn.
 * Appends the user message and bot response to the messages array,
 * updates formState, and resets the expiry to 7 days from now.
 */
export async function saveSession(
  supabase: SupabaseClient,
  sessionId: string,
  formState: FormState,
  userMessage: string,
  botResponse: string
): Promise<void> {
  const now = new Date().toISOString();
  const newMessages: StoredMessage[] = [
    { role: 'user', content: userMessage, timestamp: now },
    { role: 'bot', content: botResponse, timestamp: now },
  ];

  // Use RPC to atomically append messages and update state
  const { error } = await supabase.rpc('append_chat_messages', {
    p_session_id: sessionId,
    p_form_state: formState,
    p_new_messages: newMessages,
  });

  if (error) {
    // Fallback: read-then-write if RPC not available
    console.warn('[ChatSession] RPC failed, using fallback:', error.message);
    const { data } = await supabase
      .from('chat_sessions')
      .select('messages')
      .eq('session_id', sessionId)
      .single();

    const existingMessages = (data?.messages || []) as StoredMessage[];
    const updatedMessages = [...existingMessages, ...newMessages];

    await supabase
      .from('chat_sessions')
      .update({
        form_state: formState,
        messages: updatedMessages,
        updated_at: now,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('session_id', sessionId);
  }
}
