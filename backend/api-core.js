const { URL } = require("url");

async function routeRequest(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      service: "billing-workspace-backend",
      storage: "supabase"
    });
    return;
  }

  if (requestUrl.pathname === "/api/auth/check-username" && req.method === "GET") {
    const username = normalizeUsername(requestUrl.searchParams.get("username") || "");
    validateUsername(username);
    sendJson(res, 200, {
      ok: true,
      username,
      available: await isUsernameAvailable(username)
    });
    return;
  }

  if (requestUrl.pathname === "/api/auth/signup" && req.method === "POST") {
    const payload = validateSignupPayload(await readJsonBody(req));
    const result = await createPendingSignup(payload);
    sendJson(res, 201, result);
    return;
  }

  if (requestUrl.pathname === "/api/workspace") {
    const authUser = await requireAuthenticatedUser(req);

    if (req.method === "GET") {
      const workspace = await loadWorkspace(authUser);
      sendJson(res, 200, workspace);
      return;
    }

    if (req.method === "PUT") {
      const payload = validateWorkspacePayload(await readJsonBody(req));
      const workspace = await saveWorkspace(authUser, payload);
      sendJson(res, 200, workspace);
      return;
    }
  }

  sendJson(res, 404, { error: "Route not found" });
}

function getConfig() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  return {
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || "*",
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY
  };
}

function setCorsHeaders(res) {
  const { ALLOWED_ORIGIN } = getConfig();
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

async function requireAuthenticatedUser(req) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const error = new Error("Missing bearer token.");
    error.statusCode = 401;
    throw error;
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${match[1]}`
    }
  });

  if (!response.ok) {
    const body = await safeReadJson(response);
    const error = new Error(body?.msg || body?.error_description || "Unauthorized.");
    error.statusCode = response.status === 401 ? 401 : 403;
    throw error;
  }

  const user = await response.json();
  return {
    id: user.id,
    email: user.email || "",
    metadata: user.user_metadata || {}
  };
}

async function loadWorkspace(authUser) {
  let profile = await getSingleRow("profiles", {
    id: `eq.${authUser.id}`,
    select: "*"
  });

  const username = await ensureUsernameOwnership({
    authUser,
    desiredUsername: profile?.user_id || authUser.metadata.user_id || authUser.email.split("@")[0] || "user"
  });

  if (!profile) {
    profile = await upsertSingleRow("profiles", {
      id: authUser.id,
      user_id: username,
      full_name: authUser.metadata.name || authUser.email || "User",
      email: authUser.email,
      company_name: authUser.metadata.company_name || "",
      business_name: authUser.metadata.company_name || "",
      business_email: authUser.email,
      business_phone: authUser.metadata.business_phone || "",
      business_gst: authUser.metadata.business_gst || "",
      business_address: authUser.metadata.business_address || "",
      bank_notes: authUser.metadata.bank_notes || "",
      default_gst: 18
    }, "id");
  } else if (profile.user_id !== username) {
    profile = await upsertSingleRow("profiles", {
      ...profile,
      user_id: username,
      updated_at: new Date().toISOString()
    }, "id");
  }

  const [items, invoices, counters] = await Promise.all([
    getRows("items", {
      user_id: `eq.${authUser.id}`,
      select: "*",
      order: "name.asc"
    }),
    getRows("invoices", {
      user_id: `eq.${authUser.id}`,
      select: "*",
      order: "created_at.desc"
    }),
    getSingleRow("user_counters", {
      user_id: `eq.${authUser.id}`,
      select: "*"
    })
  ]);

  return {
    profile,
    items,
    invoices,
    counters: counters || {
      user_id: authUser.id,
      invoice_counter: 1,
      proforma_counter: 1
    }
  };
}

async function saveWorkspace(authUser, payload) {
  const existingProfile = await getSingleRow("profiles", {
    id: `eq.${authUser.id}`,
    select: "*"
  });
  const username = await ensureUsernameOwnership({
    authUser,
    desiredUsername: payload.profile.user_id || existingProfile?.user_id || authUser.metadata.user_id || authUser.email.split("@")[0] || "user"
  });

  await upsertSingleRow("profiles", {
    id: authUser.id,
    user_id: username,
    full_name: payload.profile.full_name,
    email: payload.profile.email,
    company_name: payload.profile.company_name || payload.profile.business_name,
    business_name: payload.profile.business_name,
    business_email: payload.profile.business_email,
    business_phone: payload.profile.business_phone,
    business_gst: payload.profile.business_gst,
    business_address: payload.profile.business_address,
    bank_name: payload.profile.bank_name,
    account_holder: payload.profile.account_holder,
    account_number: payload.profile.account_number,
    ifsc_code: payload.profile.ifsc_code,
    upi_id: payload.profile.upi_id,
    default_gst: payload.profile.default_gst,
    bank_notes: payload.profile.bank_notes,
    updated_at: new Date().toISOString()
  }, "id");

  await upsertSingleRow("user_counters", {
    user_id: authUser.id,
    invoice_counter: payload.counters.invoice_counter,
    proforma_counter: payload.counters.proforma_counter
  }, "user_id");

  await replaceUserRows("items", authUser.id, payload.items);
  await replaceUserRows("invoices", authUser.id, payload.invoices);

  return loadWorkspace(authUser);
}

async function createPendingSignup(payload) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
  const username = normalizeUsername(payload.userId);
  validateUsername(username);

  const available = await isUsernameAvailable(username);
  if (!available) {
    throw buildHttpError(409, "That username is already taken. Please choose another one.");
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(payload.emailRedirectTo ? { redirectTo: payload.emailRedirectTo } : {})
    },
    body: JSON.stringify({
      email: payload.email,
      password: payload.password,
      data: {
        name: username,
        user_id: username,
        company_name: ""
      }
    })
  });

  const body = await safeReadJson(response);
  if (!response.ok) {
    throw buildHttpError(response.status, body?.msg || body?.error_description || body?.message || "Unable to create account.");
  }

  const authUser = body?.user || body || null;
  if (!authUser?.id) {
    throw buildHttpError(500, "Signup succeeded but no auth user was returned.");
  }

  await createInitialProfileStub(authUser.id, username, payload.email);

  return {
    ok: true,
    username,
    email: payload.email,
    needsEmailConfirmation: true
  };
}

async function createInitialProfileStub(authUserId, username, email) {
  try {
    await insertSingleRow("profiles", {
      id: authUserId,
      user_id: username,
      email,
      full_name: username,
      company_name: "",
      business_name: "",
      business_email: email,
      default_gst: 18
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      await deleteAuthUser(authUserId);
      throw buildHttpError(409, "That username is already taken. Please choose another one.");
    }
    throw error;
  }
}

async function ensureUsernameOwnership({ authUser, desiredUsername }) {
  const username = normalizeUsername(desiredUsername || authUser.email.split("@")[0] || "user");
  validateUsername(username);

  const existingProfile = await getSingleRow("profiles", {
    user_id: `eq.${username}`,
    select: "*"
  });
  if (existingProfile && existingProfile.id !== authUser.id) {
    throw buildHttpError(409, "That username is already taken. Please choose another one.");
  }

  const otherAuthUser = await findAuthUserByUsername(username, authUser.id);
  if (otherAuthUser) {
    throw buildHttpError(409, "That username is already taken. Please choose another one.");
  }

  return username;
}

async function isUsernameAvailable(username) {
  const profile = await getSingleRow("profiles", {
    user_id: `eq.${username}`,
    select: "id"
  });
  if (profile) {
    return false;
  }

  return !(await findAuthUserByUsername(username));
}

async function replaceUserRows(tableName, userId, rows) {
  const existingRows = await getRows(tableName, {
    user_id: `eq.${userId}`,
    select: "id"
  });

  const existingIds = existingRows.map((row) => row.id);
  const incomingIds = rows.map((row) => row.id);
  const idsToDelete = existingIds.filter((id) => !incomingIds.includes(id));

  if (idsToDelete.length) {
    const deleteParams = new URLSearchParams();
    deleteParams.set("user_id", `eq.${userId}`);
    deleteParams.set("id", `in.(${idsToDelete.join(",")})`);
    await callSupabaseRest(`${tableName}?${deleteParams.toString()}`, {
      method: "DELETE"
    });
  }

  if (!rows.length) {
    return;
  }

  const sanitizedRows = rows.map((row) => ({
    ...row,
    user_id: userId
  }));

  await callSupabaseRest(`${tableName}?on_conflict=id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: sanitizedRows
  });
}

async function getRows(tableName, params) {
  const query = new URLSearchParams(params);
  const response = await callSupabaseRest(`${tableName}?${query.toString()}`, {
    method: "GET"
  });
  return Array.isArray(response) ? response : [];
}

async function getSingleRow(tableName, params) {
  const rows = await getRows(tableName, params);
  return rows[0] || null;
}

async function upsertSingleRow(tableName, payload, conflictColumn) {
  const response = await callSupabaseRest(`${tableName}?on_conflict=${encodeURIComponent(conflictColumn)}`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: [payload]
  });

  return Array.isArray(response) ? response[0] || null : null;
}

async function insertSingleRow(tableName, payload) {
  const response = await callSupabaseRest(tableName, {
    method: "POST",
    headers: {
      Prefer: "return=representation"
    },
    body: [payload]
  });

  return Array.isArray(response) ? response[0] || null : null;
}

async function callSupabaseRest(pathname, options = {}) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getConfig();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const body = await safeReadJson(response);
    throw new Error(body?.message || body?.error || `Supabase REST request failed with ${response.status}.`);
  }

  if (response.status === 204) {
    return null;
  }

  return safeReadJson(response);
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

function buildHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isUniqueViolation(error) {
  return /duplicate key value|already exists|23505/i.test(String(error?.message || ""));
}

async function deleteAuthUser(userId) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getConfig();
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
}

async function findAuthUserByUsername(username, excludeUserId = "") {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getConfig();
  let page = 1;

  while (true) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    });

    const payload = await safeReadJson(response);
    if (!response.ok) {
      throw buildHttpError(response.status, payload?.msg || payload?.message || "Unable to check username availability.");
    }

    const users = Array.isArray(payload?.users) ? payload.users : [];
    const match = users.find((user) =>
      user?.id !== excludeUserId &&
      normalizeUsername(user?.user_metadata?.user_id || "") === username
    );

    if (match) {
      return match;
    }

    if (users.length < 200) {
      return null;
    }

    page += 1;
  }
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) {
    throw new Error("Request body is empty.");
  }

  return JSON.parse(rawBody);
}

function validateWorkspacePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Workspace payload must be an object.");
  }

  const profile = payload.profile || {};
  const counters = payload.counters || {};

  return {
    profile: {
      user_id: normalizeUsername(String(profile.user_id || "user").trim()),
      full_name: String(profile.full_name || "User").trim(),
      email: String(profile.email || "").trim(),
      company_name: String(profile.company_name || "").trim(),
      business_name: String(profile.business_name || "").trim(),
      business_email: String(profile.business_email || "").trim(),
      business_phone: String(profile.business_phone || "").trim(),
      business_gst: String(profile.business_gst || "").trim(),
      business_address: String(profile.business_address || "").trim(),
      bank_name: String(profile.bank_name || "").trim(),
      account_holder: String(profile.account_holder || "").trim(),
      account_number: String(profile.account_number || "").trim(),
      ifsc_code: String(profile.ifsc_code || "").trim(),
      upi_id: String(profile.upi_id || "").trim(),
      default_gst: positiveNumber(profile.default_gst, 18),
      bank_notes: String(profile.bank_notes || "").trim()
    },
    items: Array.isArray(payload.items) ? payload.items : [],
    invoices: Array.isArray(payload.invoices) ? payload.invoices : [],
    counters: {
      invoice_counter: positiveNumber(counters.invoice_counter, 1),
      proforma_counter: positiveNumber(counters.proforma_counter, 1)
    }
  };
}

function validateSignupPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw buildHttpError(400, "Signup payload must be an object.");
  }

  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const userId = normalizeUsername(String(payload.userId || "").trim());
  const emailRedirectTo = String(payload.emailRedirectTo || "").trim();

  if (!email) {
    throw buildHttpError(400, "Email is required.");
  }

  if (password.length < 6) {
    throw buildHttpError(400, "Password must be at least 6 characters.");
  }

  validateUsername(userId);

  return {
    email,
    password,
    userId,
    emailRedirectTo: emailRedirectTo || null
  };
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function validateUsername(username) {
  if (!username) {
    throw buildHttpError(400, "Username is required.");
  }

  if (!/^[a-z0-9](?:[a-z0-9_.-]{1,22}[a-z0-9])?$/.test(username)) {
    throw buildHttpError(400, "Username must be 3-24 characters and can use lowercase letters, numbers, dots, hyphens, or underscores.");
  }
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  routeRequest,
  sendJson
};
