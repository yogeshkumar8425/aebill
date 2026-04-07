const STORAGE_KEY = "awanshi-enterprises-invoices";
const COUNTER_KEY = "awanshi-enterprises-next-invoice";
const PROFORMA_COUNTER_KEY = "awanshi-enterprises-next-proforma";
const SESSION_KEY = "awanshi-enterprises-session";
const USERS_KEY = "awanshi-enterprises-users";
const DB_NAME = "awanshi-enterprises-db";
const DB_VERSION = 2;
const INVOICES_STORE = "invoices";
const USERS_STORE = "users";
const ITEMS_STORE = "items";
const META_STORE = "meta";
const DEFAULT_USER = {
  userId: "admin",
  password: "golu123",
  email: "eawanshi@gmail.com",
  name: "Administrator"
};

const SETTINGS = {
  businessName: "AWANSHI ENTERPRISES",
  businessEmail: "eawanshi@gmail.com",
  businessPhone: "9026443176, 7985253134",
  businessGst: "09GNKPM2232K1ZN",
  address: "Jabrauli, Mohanlalganj, Lucknow, Uttar Pradesh - 226301",
  defaultGst: 18,
  bankNotes: [
    "Payment via:",
    "Bank of Baroda | A/C: 35090200000586 | IFSC: BARB0MOHANL | Branch: Mohanlalganj, Lucknow",
    "Account Name: AWANSHI ENTERPRISES",
    "Thank you for your business!"
  ].join("\n")
};

const state = {
  invoices: [],
  previewInvoice: null,
  currentUser: loadSession(),
  users: [],
  items: [],
  pendingReset: null,
  nextInvoiceCounter: 1,
  proformaCounter: 1,
  db: null,
  appReady: false
};

const elements = {
  loginScreen: document.getElementById("loginScreen"),
  loginForm: document.getElementById("loginForm"),
  loginError: document.getElementById("loginError"),
  passwordResetForm: document.getElementById("passwordResetForm"),
  passwordResetMessage: document.getElementById("passwordResetMessage"),
  sendOtpButton: document.getElementById("sendOtpButton"),
  appShell: document.getElementById("appShell"),
  logoutButton: document.getElementById("logoutButton"),
  currentUserLabel: document.getElementById("currentUserLabel"),
  tabs: [...document.querySelectorAll(".tab-button")],
  panels: [...document.querySelectorAll(".tab-panel")],
  form: document.getElementById("invoiceForm"),
  itemStoreForm: document.getElementById("itemStoreForm"),
  resetItemStoreForm: document.getElementById("resetItemStoreForm"),
  itemsBody: document.getElementById("itemsBody"),
  itemRowTemplate: document.getElementById("itemRowTemplate"),
  itemSuggestions: document.getElementById("itemSuggestions"),
  previewButton: document.getElementById("previewButton"),
  printButton: document.getElementById("printButton"),
  exportBackupButton: document.getElementById("exportBackupButton"),
  importBackupButton: document.getElementById("importBackupButton"),
  importBackupInput: document.getElementById("importBackupInput"),
  backupMessage: document.getElementById("backupMessage"),
  createFromDashboard: document.getElementById("createFromDashboard"),
  createFromList: document.getElementById("createFromList"),
  recentInvoices: document.getElementById("recentInvoices"),
  itemStoreTable: document.getElementById("itemStoreTable"),
  itemSummaryTable: document.getElementById("itemSummaryTable"),
  allInvoicesTable: document.getElementById("allInvoicesTable"),
  invoicePreview: document.getElementById("invoicePreview"),
  totalBilled: document.getElementById("totalBilled"),
  invoiceCount: document.getElementById("invoiceCount"),
  pendingAmount: document.getElementById("pendingAmount"),
  paidCount: document.getElementById("paidCount"),
  stockBalance: document.getElementById("stockBalance"),
  subtotalValue: document.getElementById("subtotalValue"),
  discountValue: document.getElementById("discountValue"),
  taxableValue: document.getElementById("taxableValue"),
  gstValue: document.getElementById("gstValue"),
  grandTotalValue: document.getElementById("grandTotalValue"),
  notesField: document.getElementById("notesField")
};

initializeApp();

async function initializeApp() {
  state.db = await openDatabase();
  await migrateLegacyData();
  state.invoices = await getAllRecords(INVOICES_STORE);
  state.users = await getAllRecords(USERS_STORE);
  state.items = await getAllRecords(ITEMS_STORE);
  state.nextInvoiceCounter = await getMetaValue("invoiceCounter", 1);
  state.proformaCounter = await getMetaValue("proformaCounter", 1);

  bindAuthActions();
  updateSessionLabel();
  if (state.currentUser) {
    showApp();
    initializeBillingApp();
    return;
  }
  showLogin();
}

function initializeBillingApp() {
  if (state.appReady) {
    renderDashboard();
    renderItemStore();
    renderInvoicesTable();
    renderPreview(createDraftFromForm());
    return;
  }

  bindTabNavigation();
  bindFormActions();
  bindItemStoreActions();
  bindBackupActions();
  resetForm();
  renderDashboard();
  renderItemStore();
  renderInvoicesTable();
  renderPreview(createDraftFromForm());
  state.appReady = true;
}

function bindAuthActions() {
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.sendOtpButton.addEventListener("click", handleSendOtp);
  elements.passwordResetForm.addEventListener("submit", handlePasswordReset);
  elements.logoutButton.addEventListener("click", handleLogout);
}

function handleLogin(event) {
  event.preventDefault();
  const userId = elements.loginForm.elements.userId.value.trim();
  const password = elements.loginForm.elements.password.value;
  const user = state.users.find((entry) => entry.userId === userId && entry.password === password);

  if (user) {
    state.currentUser = {
      userId: user.userId,
      name: user.name,
      email: user.email
    };
    saveSession(state.currentUser);
    elements.loginError.textContent = "";
    elements.passwordResetMessage.textContent = "";
    elements.loginForm.reset();
    updateSessionLabel();
    showApp();
    initializeBillingApp();
    return;
  }

  elements.loginError.textContent = "Invalid user ID or password.";
}

function handleSendOtp() {
  const email = elements.passwordResetForm.elements.email.value.trim().toLowerCase();
  if (!email) {
    elements.passwordResetMessage.innerHTML = "Enter your registered email ID first.";
    return;
  }

  const user = state.users.find((entry) => entry.email.toLowerCase() === email);
  if (!user) {
    state.pendingReset = null;
    elements.passwordResetMessage.innerHTML = "No user found with this email ID.";
    return;
  }

  const otp = generateOtp();
  state.pendingReset = {
    email,
    otp,
    expiresAt: Date.now() + (5 * 60 * 1000)
  };

  elements.passwordResetMessage.innerHTML = `OTP generated for <strong>${escapeHtml(user.email)}</strong>. Demo OTP: <strong>${otp}</strong>. It is valid for 5 minutes.`;
}

async function handlePasswordReset(event) {
  event.preventDefault();
  const email = elements.passwordResetForm.elements.email.value.trim().toLowerCase();
  const otp = elements.passwordResetForm.elements.otp.value.trim();
  const newPassword = elements.passwordResetForm.elements.newPassword.value;
  const confirmPassword = elements.passwordResetForm.elements.confirmPassword.value;

  if (!state.pendingReset || state.pendingReset.email !== email) {
    elements.passwordResetMessage.innerHTML = "Send OTP first for this email ID.";
    return;
  }

  if (Date.now() > state.pendingReset.expiresAt) {
    state.pendingReset = null;
    elements.passwordResetMessage.innerHTML = "OTP expired. Please send a new OTP.";
    return;
  }

  if (otp !== state.pendingReset.otp) {
    elements.passwordResetMessage.innerHTML = "Invalid OTP. Please check and try again.";
    return;
  }

  if (newPassword.length < 4) {
    elements.passwordResetMessage.innerHTML = "New password must be at least 4 characters.";
    return;
  }

  if (newPassword !== confirmPassword) {
    elements.passwordResetMessage.innerHTML = "New password and confirm password do not match.";
    return;
  }

  const userIndex = state.users.findIndex((entry) => entry.email.toLowerCase() === email);
  state.users[userIndex] = {
    ...state.users[userIndex],
    password: newPassword
  };
  await saveUsers();
  state.pendingReset = null;
  elements.passwordResetForm.reset();
  elements.loginError.textContent = "";
  elements.passwordResetMessage.innerHTML = `Password updated for <strong>${escapeHtml(state.users[userIndex].userId)}</strong>. Use the new password to login.`;
}

async function handleSaveItem(event) {
  event.preventDefault();
  const form = elements.itemStoreForm;
  const itemId = form.elements.itemId.value;
  const name = form.elements.name.value.trim();
  const hsnCode = form.elements.hsnCode.value.trim();
  const rate = readNumber(form.elements.rate.value);
  const stockQty = readNumber(form.elements.stockQty.value);

  if (!name) {
    window.alert("Enter item name.");
    return;
  }

  const duplicateItem = state.items.find((item) =>
    item.id !== itemId && item.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicateItem) {
    window.alert("An item with this name already exists.");
    return;
  }

  const record = {
    id: itemId || (crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}`),
    name,
    hsnCode,
    rate,
    stockQty
  };

  if (itemId) {
    state.items = state.items.map((item) => item.id === itemId ? record : item);
  } else {
    state.items.unshift(record);
  }

  await saveItems();
  resetItemStoreForm();
  renderItemStore();
  renderDashboard();
  renderInvoicesTable();
  updateTotals();
}

function handleExportBackup() {
  const backup = createBackupPayload();
  const fileName = `awanshi-backup-${todayString()}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  elements.backupMessage.textContent = `Backup exported as ${fileName}.`;
}

async function handleImportBackup(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const backup = validateBackupPayload(parsed);
    const confirmed = window.confirm("Importing a backup will replace the current invoices, items, users, and counters. Continue?");
    if (!confirmed) {
      elements.importBackupInput.value = "";
      return;
    }

    state.invoices = backup.invoices;
    state.users = backup.users.length ? backup.users : [DEFAULT_USER];
    state.items = backup.items;
    state.nextInvoiceCounter = backup.meta.invoiceCounter;
    state.proformaCounter = backup.meta.proformaCounter;

    await saveInvoices();
    await saveUsers();
    await saveItems();
    await setMetaValue("invoiceCounter", state.nextInvoiceCounter);
    await setMetaValue("proformaCounter", state.proformaCounter);

    resetItemStoreForm();
    resetForm();
    renderDashboard();
    renderItemStore();
    renderInvoicesTable();
    renderPreview(createDraftFromForm());
    elements.backupMessage.textContent = `Backup imported from ${file.name}.`;
  } catch (error) {
    console.error("Failed to import backup.", error);
    elements.backupMessage.textContent = "Backup import failed. Please choose a valid backup JSON file.";
  } finally {
    elements.importBackupInput.value = "";
  }
}

function resetItemStoreForm() {
  elements.itemStoreForm.reset();
  elements.itemStoreForm.elements.itemId.value = "";
  elements.itemStoreForm.elements.rate.value = 0;
  elements.itemStoreForm.elements.stockQty.value = 0;
}

async function handleItemStoreTableClick(event) {
  const button = event.target.closest("[data-item-action]");
  if (!button) {
    return;
  }

  const item = state.items.find((entry) => entry.id === button.dataset.id);
  if (!item) {
    return;
  }

  if (button.dataset.itemAction === "edit") {
    elements.itemStoreForm.elements.itemId.value = item.id;
    elements.itemStoreForm.elements.name.value = item.name;
    elements.itemStoreForm.elements.hsnCode.value = item.hsnCode || "";
    elements.itemStoreForm.elements.rate.value = item.rate ?? 0;
    elements.itemStoreForm.elements.stockQty.value = item.stockQty ?? 0;
    switchTab("item-store");
    return;
  }

  if (button.dataset.itemAction === "delete") {
    const confirmed = window.confirm(`Delete item ${item.name}?`);
    if (!confirmed) {
      return;
    }

    state.items = state.items.filter((entry) => entry.id !== item.id);
    await saveItems();
    resetItemStoreForm();
    renderItemStore();
    renderDashboard();
    updateTotals();
  }
}

function handleLogout() {
  state.currentUser = null;
  clearSession();
  updateSessionLabel();
  showLogin();
  elements.loginError.textContent = "";
  elements.passwordResetMessage.textContent = "";
}

function showLogin() {
  elements.loginScreen.classList.remove("is-hidden");
  elements.appShell.classList.add("is-hidden");
}

function showApp() {
  elements.loginScreen.classList.add("is-hidden");
  elements.appShell.classList.remove("is-hidden");
}

function updateSessionLabel() {
  const label = state.currentUser
    ? `Signed in as ${state.currentUser.userId}`
    : "Signed out";
  elements.currentUserLabel.textContent = label;
}

function bindTabNavigation() {
  elements.tabs.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });
}

function switchTab(targetId) {
  elements.tabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === targetId);
  });
  elements.panels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === targetId);
  });
}

function bindFormActions() {
  elements.form.addEventListener("submit", handleSaveInvoice);
  elements.previewButton.addEventListener("click", () => {
    const invoice = createDraftFromForm();
    renderPreview(invoice);
    switchTab("preview");
  });
  elements.printButton.addEventListener("click", () => window.print());
  elements.createFromDashboard.addEventListener("click", () => {
    resetForm();
    switchTab("new-invoice");
  });
  elements.createFromList.addEventListener("click", () => {
    resetForm();
    switchTab("new-invoice");
  });

  ["input", "change"].forEach((eventName) => {
    elements.form.addEventListener(eventName, (event) => {
      const target = event.target;
      if (target.matches("input, textarea, select")) {
        if (target.name === "documentType") {
          elements.form.elements.invoiceNumber.value = getNextDocumentNumber(target.value);
        }
        if (target.name === "description") {
          syncItemDetails(target.closest("tr"));
        }
        if (target.closest("#itemsBody")) {
          updateLineAmount(target.closest("tr"));
        }
        updateTotals();
      }
    });
  });

  document.getElementById("addItemButton").addEventListener("click", addItemRow);
  elements.itemsBody.addEventListener("click", (event) => {
    if (event.target.classList.contains("remove-item")) {
      event.target.closest("tr").remove();
      if (!elements.itemsBody.children.length) {
        addItemRow();
      }
      updateTotals();
    }
  });
}

function bindItemStoreActions() {
  elements.itemStoreForm.addEventListener("submit", handleSaveItem);
  elements.resetItemStoreForm.addEventListener("click", resetItemStoreForm);
  elements.itemStoreTable.addEventListener("click", handleItemStoreTableClick);
}

function bindBackupActions() {
  elements.exportBackupButton.addEventListener("click", handleExportBackup);
  elements.importBackupButton.addEventListener("click", () => elements.importBackupInput.click());
  elements.importBackupInput.addEventListener("change", handleImportBackup);
}

function resetForm() {
  elements.form.reset();
  elements.itemsBody.innerHTML = "";
  addItemRow();
  elements.form.elements.documentType.value = "Bill";
  elements.form.elements.invoiceNumber.value = getNextDocumentNumber("Bill");
  elements.form.elements.invoiceDate.value = todayString();
  elements.form.elements.dueDate.value = todayString(7);
  elements.form.elements.gstPercent.value = SETTINGS.defaultGst;
  elements.form.elements.discountPercent.value = 0;
  elements.form.elements.status.value = "Pending";
  elements.notesField.value = SETTINGS.bankNotes;
  updateTotals();
}

function addItemRow(item = {}) {
  const row = elements.itemRowTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector('[name="description"]').value = item.description || "";
  row.querySelector('[name="hsnCode"]').value = item.hsnCode || "";
  row.querySelector('[name="quantity"]').value = item.quantity ?? 1;
  row.querySelector('[name="rate"]').value = item.rate ?? 0;
  row.querySelector('[name="itemDiscountPercent"]').value = item.itemDiscountPercent ?? 0;
  elements.itemsBody.appendChild(row);
  syncItemDetails(row);
  updateLineAmount(row);
}

function syncItemDetails(row) {
  if (!row) {
    return;
  }

  const descriptionField = row.querySelector('[name="description"]');
  const hsnField = row.querySelector('[name="hsnCode"]');
  const rateField = row.querySelector('[name="rate"]');
  const item = findItemByName(descriptionField.value);

  if (!item) {
    return;
  }

  if (!hsnField.value.trim()) {
    hsnField.value = item.hsnCode || "";
  }

  if (!Number(rateField.value)) {
    rateField.value = item.rate ?? 0;
  }
}

function updateLineAmount(row) {
  if (!row) {
    return;
  }
  const qty = readNumber(row.querySelector('[name="quantity"]').value);
  const rate = readNumber(row.querySelector('[name="rate"]').value);
  const itemDiscountPercent = readNumber(row.querySelector('[name="itemDiscountPercent"]').value);
  const baseAmount = qty * rate;
  const discountedAmount = baseAmount - (baseAmount * itemDiscountPercent / 100);
  row.querySelector(".line-amount").textContent = formatCurrency(discountedAmount);
}

function updateTotals() {
  const invoice = createDraftFromForm();
  elements.subtotalValue.textContent = formatCurrency(invoice.subtotal);
  elements.discountValue.textContent = formatCurrency(invoice.discountAmount);
  elements.taxableValue.textContent = formatCurrency(invoice.taxableAmount);
  elements.gstValue.textContent = formatCurrency(invoice.gstAmount);
  elements.grandTotalValue.textContent = formatCurrency(invoice.total);
  renderPreview(invoice);
}

async function handleSaveInvoice(event) {
  event.preventDefault();
  const invoice = createDraftFromForm();
  if (!invoice.items.length) {
    window.alert("Please add at least one item with quantity and rate.");
    return;
  }

  state.invoices.unshift({
    ...invoice,
    id: crypto.randomUUID ? crypto.randomUUID() : `invoice-${Date.now()}`,
    createdAt: new Date().toISOString()
  });
  await saveInvoices();
  await incrementDocumentCounter(invoice.documentType);
  renderDashboard();
  renderInvoicesTable();
  renderPreview(invoice);
  window.alert(`${getDocumentLabel(invoice.documentType)} ${invoice.invoiceNumber} saved successfully.`);
  resetForm();
  switchTab("all-invoices");
}

function createDraftFromForm() {
  const items = [...elements.itemsBody.querySelectorAll("tr")]
    .map((row) => ({
      description: row.querySelector('[name="description"]').value.trim(),
      hsnCode: row.querySelector('[name="hsnCode"]').value.trim(),
      quantity: readNumber(row.querySelector('[name="quantity"]').value),
      rate: readNumber(row.querySelector('[name="rate"]').value),
      itemDiscountPercent: readNumber(row.querySelector('[name="itemDiscountPercent"]').value)
    }))
    .filter((item) => item.description || item.quantity || item.rate)
    .map((item) => ({
      ...item,
      baseAmount: item.quantity * item.rate,
      amount: (item.quantity * item.rate) - ((item.quantity * item.rate) * item.itemDiscountPercent / 100)
    }));

  const subtotal = items.reduce((sum, item) => sum + item.baseAmount, 0);
  const itemDiscountTotal = items.reduce((sum, item) => sum + (item.baseAmount - item.amount), 0);
  const discountPercent = readNumber(elements.form.elements.discountPercent.value);
  const gstPercent = readNumber(elements.form.elements.gstPercent.value);
  const invoiceLevelDiscountAmount = (subtotal - itemDiscountTotal) * (discountPercent / 100);
  const discountAmount = itemDiscountTotal + invoiceLevelDiscountAmount;
  const taxableAmount = subtotal - discountAmount;
  const gstAmount = taxableAmount * (gstPercent / 100);
  const total = taxableAmount + gstAmount;

  return {
    documentType: elements.form.elements.documentType.value,
    clientName: elements.form.elements.clientName.value.trim(),
    clientEmail: elements.form.elements.clientEmail.value.trim(),
    clientPhone: elements.form.elements.clientPhone.value.trim(),
    clientGst: elements.form.elements.clientGst.value.trim(),
    clientAddress: elements.form.elements.clientAddress.value.trim(),
    invoiceNumber: elements.form.elements.invoiceNumber.value,
    invoiceDate: elements.form.elements.invoiceDate.value,
    dueDate: elements.form.elements.dueDate.value,
    status: elements.form.elements.status.value,
    gstPercent,
    discountPercent,
    notes: elements.form.elements.notes.value.trim(),
    items,
    subtotal,
    itemDiscountTotal,
    invoiceLevelDiscountAmount,
    discountAmount,
    taxableAmount,
    gstAmount,
    total
  };
}

function renderDashboard() {
  const totalBilled = state.invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const pendingAmount = state.invoices
    .filter((invoice) => invoice.status === "Pending")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const paidCount = state.invoices.filter((invoice) => invoice.status === "Paid").length;
  const stockBalance = getItemSummary().reduce((sum, item) => sum + item.currentStock, 0);

  elements.totalBilled.textContent = formatCurrency(totalBilled);
  elements.invoiceCount.textContent = String(state.invoices.length);
  elements.pendingAmount.textContent = formatCurrency(pendingAmount);
  elements.paidCount.textContent = String(paidCount);
  elements.stockBalance.textContent = String(stockBalance);

  const recent = state.invoices.slice(0, 5);
  if (!recent.length) {
    elements.recentInvoices.innerHTML = `<div class="empty-state">No documents yet. Create your first bill or proforma invoice from the New Document tab.</div>`;
    elements.itemSummaryTable.innerHTML = `<div class="empty-state">Item-wise totals and stock will appear here after you save documents.</div>`;
    return;
  }

  elements.recentInvoices.innerHTML = createInvoicesTableMarkup(recent, false);
  bindInvoiceTableActions(elements.recentInvoices);
  renderItemSummary();
}

function renderInvoicesTable() {
  if (!state.invoices.length) {
    elements.allInvoicesTable.innerHTML = `<div class="empty-state">No saved documents yet.</div>`;
    return;
  }

  elements.allInvoicesTable.innerHTML = createInvoicesTableMarkup(state.invoices, true);
  bindInvoiceTableActions(elements.allInvoicesTable);
}

function bindInvoiceTableActions(container) {
  container.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const { action, id } = button.dataset;
      if (action === "preview") {
        const invoice = state.invoices.find((entry) => entry.id === id);
        renderPreview(invoice);
        switchTab("preview");
      }
      if (action === "status") {
        rotateStatus(id);
      }
      if (action === "delete") {
        deleteInvoice(id);
      }
    });
  });
}

async function rotateStatus(id) {
  const statuses = ["Pending", "Paid", "Draft"];
  state.invoices = state.invoices.map((invoice) => {
    if (invoice.id !== id) {
      return invoice;
    }
    const currentIndex = statuses.indexOf(invoice.status);
    return { ...invoice, status: statuses[(currentIndex + 1) % statuses.length] };
  });
  await saveInvoices();
  renderDashboard();
  renderInvoicesTable();
}

async function deleteInvoice(id) {
  const invoice = state.invoices.find((entry) => entry.id === id);
  const confirmed = window.confirm(`Delete ${getDocumentLabel(invoice?.documentType)} ${invoice?.invoiceNumber || ""}?`);
  if (!confirmed) {
    return;
  }
  state.invoices = state.invoices.filter((entry) => entry.id !== id);
  await saveInvoices();
  renderDashboard();
  renderInvoicesTable();
}

function renderPreview(invoice) {
  state.previewInvoice = invoice;
  if (!invoice) {
    elements.invoicePreview.innerHTML = `<div class="empty-state">Fill the form to see a live document preview.</div>`;
    return;
  }

  const documentType = invoice.documentType || "Bill";
  const documentLabel = getDocumentLabel(documentType);
  const numberLabel = documentType === "Proforma Invoice" ? "PI No." : "Bill No.";
  const declaration = documentType === "Proforma Invoice"
    ? "This proforma invoice is a price estimate for customer approval and does not confirm the final tax bill."
    : "This bill is generated for business billing and GST calculation on the post-discount amount.";

  const itemsMarkup = invoice.items.length
    ? invoice.items.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.description)}</td>
        <td>${escapeHtml(item.hsnCode || "-")}</td>
        <td>${item.quantity}</td>
        <td>${formatCurrency(item.rate)}</td>
        <td>${item.itemDiscountPercent || 0}%</td>
        <td>${formatCurrency(item.amount)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="7">No items added yet.</td></tr>`;

  elements.invoicePreview.innerHTML = `
    <div class="invoice-paper-header">
      <div>
        <p class="section-kicker">${documentLabel}</p>
        <h2>${SETTINGS.businessName}</h2>
        <p>${SETTINGS.address}</p>
        <p>Email: ${SETTINGS.businessEmail}</p>
        <p>Phone: ${SETTINGS.businessPhone}</p>
        <p>GSTIN: ${SETTINGS.businessGst}</p>
      </div>
      <div class="preview-meta">
        <span>${numberLabel}</span>
        <strong>${escapeHtml(invoice.invoiceNumber || "-")}</strong>
        <span>Document Date</span>
        <strong>${formatDate(invoice.invoiceDate)}</strong>
        <span>Due Date</span>
        <strong>${formatDate(invoice.dueDate)}</strong>
        <span>Status</span>
        <strong class="badge ${invoice.status.toLowerCase()}">${invoice.status}</strong>
      </div>
    </div>

    <div class="invoice-paper-meta">
      <div>
        <p class="section-kicker">Billed To</p>
        <p><strong>${escapeHtml(invoice.clientName || "Client Name")}</strong></p>
        <p>${escapeHtml(invoice.clientAddress || "Client address will appear here.")}</p>
        <p>Email: ${escapeHtml(invoice.clientEmail || "-")}</p>
        <p>Phone: ${escapeHtml(invoice.clientPhone || "-")}</p>
        <p>GST: ${escapeHtml(invoice.clientGst || "-")}</p>
      </div>
      <div>
        <p class="section-kicker">Payment Notes</p>
        ${invoice.notes.split("\n").map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
      </div>
    </div>

    <table class="invoice-paper-table">
      <thead>
        <tr><th>#</th><th>Item Name</th><th>HSN Code</th><th>Qty</th><th>Rate</th><th>Discount %</th><th>Amount</th></tr>
      </thead>
      <tbody>${itemsMarkup}</tbody>
    </table>

    <div class="invoice-paper-total">
      <table>
        <tbody>
          <tr><td>Subtotal</td><td>${formatCurrency(invoice.subtotal)}</td></tr>
          <tr><td>Item Discount</td><td>${formatCurrency(invoice.itemDiscountTotal || 0)}</td></tr>
          <tr><td>Extra Discount (${invoice.discountPercent || 0}%)</td><td>${formatCurrency(invoice.invoiceLevelDiscountAmount || 0)}</td></tr>
          <tr><td>Total Discount</td><td>${formatCurrency(invoice.discountAmount)}</td></tr>
          <tr><td>Taxable Amount</td><td>${formatCurrency(invoice.taxableAmount)}</td></tr>
          <tr><td>GST (${invoice.gstPercent || 0}%)</td><td>${formatCurrency(invoice.gstAmount)}</td></tr>
          <tr><td><strong>Grand Total</strong></td><td><strong>${formatCurrency(invoice.total)}</strong></td></tr>
        </tbody>
      </table>
    </div>

    <div class="invoice-paper-footer">
      <div>
        <p class="section-kicker">Bank Details</p>
        <p>Bank of Baroda</p>
        <p>A/C: 35090200000586</p>
        <p>IFSC: BARB0MOHANL</p>
        <p>Branch: Mohanlalganj, Lucknow</p>
      </div>
      <div>
        <p class="section-kicker">Declaration</p>
        <p>${declaration}</p>
      </div>
    </div>
  `;
}

function renderItemStore() {
  renderItemSuggestions();

  if (!state.items.length) {
    elements.itemStoreTable.innerHTML = `<div class="empty-state">No saved items yet. Add your first item to build the store.</div>`;
    return;
  }

  const rows = [...state.items]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => {
      const soldQty = getSoldQuantity(item.name);
      const currentStock = Number(item.stockQty || 0) - soldQty;

      return `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.hsnCode || "-")}</td>
          <td>${formatCurrency(item.rate || 0)}</td>
          <td>${formatQuantity(item.stockQty)}</td>
          <td>${formatQuantity(soldQty)}</td>
          <td>${formatQuantity(currentStock)}</td>
          <td>
            <div class="action-group">
              <button type="button" class="action-link" data-item-action="edit" data-id="${item.id}">Edit</button>
              <button type="button" class="action-link" data-item-action="delete" data-id="${item.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  elements.itemStoreTable.innerHTML = `
    <table>
      <thead>
        <tr><th>Item Name</th><th>HSN Code</th><th> Rate</th><th>Stock Qty</th><th>Sold Qty</th><th>Current Stock</th><th>Actions</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderItemSummary() {
  const rows = getItemSummary()
    .sort((a, b) => a.description.localeCompare(b.description))
    .map((entry) => `
      <tr>
        <td>${escapeHtml(entry.description)}</td>
        <td>${formatQuantity(entry.totalQty)}</td>
        <td>${formatCurrency(entry.totalAmount)}</td>
        <td>${formatQuantity(entry.currentStock)}</td>
      </tr>
    `)
    .join("");

  elements.itemSummaryTable.innerHTML = rows
    ? `
      <table>
        <thead>
          <tr><th>Item Name</th><th>Sold Qty</th><th>Total Amount</th><th>Current Stock</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `
    : `<div class="empty-state">Item-wise totals and stock will appear here after you save documents.</div>`;
}

function getItemSummary() {
  const summaryMap = new Map();

  state.items.forEach((item) => {
    const key = item.name?.trim().toLowerCase();
    if (!key) {
      return;
    }

    summaryMap.set(key, {
      description: item.name.trim(),
      totalQty: 0,
      totalAmount: 0,
      stockQty: Number(item.stockQty || 0),
      currentStock: Number(item.stockQty || 0)
    });
  });

  state.invoices.forEach((invoice) => {
    (invoice.items || []).forEach((item) => {
      const key = item.description?.trim().toLowerCase();
      if (!key) {
        return;
      }

      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          description: item.description.trim(),
          totalQty: 0,
          totalAmount: 0,
          stockQty: 0,
          currentStock: 0
        });
      }

      const entry = summaryMap.get(key);
      entry.totalQty += Number(item.quantity || 0);
      entry.totalAmount += Number(item.amount || 0);
      entry.currentStock = entry.stockQty - entry.totalQty;
    });
  });

  return [...summaryMap.values()];
}

function createInvoicesTableMarkup(invoices, includeDelete) {
  const rows = invoices.map((invoice) => `
    <tr>
      <td>${escapeHtml(invoice.documentType || "Bill")}</td>
      <td>${escapeHtml(invoice.invoiceNumber)}</td>
      <td>${escapeHtml(invoice.clientName || "-")}</td>
      <td>${formatDate(invoice.invoiceDate)}</td>
      <td>${formatCurrency(invoice.total)}</td>
      <td><span class="badge ${invoice.status.toLowerCase()}">${invoice.status}</span></td>
      <td>
        <div class="action-group">
          <button class="secondary-button" data-action="preview" data-id="${invoice.id}">Preview</button>
          <button class="secondary-button" data-action="status" data-id="${invoice.id}">Change Status</button>
          ${includeDelete ? `<button class="icon-button" data-action="delete" data-id="${invoice.id}">Delete</button>` : ""}
        </div>
      </td>
    </tr>
  `).join("");

  return `
    <table>
      <thead>
          <tr><th>Type</th><th>Document No.</th><th>Client</th><th>Date</th><th>Total</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
  `;
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch (error) {
    console.error("Failed to load session from storage.", error);
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function saveInvoices() {
  await replaceStoreContents(INVOICES_STORE, state.invoices);
}

function getDocumentLabel(documentType = "Bill") {
  return documentType === "Proforma Invoice" ? "Proforma Invoice" : "Bill";
}

function getNextDocumentNumber(documentType = "Bill") {
  if (documentType === "Proforma Invoice") {
    return `PI-${String(state.proformaCounter).padStart(4, "0")}`;
  }
  return `AE-${String(state.nextInvoiceCounter).padStart(4, "0")}`;
}

async function incrementDocumentCounter(documentType = "Bill") {
  if (documentType === "Proforma Invoice") {
    state.proformaCounter += 1;
    await setMetaValue("proformaCounter", state.proformaCounter);
    return;
  }

  state.nextInvoiceCounter += 1;
  await setMetaValue("invoiceCounter", state.nextInvoiceCounter);
}

async function saveUsers() {
  await replaceStoreContents(USERS_STORE, state.users);
}

async function saveItems() {
  await replaceStoreContents(ITEMS_STORE, state.items);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(INVOICES_STORE)) {
        db.createObjectStore(INVOICES_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(USERS_STORE)) {
        db.createObjectStore(USERS_STORE, { keyPath: "userId" });
      }
      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        db.createObjectStore(ITEMS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function migrateLegacyData() {
  const existingInvoices = await getAllRecords(INVOICES_STORE);
  if (!existingInvoices.length) {
    const legacyInvoices = readLegacyArray(STORAGE_KEY);
    if (legacyInvoices.length) {
      await replaceStoreContents(INVOICES_STORE, legacyInvoices);
    }
  }

  const existingUsers = await getAllRecords(USERS_STORE);
  if (!existingUsers.length) {
    const legacyUsers = readLegacyArray(USERS_KEY);
    const usersToSave = legacyUsers.length ? legacyUsers : [DEFAULT_USER];
    await replaceStoreContents(USERS_STORE, usersToSave);
  }

  const existingItems = await getAllRecords(ITEMS_STORE);
  if (!existingItems.length) {
    await replaceStoreContents(ITEMS_STORE, []);
  }

  const existingCounter = await getMetaValue("invoiceCounter", null);
  if (existingCounter === null) {
    const legacyCounter = Number(localStorage.getItem(COUNTER_KEY) || 1);
    await setMetaValue("invoiceCounter", legacyCounter);
  }

  const existingProformaCounter = await getMetaValue("proformaCounter", null);
  if (existingProformaCounter === null) {
    const legacyProformaCounter = Number(localStorage.getItem(PROFORMA_COUNTER_KEY) || 1);
    await setMetaValue("proformaCounter", legacyProformaCounter);
  }
}

function createBackupPayload() {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    app: {
      name: DB_NAME
    },
    invoices: state.invoices,
    users: state.users,
    items: state.items,
    meta: {
      invoiceCounter: state.nextInvoiceCounter,
      proformaCounter: state.proformaCounter
    }
  };
}

function validateBackupPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Backup payload must be an object.");
  }

  if (!Array.isArray(payload.invoices) || !Array.isArray(payload.users) || !Array.isArray(payload.items)) {
    throw new Error("Backup payload arrays are missing.");
  }

  const invoiceCounter = Number(payload.meta?.invoiceCounter);
  const proformaCounter = Number(payload.meta?.proformaCounter);
  if (!Number.isFinite(invoiceCounter) || !Number.isFinite(proformaCounter)) {
    throw new Error("Backup counters are invalid.");
  }

  return {
    invoices: payload.invoices,
    users: payload.users,
    items: payload.items,
    meta: {
      invoiceCounter: invoiceCounter > 0 ? invoiceCounter : 1,
      proformaCounter: proformaCounter > 0 ? proformaCounter : 1
    }
  };
}

function readLegacyArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error(`Failed to read legacy data for ${key}.`, error);
    return [];
  }
}

function getAllRecords(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function replaceStoreContents(storeName, records) {
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const clearRequest = store.clear();

    clearRequest.onerror = () => reject(clearRequest.error);
    clearRequest.onsuccess = () => {
      records.forEach((record) => {
        store.put(record);
      });
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function getMetaValue(key, fallbackValue) {
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(META_STORE, "readonly");
    const store = transaction.objectStore(META_STORE);
    const request = store.get(key);
    request.onsuccess = () => {
      if (request.result && Object.prototype.hasOwnProperty.call(request.result, "value")) {
        resolve(request.result.value);
        return;
      }
      resolve(fallbackValue);
    };
    request.onerror = () => reject(request.error);
  });
}

function setMetaValue(key, value) {
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(META_STORE, "readwrite");
    const store = transaction.objectStore(META_STORE);
    const request = store.put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function todayString(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().split("T")[0];
}

function findItemByName(name) {
  const normalizedName = String(name || "").trim().toLowerCase();
  if (!normalizedName) {
    return null;
  }

  return state.items.find((item) => item.name.trim().toLowerCase() === normalizedName) || null;
}

function getSoldQuantity(itemName) {
  const normalizedName = String(itemName || "").trim().toLowerCase();
  if (!normalizedName) {
    return 0;
  }

  return state.invoices.reduce((sum, invoice) => (
    sum + (invoice.items || []).reduce((itemSum, item) => {
      const matches = item.description?.trim().toLowerCase() === normalizedName;
      return itemSum + (matches ? Number(item.quantity || 0) : 0);
    }, 0)
  ), 0);
}

function renderItemSuggestions() {
  elements.itemSuggestions.innerHTML = state.items
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => `<option value="${escapeHtml(item.name)}"></option>`)
    .join("");
}

function readNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQuantity(value) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2
  }).format(value || 0);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(amount || 0);
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
