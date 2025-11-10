// config/supabase.config.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const createSupabaseClient = (url: string, key: string): SupabaseClient => {
  return createClient(url, key);
};