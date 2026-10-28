import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_BASE_URL = (Deno.env.get("PERI_APP_URL") ||
  Deno.env.get("NEXT_PUBLIC_APP_URL") ||
  "https://peri-ashy.vercel.app").replace(/\/$/, "");
const WEENIT_APP_URL = (Deno.env.get("WEENIT_APP_URL") || Deno.env.get("WEENIT_URL") || "").replace(/\/$/, "");
const BEACON_REQUEST_URL = (Deno.env.get("BEACON_REQUEST_WORKER_URL") ||
  Deno.env.get("BEACON_WORKER_URL") ||
  "https://beacon.briankanduli.workers.dev").replace(/\/$/, "");
const DIGITAL_COLLATERAL_URL = (Deno.env.get("DIGITAL_COLLATERAL_WORKER_URL") ||
  "https://digital-collateral.briankanduli.workers.dev").replace(/\/$/, "");
const DIGITAL_COLLATERAL_TRANSFER_URL = (Deno.env.get("DIGITAL_COLLATERAL_TRANSFER_WORKER_URL") ||
  "https://digital-transfer.briankanduli.workers.dev").replace(/\/$/, "");

const BEEP_KORI_REWARD = Number(Deno.env.get("BEEP_KORI_REWARD") ?? "0");

// Normalize phone number to standard format (+260...)
const normalizePhoneNumber = (phone: string): string => {
  const normalizedPhone = phone.trim().replace(/\s+/g, '');
  
  if (normalizedPhone.startsWith('09')) {
    return '+260' + normalizedPhone.substring(1);
  } else if (normalizedPhone.startsWith('260') && !normalizedPhone.startsWith('+')) {
    return '+' + normalizedPhone;
  } else if (!normalizedPhone.startsWith('+')) {
    return '+' + normalizedPhone;
  }
  
  return normalizedPhone;
};

const safeCount = async (promise: Promise<{ count: number | null; error: any }>) => {
  try {
    const { count, error } = await promise;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
};

const createEmployeeMagicToken = async (supabase: any, employeeId: number) => {
  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await supabase.from("employee_magic_links").insert({
    employee_id: employeeId,
    token,
    expires_at: expiresAt
  });
  return token;
};

const buildEmployeeSummary = async (supabase: any, employee: any) => {
  const rank = Number(employee.rank ?? 0);

  // Get counts for employee
  const emergencyCount = await safeCount(
    supabase.from("emergencies").select("id", { count: "exact", head: true }).eq("status", "active")
  );

  let taskQuery = supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "active");
  if (Number.isFinite(rank)) {
    taskQuery = taskQuery.eq("stage", rank);
  }
  const taskCount = await safeCount(taskQuery);

  // Create preauthenticated URL
  const token = await createEmployeeMagicToken(supabase, employee.id);
  const periAppUrl = APP_BASE_URL.replace(/\/$/, "");
  const preAuthUrl = `${periAppUrl}/login?token=${token}&returnUrl=${encodeURIComponent("/?tab=baq")}`;

  const displayOrgName = "[organization]"; // This should be replaced with actual org name from employee data

  const lines = [
    `Welcome to ${displayOrgName} BAQ.`,
    `Emergency tasks[${emergencyCount}], Tasks[${taskCount}]: ${preAuthUrl}`
  ];

  return lines.join("\n");
};

const buildNewUserSummary = async (incoming_phone: string) => {
  // User not found in employees table - new user
  const requestNewAccountUrl = (Deno.env.get("REQUEST_NEW_ACCOUNT_URL") || 
    "https://request-new-account.briankanduli.workers.dev").replace(/\/$/, "");
  
  const lines = [
    `Welcome to Peri. You do not yet have an account. Request a new Peri account here ${requestNewAccountUrl}/?k=${encodeURIComponent(incoming_phone)}`
  ];

  return lines.join("\n");
};

const buildAdminSummary = async (supabase: any, employee: any) => {
  const rank = Number(employee.rank ?? 0);
  const isAdmin = rank === 0;

  if (!isAdmin) {
    return await buildEmployeeSummary(supabase, employee);
  }

  // Get today's date range
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  // Admin-specific statistics
  const [employeesOnlineToday, loansCreatedToday, emergencyCount, taskCount] = await Promise.all([
    // Active employees today (logged in)
    safeCount(supabase.from("employee_sessions").select("id", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString())
      .lt("created_at", todayEnd.toISOString())),
    
    // Loans created today
    safeCount(supabase.from("loans").select("id", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString())
      .lt("created_at", todayEnd.toISOString())),
    
    // Emergencies
    safeCount(supabase.from("emergencies").select("id", { count: "exact", head: true })
      .eq("status", "active")),
    
    // Active tasks
    safeCount(supabase.from("tasks").select("id", { count: "exact", head: true })
      .eq("status", "active"))
  ]);

  // Create preauthenticated URL
  const token = await createEmployeeMagicToken(supabase, employee.id);
  const periAppUrl = APP_BASE_URL.replace(/\/$/, "");
  const preAuthUrl = `${periAppUrl}/login?token=${token}&returnUrl=${encodeURIComponent("/?tab=baq")}`;

  const displayOrgName = "[organization]"; // This should be replaced with actual org name from employee data

  const lines = [
    `Welcome to ${displayOrgName} BAQ.`,
    `Employee activities online${employeesOnlineToday}, logged in${employeesOnlineToday} since start of day`,
    `Loans created${loansCreatedToday},`,
    `Emergency tasks[${emergencyCount}], Tasks[${taskCount}]: ${preAuthUrl}`
  ];

  return lines.join("\n");
};

const awardBeepKoriIfEligible = async (supabase: any, incoming_phone: string) => {
  if (!Number.isFinite(BEEP_KORI_REWARD) || BEEP_KORI_REWARD <= 0) return;

  // Only award once per phone for now
  const { count, error } = await supabase
    .from("kori_transactions")
    .select("id", { count: "exact", head: true })
    .eq("phone", incoming_phone)
    .eq("type", "beep_promo");

  if (error) {
    console.error("Failed to check kori_transactions for beep promo:", error);
    return;
  }

  if ((count ?? 0) > 0) return;

  const txInsert = await supabase.from("kori_transactions").insert({
    phone: incoming_phone,
    type: "beep_promo",
    amount: BEEP_KORI_REWARD,
    meta: { source: "beepService" }
  });

  if (txInsert.error) {
    console.error("Failed to insert kori_transactions beep promo:", txInsert.error);
    return;
  }

  // Upsert wallet balance for this phone
  const { data: wallet } = await supabase
    .from("kori_wallets")
    .select("id,balance")
    .eq("phone", incoming_phone)
    .maybeSingle();

  if (wallet) {
    const { error: updateErr } = await supabase
      .from("kori_wallets")
      .update({ balance: Number(wallet.balance ?? 0) + BEEP_KORI_REWARD })
      .eq("id", wallet.id);
    if (updateErr) {
      console.error("Failed to update kori_wallets balance:", updateErr);
    }
  } else {
    const { error: insertErr } = await supabase
      .from("kori_wallets")
      .insert({ phone: incoming_phone, balance: BEEP_KORI_REWARD });
    if (insertErr) {
      console.error("Failed to insert kori_wallets row:", insertErr);
    }
  }
};
serve(async (req)=>{
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { incoming_phone, service_phone } = await req.json();
    
    console.log("=== BEEP SERVICE DEBUG ===");
    console.log("Incoming phone:", incoming_phone);
    console.log("Service phone:", service_phone);
    
    if (!incoming_phone || !service_phone) {
      return new Response(JSON.stringify({
        error: "Invalid payload"
      }), {
        status: 400
      });
    }
    
    // --- 1. Look up the service - prioritize BAQ service
    const { data: services, error: serviceErr } = await supabase
      .from("beep")
      .select("*")
      .eq("service_phone", service_phone)
      .or(`service_type.eq.baq,service_name.ilike.%baq%`);
    
    console.log("=== BEEP SERVICE DEBUG ===");
    console.log("Incoming phone:", incoming_phone);
    console.log("Service phone:", service_phone);
    console.log("Service lookup result:", { services, serviceErr });
    
    if (serviceErr) throw serviceErr;
    if (!services || services.length === 0) {
      console.log("❌ No BAQ service found for phone:", service_phone);
      return new Response(JSON.stringify({
        error: "Unknown service"
      }), {
        status: 404
      });
    }
    
    // Use the first BAQ service found
    const service = services[0];
    console.log("✅ Using BAQ service:", service);
    
    // Determine communication type from request context or default to SMS
    const communicationType = "sms"; // Default to SMS for now
    const direction = "inbound"; // Always inbound for incoming requests
    let message = "";
    // --- 2. Handle based on service type
    const serviceType = (service.service_type || "").toLowerCase();
    const serviceName = (service.service_name || "").toLowerCase();

    if (serviceType === "baq" ||
      serviceType === "summary" ||
      serviceType === "account" ||
      serviceType === "beacon" ||
      serviceName.includes("baq") ||
      serviceName.includes("beacon")) {
      const { data: employee, error: employeeErr } = await supabase
        .from("employees")
        .select("id, first_name, last_name, phonenumber, rank, is_active")
        .eq("phonenumber", incoming_phone)
        .maybeSingle();

      if (employeeErr) throw employeeErr;

      const beaconLink = `${BEACON_REQUEST_URL}/?k=${encodeURIComponent(incoming_phone)}`;
      const includeBeaconLink = serviceType === "baq" ||
        serviceType === "beacon" ||
        serviceName.includes("baq") ||
        serviceName.includes("beacon");

      if (employee && employee.is_active) {
        const rank = Number(employee.rank ?? 0);
        if (rank === 0) {
          // Admin user - use admin summary
          message = await buildAdminSummary(supabase, employee);
        } else {
          // Regular employee - use employee summary
          message = await buildEmployeeSummary(supabase, employee);
        }
        if (includeBeaconLink) {
          message = `${message}\nBeacon requests: ${beaconLink}`;
        }
      } else {
        message = await buildNewUserSummary(incoming_phone);
      }
    } else if (service.service_type === "loans") {
      const { data: sapiensUser } = await supabase.from("sapiens").select("phone, collateral").eq("phone", incoming_phone).maybeSingle();
      if (!sapiensUser || !sapiensUser.collateral || sapiensUser.collateral <= 0) {
        message = `Add collateral here https://chat.whatsapp.com/Dlxtd37vZZtJXFWdfb8ZCq to use this service`;
      } else {
        message = `Your collateral balance is ${sapiensUser.collateral}. ` + `Send collateral: https://send.briankanduli.workers.dev/?k=${incoming_phone} ` + `Add collateral: https://chat.whatsapp.com/Dlxtd37vZZtJXFWdfb8ZCq`;
      }
    } else if (service.service_type === "locker") {
      const { data: packages } = await supabase.from("packages").select("code").eq("receiver_phone", incoming_phone).eq("collected", false);
      if (!packages || packages.length === 0) {
        message = `Drop off package: https://drop.briankanduli.workers.dev/?k=${incoming_phone}`;
      } else {
        const codes = packages.map((p)=>p.code).join(", ");
        message = `Enter these code(s) to collect parcels [${codes}]. ` + `Drop off package: https://drop.briankanduli.workers.dev/?k=${incoming_phone}`;
      }
    } else if (service.service_type === "lender") {
      const { data: lender, error: lenderErr } = await supabase.from("lenders").select("phone, name, total_loans, active_borrowers, collateral_value").eq("phone", incoming_phone).maybeSingle();
      if (lenderErr) throw lenderErr;
      if (!lender) {
        message = `You are not registered as a lender. Contact support to get started.`;
      } else {
        message = `Hello ${lender.name}, here is your account summary:\n` + `- Total Loans: ${lender.total_loans}\n` + `- Active Borrowers: ${lender.active_borrowers}\n` + `- Collateral Value: ${lender.collateral_value}\n\n` + `Estimate collateral: https://est.briankanduli.workers.dev/?k=${incoming_phone}`;
      }
    } else if (service.service_type === "peri_login") {
      const { data: employee, error: employeeErr } = await supabase.from("employees").select("id, phonenumber, is_active").eq("phonenumber", incoming_phone).maybeSingle();
      if (employeeErr) throw employeeErr;
      if (!employee) {
        message = `No employee record found for this number.`;
      } else if (!employee.is_active) {
        message = `Employee account is inactive. Contact admin to activate access.`;
      } else {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        const magicToken = crypto.randomUUID().replace(/-/g, "");

        await supabase.from("employee_access_codes").insert({
          employee_id: employee.id,
          code,
          expires_at: expiresAt,
          channel: "beep",
          requested_by: "beep"
        });

        await supabase.from("employee_magic_links").insert({
          employee_id: employee.id,
          token: magicToken,
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
        });

        message = `Peri login code: ${code} (expires in 5 minutes). ` + `Open ${APP_BASE_URL}/login?token=${magicToken}`;
      }
    } else {
      message = `Service type not supported yet.`;
    }

    // Award Kori for this beep, if configured
    await awardBeepKoriIfEligible(supabase, incoming_phone);

    // --- 3. Send via SMS (notifyTransfers function)
    const smsRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/notifyTransfers`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
        "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
      },
      body: JSON.stringify({
        from: service_phone,
        to: incoming_phone,
        amount: null,
        message
      })
    });
    console.log(smsRes);
    if (!smsRes.ok) {
      const txt = await smsRes.text();
      throw new Error("Failed to send SMS: " + txt);
    }

    // --- 4. Store communication in baq_communications table
    try {
      const normalizedServicePhone = normalizePhoneNumber(service_phone);
      const normalizedIncomingPhone = normalizePhoneNumber(incoming_phone);
      
      await supabase.from("baq_communications").insert({
        baq_phone_number: normalizedServicePhone,
        customer_phone_number: normalizedIncomingPhone,
        type: communicationType,
        direction: direction,
        content: message,
        status: "completed",
        metadata: {
          service_type: service.service_type,
          service_name: service.service_name,
          message_type: "beep_response",
          original_service_phone: service_phone,
          original_incoming_phone: incoming_phone,
          communication_context: "beep_service_response"
        }
      });
      console.log("Communication stored in baq_communications table");
    } catch (commError) {
      console.error("Failed to store communication:", commError);
      // Don't fail the request, but log the error
    }

    return new Response(JSON.stringify({
      success: true,
      message
    }), {
      status: 200
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 500
    });
  }
});
