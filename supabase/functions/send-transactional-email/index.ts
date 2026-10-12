// supabase/functions/send-transactional-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API = "https://api.resend.com/emails";
const DEFAULT_CORS_ORIGINS = "*";

interface RegistrationConfirmationPayload {
  runnerEmail: string;
  runnerName: string;
  eventName: string;
  eventDate: string;
  location: string;
  categoryName: string;
  bibNumber: string;
  eventUrl?: string;
}

interface OrganizerWelcomePayload {
  organizerName: string;
  organizerEmail: string;
  loginUrl?: string;
}

type EmailPayload = RegistrationConfirmationPayload | OrganizerWelcomePayload;

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

function renderRegistrationConfirmation(p: RegistrationConfirmationPayload): string {
  const manageUrl = p.eventUrl
    ? `<p><a href="${escapeHtml(p.eventUrl)}">View your registration and digital BIB pass</a></p>`
    : "";
  return `
    <h2>Registration Confirmed</h2>
    <p>Hi ${escapeHtml(p.runnerName)},</p>
    <p>You're registered! See you at the start line.</p>
    <hr />
    <p><strong>Event:</strong> ${escapeHtml(p.eventName)}</p>
    <p><strong>Date:</strong> ${escapeHtml(p.eventDate)}</p>
    <p><strong>Location:</strong> ${escapeHtml(p.location || "TBA")}</p>
    <p><strong>Category:</strong> ${escapeHtml(p.categoryName)}</p>
    <p><strong>BIB Number:</strong> <span style="font-size:18px;font-weight:bold;">${escapeHtml(p.bibNumber)}</span></p>
    ${manageUrl}
    <p style="color:#666;font-size:12px;">Bring your BIB number to the REPC collection desk.</p>
  `;
}

function renderOrganizerWelcome(p: OrganizerWelcomePayload): string {
  const loginUrl = p.loginUrl || "https://pelikat.com/login";
  return `
    <h2>Welcome to Pelikat!</h2>
    <p>Hi ${escapeHtml(p.organizerName)},</p>
    <p>Your organizer account has been created. You can now build events,
    manage race categories, and track registrations on the platform.</p>
    <p>
      <a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:10px 20px;background:#0070f3;color:#fff;text-decoration:none;border-radius:6px;">
        Sign in to your account
      </a>
    </p>
    <p style="color:#666;font-size:12px;">
      You received this email because an account was created for this address on the Pelikat platform.
    </p>
  `;
}

function validateBody(body: Record<string, unknown>): { error?: string } {
    if (body.type === "registration_confirmation") {
      const p = body as RegistrationConfirmationPayload;
      // Payment-first BIB: bibNumber is legitimately absent at registration
      // time — render as TBA instead of rejecting the confirmation.
      if (!p.runnerEmail || !p.eventName) {
        return { error: "runnerEmail and eventName are required" };
      }
      if (!p.bibNumber) p.bibNumber = "TBA";
    } else if (body.type === "organizer_welcome") {
    const p = body as unknown as OrganizerWelcomePayload;
    if (!p.organizerEmail || !p.organizerName) {
      return { error: "organizerEmail and organizerName are required" };
    }
  } else {
    return { error: "Unknown email type" };
  }
  return {};
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  // ponytail: minimal auth — JWT verified, recipient pinned to caller's own
  // email for registration_confirmation and admin role for organizer_welcome.
  // Full fix (authorize against registration/event rows in DB, derive event
  // URL + email server-side) needs registration/event IDs added to the callers.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) {
    return new Response(JSON.stringify({ success: false, error: "Missing Authorization header" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
    });
  }

  let callerEmail: string | null = null;
  let isAdmin = false;

  try {
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      });
    }

    callerEmail = user.email ?? null;
    isAdmin = user.app_metadata?.role === "admin";
  } catch (err) {
    console.error("send-transactional-email error:", err);
    return new Response(JSON.stringify({ success: false, error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
    });
  }

  // Stub guard: skip silently when Resend is not configured (local dev)
  // or emails are explicitly disabled.
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey || Deno.env.get("EMAILS_DISABLED") === "true") {
    return new Response(
      JSON.stringify({ success: true, skipped: "email_disabled" }),
      { headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } },
    );
  }

  try {
    const body = await req.json();
    const invalid = validateBody(body);
    if (invalid.error) {
      return new Response(JSON.stringify({ success: false, error: invalid.error }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      });
    }

    const from = `Pelikat <${Deno.env.get("FROM_EMAIL") || "notifications@pelikat.com"}>`;
    let to: string;
    let subject: string;
    let html: string;

    if (body.type === "registration_confirmation") {
      // Recipient must be the caller's own account email — never a
      // client-supplied address.
      const p = body as RegistrationConfirmationPayload;
      if (!callerEmail || p.runnerEmail.toLowerCase() !== callerEmail.toLowerCase()) {
        return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
        });
      }
      // Recipient is the caller's account email.
      p.runnerEmail = callerEmail;
      to = p.runnerEmail;
      subject = `Registration confirmed: ${p.eventName} — BIB ${p.bibNumber}`;
      html = renderRegistrationConfirmation(p);
    } else {
      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
        });
      }
      const p = body as OrganizerWelcomePayload;
      to = p.organizerEmail;
      subject = `Welcome to Pelikat, ${p.organizerName}!`;
      html = renderOrganizerWelcome(p);
    }

    const result = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!result.ok) {
      const detail = await result.text();
      console.error("resend error:", detail);
      return new Response(JSON.stringify({ success: false, error: detail }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
    });
  } catch (err) {
    console.error("send-transactional-email error:", err);
    return new Response(JSON.stringify({ success: false, error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
    });
  }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
