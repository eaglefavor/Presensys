-- UPDATED TRIGGER: More flexible admin assignment
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, status)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'full_name', 
    'rep', -- Default everyone to rep
    'pending' -- Default everyone to pending
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
