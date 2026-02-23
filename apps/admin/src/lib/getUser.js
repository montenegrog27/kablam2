import { supabase } from "@kablam/supabase"

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser()
  return data?.user || null
}
