import { renderHtml } from "./html";

export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  DEFAULT_SERVICE_PHONE?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

/**
 * Clean phone number by removing spaces, hyphens, and parentheses
 */
function sanitizePhoneNumber(raw: string): string {
  return (raw || "").trim().replace(/[\s\-()]/g, "");
}

/**
 * Forward beep request to Supabase Edge Function: beepService
 */
async function callBeepService(
  incomingPhone: string,
  servicePhone: string,
  env: Env
): Promise<{ ok: boolean; status: number; data: any }> {
  const supabaseUrl = (
    env.SUPABASE_URL || "https://wspdjsoukzbinyvptqkv.supabase.co"
  ).replace(/\/$/, "");

  const supabaseKey =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzcGRqc291a3piaW55dnB0cWt2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTEwMDAsImV4cCI6MjA2OTUyNzAwMH0.0WpPdoSDnL-DtEUWbpwj1pB8XBcSgSSL-XC4bno1qfY";

  const endpoint = `${supabaseUrl}/functions/v1/beepService`;

  console.log(`[BeepWorker] Calling beepService at: ${endpoint} for ${incomingPhone}`);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
    },
    body: JSON.stringify({
      incoming_phone: incomingPhone,
      service_phone: servicePhone,
    }),
  });

  let data: any = {};
  const responseText = await res.text();
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { message: responseText };
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const defaultServicePhone = env.DEFAULT_SERVICE_PHONE || "0978587412";

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // Serve Mobile-First Web UI
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const servicePhoneParam = url.searchParams.get("service") || defaultServicePhone;
      const html = renderHtml({
        servicePhone: servicePhoneParam,
      });

      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=60",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
          ...CORS_HEADERS,
        },
      });
    }

    // Handle JSON API Request (AJAX)
    if (request.method === "POST" && (url.pathname === "/api/beep" || url.pathname === "/beep")) {
      try {
        const body = (await request.json().catch(() => ({}))) as Record<string, any>;
        const rawPhone = body.incoming_phone || body.phone;
        const incomingPhone = sanitizePhoneNumber(rawPhone);
        const servicePhone =
          sanitizePhoneNumber(body.service_phone) || defaultServicePhone;

        if (!incomingPhone || incomingPhone.length < 8) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Please provide a valid phone number (at least 8 digits).",
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...CORS_HEADERS },
            }
          );
        }

        const result = await callBeepService(incomingPhone, servicePhone, env);

        if (result.ok && result.data?.success !== false) {
          return new Response(
            JSON.stringify({
              success: true,
              message:
                result.data?.message ||
                `Beep notification dispatched to ${incomingPhone}`,
              data: result.data,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json", ...CORS_HEADERS },
            }
          );
        } else {
          return new Response(
            JSON.stringify({
              success: false,
              error:
                result.data?.error ||
                result.data?.message ||
                `BeepService returned HTTP ${result.status}`,
              status: result.status,
            }),
            {
              status: result.status >= 400 && result.status < 600 ? result.status : 500,
              headers: { "Content-Type": "application/json", ...CORS_HEADERS },
            }
          );
        }
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            success: false,
            error: err.message || "Internal server error occurred.",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          }
        );
      }
    }

    // Handle Fallback Form Post (no-JS browser fallback)
    if (request.method === "POST" && (url.pathname === "/submit" || url.pathname === "/")) {
      try {
        const formData = await request.formData();
        const rawPhone = (formData.get("phone") || formData.get("incoming_phone") || "") as string;
        const incomingPhone = sanitizePhoneNumber(rawPhone);
        const servicePhone =
          sanitizePhoneNumber((formData.get("service_phone") as string) || "") ||
          defaultServicePhone;

        const acceptsJson =
          (request.headers.get("Accept") || "").includes("application/json");

        if (!incomingPhone || incomingPhone.length < 8) {
          if (acceptsJson) {
            return new Response(
              JSON.stringify({
                success: false,
                error: "Please enter a valid phone number.",
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json", ...CORS_HEADERS },
              }
            );
          }
          return new Response(
            renderHtml({
              servicePhone,
              initialPhone: rawPhone,
              errorMessage: "Please enter a valid phone number with at least 8 digits.",
            }),
            {
              status: 400,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }
          );
        }

        const result = await callBeepService(incomingPhone, servicePhone, env);

        if (result.ok && result.data?.success !== false) {
          if (acceptsJson) {
            return new Response(
              JSON.stringify({
                success: true,
                message: result.data?.message || "Beep successfully sent!",
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json", ...CORS_HEADERS },
              }
            );
          }
          return new Response(
            renderHtml({
              servicePhone,
              initialPhone: "",
              successMessage:
                result.data?.message ||
                `Beep notification successfully sent for ${incomingPhone}!`,
            }),
            {
              status: 200,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }
          );
        } else {
          const errText =
            result.data?.error ||
            result.data?.message ||
            `Error communicating with Beep service (${result.status}).`;
          if (acceptsJson) {
            return new Response(
              JSON.stringify({
                success: false,
                error: errText,
              }),
              {
                status: result.status || 500,
                headers: { "Content-Type": "application/json", ...CORS_HEADERS },
              }
            );
          }
          return new Response(
            renderHtml({
              servicePhone,
              initialPhone: rawPhone,
              errorMessage: errText,
            }),
            {
              status: result.status || 500,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }
          );
        }
      } catch (err: any) {
        return new Response(
          renderHtml({
            servicePhone: defaultServicePhone,
            errorMessage: err.message || "An unexpected error occurred.",
          }),
          {
            status: 500,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }
        );
      }
    }

    // Fallback 404
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  },
};
