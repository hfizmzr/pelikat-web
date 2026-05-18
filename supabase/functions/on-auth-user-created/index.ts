// DEPRECATED: Use custom-access-token-hook instead.
// This webhook only fires on auth.users INSERT (first signup).
// The Custom Access Token hook runs on every login and is the
// authoritative source for role/is_active checks.
// Keep this for backward compatibility with existing signups.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const payload = await req.json();
  const userId = payload.record?.id;
  const email = payload.record?.email;

  if (!userId || !email) {
    return new Response("Missing userId or email", { status: 400 });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: organizer } = await adminClient
    .from("organizers")
    .select("id, is_active")
    .eq("contact_email", email)
    .single();

  if (organizer) {
    if (organizer.is_active) {
      await adminClient.auth.admin.updateUserById(userId, {
        app_metadata: { organizer_id: organizer.id, role: "organizer" }
      });
    } else {
      await adminClient.auth.admin.updateUserById(userId, {
        app_metadata: { organizer_id: organizer.id, role: "expired" }
      });
    }
  }

  return new Response("ok");
});
