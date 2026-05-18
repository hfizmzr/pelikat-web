import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const { event, user, claims } = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: organizer } = await adminClient
      .from("organizers")
      .select("id, is_active")
      .eq("contact_email", user.email)
      .maybeSingle();

    if (organizer) {
      if (organizer.is_active) {
        claims.app_metadata = {
          ...claims.app_metadata,
          organizer_id: organizer.id,
          role: "organizer",
        };
      } else {
        claims.app_metadata = {
          ...claims.app_metadata,
          organizer_id: organizer.id,
          role: "expired",
        };
      }
    }

    return new Response(JSON.stringify({ claims }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("custom-access-token-hook error:", error);
    return new Response(JSON.stringify({ claims: {} }), {
      headers: { "Content-Type": "application/json" },
    });
  }
});
