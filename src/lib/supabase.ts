import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your-project-id')) {
  console.warn('Supabase credentials are not set in .env. Connectivity will be limited.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
