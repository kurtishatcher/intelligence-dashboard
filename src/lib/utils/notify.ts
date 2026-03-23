// src/lib/utils/notify.ts — S9 Phase 3 Priority 3
// Fire-and-forget notification emitter to oe_notifications table.
// Never lets failure affect the primary operation.

import { createClient } from '@supabase/supabase-js';

// Module-level cache for user ID resolution
let cachedUserId: string | null = null;

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function resolveUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  try {
    const supabase = getAdminClient();
    const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (data?.users?.length) {
      cachedUserId = data.users[0].id;
      return cachedUserId;
    }
  } catch (err) {
    console.error('[notify] Failed to resolve user ID:', err);
  }
  return null;
}

export async function emitNotification(params: {
  type: 'alert' | 'suggestion' | 'reminder';
  tier: 'automatic' | 'suggested' | 'critical';
  title: string;
  body?: string;
  source_system: string;
  action_url?: string;
}): Promise<void> {
  try {
    const userId = await resolveUserId();
    if (!userId) {
      console.warn('[notify] No user ID resolved — skipping notification');
      return;
    }

    const supabase = getAdminClient();
    const { error } = await supabase.from('oe_notifications').insert({
      user_id: userId,
      type: params.type,
      tier: params.tier,
      title: params.title,
      body: params.body ?? null,
      source_system: params.source_system,
      action_url: params.action_url ?? null,
      read: false,
    });

    if (error) {
      console.error('[notify] Insert failed:', error.message);
    }
  } catch (err) {
    // Fire-and-forget — never throw
    console.error('[notify] emitNotification failed:', err);
  }
}
