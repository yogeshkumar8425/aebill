const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const env = loadEnv(path.join(__dirname, "backend", ".env"));
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const FRONTEND_URL = "http://127.0.0.1:5500";

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env");
}

const testId = Date.now();
const email = `codex-e2e-${testId}@example.com`;
const password = "CodexTest123!";
const userId = `codex${String(testId).slice(-6)}`;
const company = {
  businessName: `Codex Testing ${String(testId).slice(-4)}`,
  businessGst: `GST${String(testId).slice(-10)}`,
  businessEmail: email,
  businessPhone: "9876543210",
  businessAddress: "221B Test Street, Lucknow",
  bankName: "Playwright Bank",
  accountHolder: "Codex Tester",
  accountNumber: "123456789012",
  ifscCode: "TEST0001234",
  upiId: "codex@testupi",
  bankNotes: "Payment due within 7 days"
};

const item = {
  name: `Item ${String(testId).slice(-4)}`,
  hsnCode: "9983",
  rate: "2500",
  stockQty: "15"
};

async function main() {
  let createdUserId = null;
  let frontendServer = null;
  let backendServer = null;
  let browser = null;

  try {
    frontendServer = await startStaticServer(__dirname, 5500);
    backendServer = await startBackendServer();
    await waitForUrl("http://127.0.0.1:5500");
    await waitForUrl("http://127.0.0.1:3000/api/health");

    browser = await chromium.launch({
      headless: false,
      slowMo: 350,
      executablePath: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
    });

    const createdUser = await createConfirmedUser({
      email,
      password,
      userId,
      companyName: company.businessName
    });
    createdUserId = createdUser.id;

    const page = await browser.newPage();
    page.on("console", (message) => {
      console.log(`[browser:${message.type()}] ${message.text()}`);
    });
    page.on("pageerror", (error) => {
      console.error("[pageerror]", error);
    });
    page.on("response", async (response) => {
      if (!response.url().includes("/api/")) {
        return;
      }
      if (response.ok()) {
        console.log(`[api:${response.status()}] ${response.request().method()} ${response.url()}`);
        return;
      }
      let body = "";
      try {
        body = await response.text();
      } catch {
        body = "<unreadable>";
      }
      console.error(`[api:${response.status()}] ${response.request().method()} ${response.url()} -> ${body}`);
    });
    await page.goto(FRONTEND_URL, { waitUntil: "domcontentloaded" });

    await page.locator('.auth-switcher .auth-tab[data-auth-view="login"]').click();
    await page.locator('form#loginForm [name="email"]').fill(email);
    await page.locator('form#loginForm [name="password"]').fill(password);
    await page.locator('#loginForm button[type="submit"]').click();

    await page.waitForSelector("#appShell:not(.is-hidden)", { timeout: 15000 });
    await page.getByRole("button", { name: "Company" }).click();

    await page.locator('form#companyProfileForm [name="businessName"]').fill(company.businessName);
    await page.locator('form#companyProfileForm [name="businessGst"]').fill(company.businessGst);
    await page.locator('form#companyProfileForm [name="businessEmail"]').fill(company.businessEmail);
    await page.locator('form#companyProfileForm [name="businessPhone"]').fill(company.businessPhone);
    await page.locator('form#companyProfileForm [name="businessAddress"]').fill(company.businessAddress);
    await page.locator('form#companyProfileForm [name="bankName"]').fill(company.bankName);
    await page.locator('form#companyProfileForm [name="accountHolder"]').fill(company.accountHolder);
    await page.locator('form#companyProfileForm [name="accountNumber"]').fill(company.accountNumber);
    await page.locator('form#companyProfileForm [name="ifscCode"]').fill(company.ifscCode);
    await page.locator('form#companyProfileForm [name="upiId"]').fill(company.upiId);
    await page.locator('form#companyProfileForm [name="bankNotes"]').fill(company.bankNotes);
    await page.getByRole("button", { name: "Save Company" }).click();
    await page.waitForTimeout(1500);
    console.log("Company message:", (await page.locator("#companyProfileMessage").textContent()) || "<empty>");

    await page.waitForFunction(
      ({ expectedCompany, expectedBank }) => {
        const table = document.querySelector("#companyProfileSummary");
        return table && table.textContent.includes(expectedCompany) && table.textContent.includes(expectedBank);
      },
      {
        expectedCompany: company.businessName,
        expectedBank: company.bankName
      },
      { timeout: 15000 }
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#appShell:not(.is-hidden)", { timeout: 15000 });
    await page.getByRole("button", { name: "Company" }).click();
    await page.waitForFunction(
      ({ expectedCompany, expectedEmail, expectedPhone, expectedAddress, expectedBank }) => {
        const table = document.querySelector("#companyProfileSummary");
        return table &&
          table.textContent.includes(expectedCompany) &&
          table.textContent.includes(expectedEmail) &&
          table.textContent.includes(expectedPhone) &&
          table.textContent.includes(expectedAddress) &&
          table.textContent.includes(expectedBank);
      },
      {
        expectedCompany: company.businessName,
        expectedEmail: company.businessEmail,
        expectedPhone: company.businessPhone,
        expectedAddress: company.businessAddress,
        expectedBank: company.bankName
      },
      { timeout: 15000 }
    );

    await page.getByRole("button", { name: "Item Store" }).click();
    await page.locator('form#itemStoreForm [name="name"]').fill(item.name);
    await page.locator('form#itemStoreForm [name="hsnCode"]').fill(item.hsnCode);
    await page.locator('form#itemStoreForm [name="rate"]').fill(item.rate);
    await page.locator('form#itemStoreForm [name="stockQty"]').fill(item.stockQty);
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    await page.getByRole("button", { name: "Save Item" }).click();
    await page.waitForFunction(
      (itemName) => document.querySelector("#itemStoreTable")?.textContent.includes(itemName),
      item.name,
      { timeout: 15000 }
    );

    await page.getByRole("button", { name: "New Bill" }).click();
    await page.locator('form#invoiceForm [name="clientName"]').fill("Playwright Client");
    await page.locator('form#invoiceForm [name="clientEmail"]').fill("client@example.com");
    await page.locator('form#invoiceForm [name="clientPhone"]').fill("9999999999");
    await page.locator('form#invoiceForm [name="clientAddress"]').fill("Lucknow");
    await page.locator('#itemsBody tr:first-child [name="description"]').fill(item.name);
    await page.locator('#itemsBody tr:first-child [name="quantity"]').fill("2");
    await page.locator('#itemsBody tr:first-child [name="rate"]').fill(item.rate);
    await page.getByRole("button", { name: "Save Document" }).click();

    await page.waitForFunction(
      () => document.querySelector("#allInvoicesTable")?.textContent.includes("Playwright Client"),
      { timeout: 15000 }
    );

    const profileRows = await getRows("profiles", `id=eq.${createdUserId}&select=*`);
    const itemRows = await getRows("items", `user_id=eq.${createdUserId}&select=*`);
    const invoiceRows = await getRows("invoices", `user_id=eq.${createdUserId}&select=*`);

    assert(profileRows.length === 1, "Expected one profile row");
    assert(itemRows.length >= 1, "Expected at least one item row");
    assert(invoiceRows.length >= 1, "Expected at least one invoice row");
    assert(profileRows[0].business_name === company.businessName, "Company name did not persist");
    assert(profileRows[0].bank_name === company.bankName, "Bank name did not persist");
    assert(itemRows.some((row) => row.name === item.name), "Saved item not found in Supabase");
    assert(invoiceRows.some((row) => row.client_name === "Playwright Client"), "Saved invoice not found in Supabase");

    console.log(JSON.stringify({
      ok: true,
      email,
      userId,
      companyName: company.businessName,
      savedItemCount: itemRows.length,
      savedInvoiceCount: invoiceRows.length
    }, null, 2));
  } finally {
    if (browser) {
      await browser.close();
    }
    if (createdUserId) {
      await deleteUser(createdUserId);
    }
    await stopProcess(backendServer);
    await stopStaticServer(frontendServer);
  }
}

function startStaticServer(rootDir, port) {
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  };

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestedPath = req.url === "/" ? "/index.html" : req.url;
      const safePath = path.normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
      const filePath = path.join(rootDir, safePath);

      fs.readFile(filePath, (error, data) => {
        if (error) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Not found");
          return;
        }

        const extension = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": contentTypes[extension] || "application/octet-stream" });
        res.end(data);
      });
    });

    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function startBackendServer() {
  return fetch("http://127.0.0.1:3000/api/health")
    .then((response) => {
      if (response.ok) {
        console.log("[backend] Reusing existing backend on http://127.0.0.1:3000");
        return null;
      }
      throw new Error("Backend health check failed.");
    })
    .catch(() => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["server.js"], {
        cwd: path.join(__dirname, "backend"),
        stdio: ["ignore", "pipe", "pipe"]
      });

      let settled = false;
      const handleFailure = (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        process.stdout.write(`[backend] ${text}`);
        if (!settled && text.includes("Backend running")) {
          settled = true;
          resolve(child);
        }
      });

      child.stderr.on("data", (chunk) => {
        process.stderr.write(`[backend] ${chunk.toString()}`);
      });

      child.once("error", handleFailure);
      child.once("exit", (code) => {
        if (!settled) {
          handleFailure(new Error(`Backend exited early with code ${code}.`));
        }
      });
    }));
}

async function waitForUrl(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function stopStaticServer(server) {
  if (!server) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function stopProcess(child) {
  if (!child || child.killed) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill();
  });
}

function loadEnv(filePath) {
  const result = {};
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const index = line.indexOf("=");
    result[line.slice(0, index)] = line.slice(index + 1);
  }
  return result;
}

async function createConfirmedUser({ email, password, userId, companyName }) {
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
        user_id: userId,
        name: "Codex E2E",
        company_name: companyName
      }
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.msg || payload.error || "Failed to create test user");
  }
  return payload.user || payload;
}

async function deleteUser(userId) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`
    }
  });
}

async function getRows(table, query) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`
    }
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Failed to read ${table}`);
  }
  return payload;
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
