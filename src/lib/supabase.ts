import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://trhvihhaidboeodffgcj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyaHZpaGhhaWRib2VvZGZmZ2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyODExNzMsImV4cCI6MjA4Mjg1NzE3M30.2XnP9E5nkva5Cwz5sL2ipsfKqO6LR0WElNZqbSwPtII';

export const supabase = createClient(supabaseUrl, supabaseKey);