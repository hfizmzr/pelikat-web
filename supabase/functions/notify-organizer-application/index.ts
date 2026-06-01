// supabase/functions/notify-organizer-application/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API = "https://api.resend.com/emails";
const DEFAULT_CORS_ORIGINS = "*";

function getAllowedOrigins(): string[] {
  const env = Deno.env.get("CORS_ALLOWED_ORIGINS");
  if (!env) return [DEFAULT_CORS_ORIGINS];
  return env.split(",").map((o) => o.trim()).filter(Boolean);
}

function getCorsHeaders(req: Request): Record<string, string> {
  const allowed = getAllowedOrigins();
  const origin = req.headers.get("origin") || "";
  const allowOrigin = allowed.includes("*") || allowed.includes(origin) ? origin : (allowed[0] || "*");
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  };
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  try {
    const body = await req.json();
    const {
      organizerName,
      organizerEmail,
      eventName,
      eventDescription,
      siteUrl,
    } = body;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data } = await adminClient.auth.admin.listUsers({ perPage: 200 });
    const adminEmails = (data?.users ?? [])
      .filter((u) => u.app_metadata?.role === "admin")
      .map((u) => u.email!)
      .filter(Boolean);

    if (adminEmails.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No admin users found" }),
        { headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } },
      );
    }

    const adminUrl = siteUrl
      ? `${siteUrl}/admin/organizers`
      : "https://pelikat.com/admin/organizers";

    const eventInfo = eventName
      ? `<p><strong>Event Name:</strong> ${escapeHtml(eventName)}</p>`
      : "";
    const descInfo = eventDescription
      ? `<p><strong>Description:</strong> ${escapeHtml(eventDescription)}</p>`
      : "";

    const html = `
      <h2>New Organizer Application</h2>
      <p>A new organizer has applied to join the platform:</p>
      <hr />
      <p><strong>Organizer Name:</strong> ${escapeHtml(organizerName)}</p>
      <p><strong>Contact Email:</strong> ${escapeHtml(organizerEmail)}</p>
      ${eventInfo}
      ${descInfo}
      <hr />
      <p>
        <a href="${adminUrl}" style="display:inline-block;padding:10px 20px;background:#0070f3;color:#fff;text-decoration:none;border-radius:6px;">
          Review Application
        </a>
      </p>
      <p style="color:#666;font-size:12px;">
        You received this email because you are an admin on the Pelikat platform.
      </p>
    `;

    const fromEmail = Deno.env.get("FROM_EMAIL") || "notifications@pelikat.com";
    const from = `Pelikat <${fromEmail}>`;
    const subject = `New Organizer Application: ${organizerName}`;

    const resendKey = Deno.env.get("RESEND_API_KEY")!;

    const results = await Promise.all(
      adminEmails.map((to) =>
        fetch(RESEND_API, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ from, to, subject, html }),
        }),
      ),
    );

    const failures = results.filter((r) => !r.ok);

    return new Response(
      JSON.stringify({
        success: true,
        recipients: adminEmails.length,
        failed: failures.length,
      }),
      { headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } },
    );
  } catch (err) {
    console.error("notify-organizer-application error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      },
    );
  }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
