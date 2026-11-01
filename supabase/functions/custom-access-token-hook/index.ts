import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

serve(async (req) => {
  try {
    const body = await req.json();

    const claims = body.claims;
    const userId = body.user_id;

    if (!claims || !userId) {
      return new Response(
        JSON.stringify({ claims: claims || {} }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const email = claims.email;

    if (!email) {
      return new Response(
        JSON.stringify({ claims }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: organizer, error } = await adminClient
      .from("organizers")
      .select("id, is_active")
      .eq("contact_email", email)
      .maybeSingle();

    // Preserve existing role from claims (e.g., admin). 'user' was never a
    // valid role — stamp 'runner' so the claim is always in the enum.
    let role = claims.app_metadata?.role || "runner";
    let organizerId = claims.app_metadata?.organizer_id || null;

    if (organizer) {
      organizerId = organizer.id;
      // Only override non-admin roles
      if (role !== "admin") {
        role = organizer.is_active ? "organizer" : "expired";
      }

      const currentRole = claims.app_metadata?.role;
      const currentOrganizerId = claims.app_metadata?.organizer_id;
      if (currentRole !== role || currentOrganizerId !== organizerId) {
        // GoTrue is blocked on this hook while it issues the token, so
        // awaiting an Auth admin write for the same user stalls until the
        // 5 s hook timeout (422 on every role change). The claims below
        // already carry the new role; persist app_metadata after we answer.
        const persist = adminClient.auth.admin
          .updateUserById(userId, {
            app_metadata: { organizer_id: organizerId, role },
          })
          .then(({ error }) => {
            if (error) console.error("custom-access-token-hook app_metadata sync failed:", error);
          })
          .catch((err) => {
            console.error("custom-access-token-hook app_metadata sync failed:", err);
          });

        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) {
          EdgeRuntime.waitUntil(persist);
        } else {
          await persist;
        }
      }
    }

    claims.app_metadata = {
      ...(claims.app_metadata || {}),
      role,
      organizer_id: organizerId,
    };

    return new Response(JSON.stringify({ claims }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("custom-access-token-hook error:", err);

    return new Response(
      JSON.stringify({ claims: {} }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
