const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const env = loadEnv(path.join(__dirname, "backend", ".env"));
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const BACKEND_PORT = 3010;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE) {
  throw new Error("Missing Supabase credentials in backend/.env");
}

async function main() {
  const backend = await startBackend();
  const createdUserIds = [];

  try {
    const suffix = Date.now();
    const availabilityUsername = `avail${String(suffix).slice(-6)}`;
    const availabilityEmail = `availability-${suffix}@mailinator.com`;

    const availabilityBefore = await publicBackendRequest(`/api/auth/check-username?username=${availabilityUsername}`);
    assert(availabilityBefore.available === true, "Expected signup username to be available before signup");

    const availabilityOwner = await createConfirmedUser(availabilityEmail, availabilityUsername);
    createdUserIds.push(availabilityOwner.id);

    const availabilityAfter = await publicBackendRequest(`/api/auth/check-username?username=${availabilityUsername}`);
    assert(availabilityAfter.available === false, "Expected username to become unavailable after signup");

    const userA = await createConfirmedUser(`isolation-a-${suffix}@mailinator.com`, `usera${String(suffix).slice(-4)}`);
    const userB = await createConfirmedUser(`isolation-b-${suffix}@mailinator.com`, `userb${String(suffix).slice(-4)}`);
    createdUserIds.push(userA.id, userB.id);

    const tokenA = await signInAndGetToken(userA.email, userA.password);
    const tokenB = await signInAndGetToken(userB.email, userB.password);

    await saveWorkspace(tokenA, buildWorkspacePayload(userA.username, userA.email, "Alpha Traders", "Alpha Item", "ALPHA-001"));
    await saveWorkspace(tokenB, buildWorkspacePayload(userB.username, userB.email, "Beta Stores", "Beta Item", "BETA-001"));

    const workspaceA = await authenticatedBackendRequest("/api/workspace", tokenA);
    const workspaceB = await authenticatedBackendRequest("/api/workspace", tokenB);

    assert(workspaceA.profile.user_id === userA.username, "User A should receive only their own username");
    assert(workspaceB.profile.user_id === userB.username, "User B should receive only their own username");
    assert(workspaceA.profile.business_name === "Alpha Traders", "User A should receive only their own company");
    assert(workspaceB.profile.business_name === "Beta Stores", "User B should receive only their own company");
    assert(workspaceA.items.length === 1 && workspaceA.items[0].name === "Alpha Item", "User A should receive only their own item");
    assert(workspaceB.items.length === 1 && workspaceB.items[0].name === "Beta Item", "User B should receive only their own item");
    assert(workspaceA.invoices.length === 1 && workspaceA.invoices[0].invoice_number === "ALPHA-001", "User A should receive only their own invoice");
    assert(workspaceB.invoices.length === 1 && workspaceB.invoices[0].invoice_number === "BETA-001", "User B should receive only their own invoice");
    assert(!workspaceA.items.some((item) => item.name === "Beta Item"), "User A should not see User B items");
    assert(!workspaceB.items.some((item) => item.name === "Alpha Item"), "User B should not see User A items");
    assert(!workspaceA.invoices.some((invoice) => invoice.invoice_number === "BETA-001"), "User A should not see User B invoices");
    assert(!workspaceB.invoices.some((invoice) => invoice.invoice_number === "ALPHA-001"), "User B should not see User A invoices");

    console.log(JSON.stringify({
      ok: true,
      usernameAvailability: "passed",
      workspaceIsolation: "passed",
      checkedUsers: [userA.username, userB.username]
    }, null, 2));
  } finally {
    for (const userId of createdUserIds) {
      await deleteAuthUser(userId);
    }
    await stopBackend(backend);
  }
}

function buildWorkspacePayload(username, email, companyName, itemName, invoiceNumber) {
  return {
    profile: {
      user_id: username,
      full_name: username,
      email,
      company_name: companyName,
      business_name: companyName,
      business_email: email,
      business_phone: "9999999999",
      business_gst: "GSTTEST1234",
      business_address: `${companyName} Address`,
      bank_name: `${companyName} Bank`,
      account_holder: `${companyName} Owner`,
      account_number: "1234567890",
      ifsc_code: "TEST0001234",
      upi_id: `${username}@upi`,
      default_gst: 18,
      bank_notes: `${companyName} Notes`
    },
    items: [{
      id: crypto.randomUUID(),
      user_id: "",
      name: itemName,
      hsn_code: "9983",
      rate: 100,
      stock_qty: 5
    }],
    invoices: [{
      id: crypto.randomUUID(),
      user_id: "",
      document_type: "Bill",
      client_name: `${companyName} Client`,
      client_email: `client-${username}@mailinator.com`,
      client_phone: "8888888888",
      client_gst: "CLIENTGST123",
      client_address: `${companyName} Client Address`,
      invoice_number: invoiceNumber,
      invoice_date: "2026-04-20",
      due_date: "2026-04-27",
      status: "Pending",
      gst_percent: 18,
      discount_percent: 0,
      notes: `${companyName} invoice`,
      items: [{
        description: itemName,
        hsnCode: "9983",
        quantity: 1,
        rate: 100,
        itemDiscountPercent: 0,
        baseAmount: 100,
        amount: 100
      }],
      subtotal: 100,
      item_discount_total: 0,
      invoice_level_discount_amount: 0,
      discount_amount: 0,
      taxable_amount: 100,
      gst_amount: 18,
      total: 118,
      created_at: new Date().toISOString()
    }],
    counters: {
      invoice_counter: 2,
      proforma_counter: 1
    }
  };
}

async function startBackend() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["server.js"], {
      cwd: path.join(__dirname, "backend"),
      env: {
        ...process.env,
        PORT: String(BACKEND_PORT)
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    const fail = (error) => reject(error);
    child.once("error", fail);
    child.stderr.on("data", (chunk) => process.stderr.write(`[backend] ${chunk}`));
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      process.stdout.write(`[backend] ${text}`);
      if (text.includes("Backend running")) {
        resolve(child);
      }
    });
  });
}

function stopBackend(child) {
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill();
  });
}

async function publicBackendRequest(pathname, options = {}) {
  const response = await fetch(`${BACKEND_URL}${pathname}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await safeReadJson(response);
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Backend request failed with ${response.status}`);
  }

  return payload;
}

async function authenticatedBackendRequest(pathname, token, options = {}) {
  const response = await fetch(`${BACKEND_URL}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await safeReadJson(response);
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Backend request failed with ${response.status}`);
  }

  return payload;
}

async function saveWorkspace(token, payload) {
  return authenticatedBackendRequest("/api/workspace", token, {
    method: "PUT",
    body: payload
  });
}

async function createConfirmedUser(email, username) {
  const password = "CodexTest123!";
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: username,
        user_id: username,
        company_name: ""
      }
    })
  });

  const payload = await safeReadJson(response);
  if (!response.ok) {
    throw new Error(payload?.msg || payload?.message || "Failed to create confirmed test user");
  }

  return {
    id: payload.user?.id || payload.id,
    email,
    username,
    password
  };
}

async function signInAndGetToken(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      password
    })
  });

  const payload = await safeReadJson(response);
  if (!response.ok) {
    throw new Error(payload?.msg || payload?.message || "Failed to sign in test user");
  }

  return payload.access_token;
}

async function findAuthUserIdByUsername(username) {
  let page = 1;

  while (true) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`
      }
    });
    const payload = await safeReadJson(response);
    if (!response.ok) {
      throw new Error(payload?.msg || payload?.message || "Failed to list auth users");
    }

    const users = Array.isArray(payload?.users) ? payload.users : [];
    const match = users.find((user) => String(user?.user_metadata?.user_id || "").toLowerCase() === username.toLowerCase());
    if (match) {
      return match.id;
    }

    if (users.length < 200) {
      return null;
    }

    page += 1;
  }
}

async function deleteAuthUser(userId) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`
    }
  });
}

async function safeReadJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function loadEnv(filePath) {
  const values = {};
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    values[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
  }
  return values;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
