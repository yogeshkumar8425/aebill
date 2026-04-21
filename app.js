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
const SUPABASE_CONFIG = window.APP_CONFIG || {};
const supabaseClient = initializeSupabase();
const BACKEND_URL = getBackendBaseUrl();
const DEFAULT_USER = {
  userId: "admin",
  password: "golu123",
  email: "eawanshi@gmail.com",
  name: "Administrator"
};

const DEFAULT_BUSINESS_PROFILE = {
  businessName: "",
  businessEmail: "",
  businessPhone: "",
  businessGst: "",
  address: "",
  bankName: "",
  accountHolder: "",
  accountNumber: "",
  ifscCode: "",
  upiId: "",
  defaultGst: 18,
  bankNotes: ""
};

const state = {
  invoices: [],
  previewInvoice: null,
  currentUser: loadSession(),
  users: [],
  items: [],
  businessProfile: { ...DEFAULT_BUSINESS_PROFILE },
  nextInvoiceCounter: 1,
  proformaCounter: 1,
  db: null,
  appReady: false,
  authSubscription: null,
  signupUsernameCheck: {
    username: "",
    available: false,
    checking: false,
    requestId: 0,
    timerId: null
  },
  signupSubmitting: false,
  onboardingRequired: false
};

const elements = {
  loginScreen: document.getElementById("loginScreen"),
  authTabs: [...document.querySelectorAll(".auth-tab")],
  authPanels: [...document.querySelectorAll("[data-auth-view-panel]")],
  loginForm: document.getElementById("loginForm"),
  signupForm: document.getElementById("signupForm"),
  signupUserIdStatus: document.getElementById("signupUserIdStatus"),
  signupUserIdTick: document.getElementById("signupUserIdTick"),
  signupSubmitHint: document.getElementById("signupSubmitHint"),
  signupSubmitButton: document.getElementById("signupSubmitButton"),
  loginError: document.getElementById("loginError"),
  passwordResetForm: document.getElementById("passwordResetForm"),
  authHint: document.getElementById("authHint"),
  authMessage: document.getElementById("authMessage"),
  appShell: document.getElementById("appShell"),
  logoutButton: document.getElementById("logoutButton"),
  currentUserLabel: document.getElementById("currentUserLabel"),
  heroBusinessName: document.getElementById("heroBusinessName"),
  heroBusinessCopy: document.getElementById("heroBusinessCopy"),
  heroBusinessGst: document.getElementById("heroBusinessGst"),
  heroBusinessAddress: document.getElementById("heroBusinessAddress"),
  heroBusinessEmail: document.getElementById("heroBusinessEmail"),
  heroBusinessPhone: document.getElementById("heroBusinessPhone"),
  tabs: [...document.querySelectorAll(".tab-button")],
  panels: [...document.querySelectorAll(".tab-panel")],
  companyProfileForm: document.getElementById("companyProfileForm"),
  resetCompanyProfileForm: document.getElementById("resetCompanyProfileForm"),
  companyProfileMessage: document.getElementById("companyProfileMessage"),
  companyProfileSummary: document.getElementById("companyProfileSummary"),
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

function initializeSupabase() {
  const supabaseUrl = SUPABASE_CONFIG.supabaseUrl;
  const supabaseAnonKey = SUPABASE_CONFIG.supabaseAnonKey;

  if (!supabaseUrl || !supabaseAnonKey || !window.supabase?.createClient) {
    console.info("Supabase is not configured. Using local IndexedDB storage.");
    return null;
  }

  try {
    const client = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    console.info("Supabase client initialized.");
    return client;
  } catch (error) {
    console.error("Failed to initialize Supabase client.", error);
    return null;
  }
}

function getBackendBaseUrl() {
  if (SUPABASE_CONFIG.backendUrl) {
    return SUPABASE_CONFIG.backendUrl;
  }

  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    const isLocalStaticHost = ["127.0.0.1", "localhost"].includes(window.location.hostname) &&
      (window.location.port === "5500" || window.location.port === "5501" || window.location.port === "8000");

    if (isLocalStaticHost) {
      return `${window.location.protocol}//${window.location.hostname}:3000`;
    }

    return window.location.origin;
  }

  return "http://127.0.0.1:3000";
}

async function initializeApp() {
  state.db = await openDatabase();
  await migrateLegacyData();
  state.invoices = await getAllRecords(INVOICES_STORE);
  state.users = await getAllRecords(USERS_STORE);
  state.items = await getAllRecords(ITEMS_STORE);
  state.businessProfile = normalizeBusinessProfile(await getMetaValue("businessProfile", DEFAULT_BUSINESS_PROFILE));
  state.nextInvoiceCounter = await getMetaValue("invoiceCounter", 1);
  state.proformaCounter = await getMetaValue("proformaCounter", 1);

  bindAuthActions();
  await initializeSupabaseAuth();
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
    renderCompanyProfile();
    renderDashboard();
    renderItemStore();
    renderInvoicesTable();
    renderPreview(createDraftFromForm());
    return;
  }

  bindTabNavigation();
  bindCompanyProfileActions();
  bindFormActions();
  bindItemStoreActions();
  bindBackupActions();
  resetCompanyProfileForm();
  resetForm();
  renderCompanyProfile();
  renderDashboard();
  renderItemStore();
  renderInvoicesTable();
  renderPreview(createDraftFromForm());
  state.appReady = true;
}

function bindAuthActions() {
  bindAuthTabs();
  bindSignupUsernameAvailability();
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.signupForm.addEventListener("submit", handleSignup);
  elements.passwordResetForm.addEventListener("submit", handlePasswordReset);
  elements.logoutButton.addEventListener("click", handleLogout);
}

function bindAuthTabs() {
  elements.authTabs.forEach((button) => {
    button.addEventListener("click", () => setAuthView(button.dataset.authView));
  });
}

function bindSignupUsernameAvailability() {
  const usernameField = elements.signupForm?.elements.userId;
  const emailField = elements.signupForm?.elements.email;
  const passwordField = elements.signupForm?.elements.password;
  if (!usernameField) {
    return;
  }

  usernameField.addEventListener("input", () => {
    const normalizedValue = normalizeUsernameInput(usernameField.value);
    if (usernameField.value !== normalizedValue) {
      usernameField.value = normalizedValue;
    }
    queueUsernameAvailabilityCheck(normalizedValue);
  });

  usernameField.addEventListener("blur", () => {
    const normalizedValue = normalizeUsernameInput(usernameField.value);
    if (normalizedValue) {
      queueUsernameAvailabilityCheck(normalizedValue, true);
    }
  });

  emailField?.addEventListener("input", updateSignupSubmitState);
  emailField?.addEventListener("change", updateSignupSubmitState);
  passwordField?.addEventListener("input", updateSignupSubmitState);
  passwordField?.addEventListener("change", updateSignupSubmitState);
  elements.signupForm?.addEventListener("input", updateSignupSubmitState);
  elements.signupForm?.addEventListener("change", updateSignupSubmitState);
  updateSignupSubmitState();
}

async function initializeSupabaseAuth() {
  if (!supabaseClient) {
    elements.authHint.textContent = "Supabase is not configured. The app will fall back to local login data only.";
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    console.error("Failed to restore Supabase session.", error);
  }

  if (data?.session?.user) {
    await applyAuthenticatedUser(data.session.user);
  } else {
    state.currentUser = null;
    clearSession();
  }

  state.authSubscription = supabaseClient.auth.onAuthStateChange(async (eventName, session) => {
    if (session?.user) {
      await applyAuthenticatedUser(session.user);
      return;
    }

    if (eventName === "SIGNED_OUT") {
      state.currentUser = null;
      clearSession();
      updateSessionLabel();
      showLogin();
      setAuthView("login");
    }
  });
}

function setAuthView(viewName) {
  elements.authTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.authView === viewName);
  });
  elements.authPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.authViewPanel === viewName);
  });
  updateSignupSubmitState();
  if (viewName === "signup") {
    refreshSignupAvailabilityState();
  }
  clearAuthMessages();
}

function refreshSignupAvailabilityState() {
  const usernameField = elements.signupForm?.elements.userId;
  if (!usernameField) {
    return;
  }

  const normalizedUsername = normalizeUsernameInput(usernameField.value);
  if (usernameField.value !== normalizedUsername) {
    usernameField.value = normalizedUsername;
  }

  if (!normalizedUsername) {
    updateSignupSubmitState();
    return;
  }

  if (state.signupUsernameCheck.username !== normalizedUsername || !state.signupUsernameCheck.available) {
    queueUsernameAvailabilityCheck(normalizedUsername, true);
    return;
  }

  updateSignupSubmitState();
}

function queueUsernameAvailabilityCheck(username, immediate = false) {
  const normalizedUsername = normalizeUsernameInput(username);
  state.signupUsernameCheck.username = normalizedUsername;
  state.signupUsernameCheck.available = false;
  state.signupUsernameCheck.checking = false;

  if (state.signupUsernameCheck.timerId) {
    window.clearTimeout(state.signupUsernameCheck.timerId);
    state.signupUsernameCheck.timerId = null;
  }

  if (!normalizedUsername) {
    renderSignupUsernameStatus("");
    updateSignupSubmitState();
    return;
  }

  if (normalizedUsername.length < 3) {
    renderSignupUsernameStatus("Username must be at least 3 characters.", "unavailable");
    updateSignupSubmitState();
    return;
  }

  state.signupUsernameCheck.checking = true;
  renderSignupUsernameStatus("Checking username availability...", "checking");
  updateSignupSubmitState();
  const runCheck = () => {
    checkUsernameAvailability(normalizedUsername).catch((error) => {
      state.signupUsernameCheck.checking = false;
      state.signupUsernameCheck.available = false;
      renderSignupUsernameStatus(error.message || "Could not verify username right now.", "unavailable");
      updateSignupSubmitState();
    });
  };

  if (immediate) {
    runCheck();
    return;
  }

  state.signupUsernameCheck.timerId = window.setTimeout(runCheck, 300);
}

async function handleLogin(event) {
  event.preventDefault();
  const email = elements.loginForm.elements.email.value.trim().toLowerCase();
  const password = elements.loginForm.elements.password.value;
  clearAuthMessages();

  if (supabaseClient) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      elements.loginError.textContent = error.message || "Unable to sign in.";
      return;
    }

    if (data?.user) {
      elements.loginForm.reset();
    }
    return;
  }

  const user = state.users.find((entry) => entry.email?.toLowerCase() === email && entry.password === password);
  if (!user) {
    elements.loginError.textContent = "Invalid email or password.";
    return;
  }

  state.currentUser = {
    userId: user.userId,
    name: user.name,
    email: user.email
  };
  saveSession(state.currentUser);
  elements.loginForm.reset();
  updateSessionLabel();
  showApp();
  initializeBillingApp();
}

async function handleSignup(event) {
  event.preventDefault();
  clearAuthMessages();
  if (state.signupSubmitting) {
    return;
  }

  if (!supabaseClient) {
    elements.loginError.textContent = "Supabase is not configured yet. Add your project URL and anon key first.";
    return;
  }

  const userId = normalizeUsernameInput(elements.signupForm.elements.userId.value);
  const email = elements.signupForm.elements.email.value.trim().toLowerCase();
  const password = elements.signupForm.elements.password.value;
  elements.signupForm.elements.userId.value = userId;
  updateSignupSubmitState();

  if (password.length < 6) {
    elements.loginError.textContent = "Password must be at least 6 characters.";
    return;
  }

  if (!userId) {
    elements.loginError.textContent = "Username is required.";
    return;
  }

  const redirectUrl = buildAuthRedirectUrl();
  try {
    state.signupSubmitting = true;
    updateSignupSubmitState();
    const availability = await checkUsernameAvailability(userId);
    if (!availability.available) {
      elements.loginError.textContent = "That username is already taken. Please choose another one.";
      state.signupSubmitting = false;
      updateSignupSubmitState();
      return;
    }

    await publicBackendRequest("/api/auth/signup", {
      method: "POST",
      body: {
        email,
        password,
        userId,
        emailRedirectTo: redirectUrl || null
      }
    });
  } catch (error) {
    elements.loginError.textContent = error.message || "Unable to create account.";
    state.signupSubmitting = false;
    updateSignupSubmitState();
    return;
  }

  state.signupSubmitting = false;
  state.signupUsernameCheck = {
    username: "",
    available: false,
    checking: false,
    requestId: state.signupUsernameCheck.requestId,
    timerId: null
  };
  renderSignupUsernameStatus("");
  updateSignupSubmitState();
  setAuthView("login");
  elements.signupForm.reset();
  elements.authMessage.textContent = `Signup successful for ${email}. Check your email, open the confirmation link, and then finish company onboarding before entering the dashboard.`;
}

async function handlePasswordReset(event) {
  event.preventDefault();
  clearAuthMessages();

  if (!supabaseClient) {
    elements.loginError.textContent = "Supabase is not configured yet. Password reset email requires Supabase auth.";
    return;
  }

  const email = elements.passwordResetForm.elements.email.value.trim().toLowerCase();
  const options = {};
  const redirectUrl = buildAuthRedirectUrl();
  if (redirectUrl) {
    options.redirectTo = redirectUrl;
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, options);
  if (error) {
    elements.loginError.textContent = error.message || "Unable to send reset email.";
    return;
  }

  elements.passwordResetForm.reset();
  elements.authMessage.textContent = `Password reset email sent to ${email}. Open the link from your inbox to continue.`;
}

async function handleSaveItem(event) {
  event.preventDefault();
  try {
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

    const record = normalizeItemRecord({
      id: itemId || (crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}`),
      name,
      hsnCode,
      rate,
      stockQty
    });

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
  } catch (error) {
    console.error("Failed to save item.", error);
    window.alert(`Failed to save item. ${error.message || "Please try again."}`);
  }
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

    state.invoices = backup.invoices.map(normalizeInvoiceRecord);
    state.users = canUseSupabaseStorage() ? buildUserState() : (backup.users.length ? backup.users : [DEFAULT_USER]);
    state.items = backup.items.map(normalizeItemRecord);
    state.businessProfile = backup.businessProfile;
    state.nextInvoiceCounter = backup.meta.invoiceCounter;
    state.proformaCounter = backup.meta.proformaCounter;

    await saveInvoices();
    await saveUsers();
    await saveItems();
    await saveBusinessProfile();
    await saveUserCounters();

    resetItemStoreForm();
    resetCompanyProfileForm();
    resetForm();
    renderCompanyProfile();
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

    try {
      state.items = state.items.filter((entry) => entry.id !== item.id);
      await saveItems();
      resetItemStoreForm();
      renderItemStore();
      renderDashboard();
      updateTotals();
    } catch (error) {
      console.error("Failed to delete item.", error);
      window.alert(`Failed to delete item. ${error.message || "Please try again."}`);
    }
  }
}

async function handleLogout() {
  clearAuthMessages();

  if (supabaseClient) {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      elements.loginError.textContent = error.message || "Unable to sign out.";
      return;
    }
  }

  state.currentUser = null;
  clearSession();
  updateSessionLabel();
  showLogin();
  setAuthView("login");
}

function showLogin() {
  elements.loginScreen.classList.remove("is-hidden");
  elements.appShell.classList.add("is-hidden");
  state.onboardingRequired = false;
}

function showApp() {
  elements.loginScreen.classList.add("is-hidden");
  elements.appShell.classList.remove("is-hidden");
}

function updateSessionLabel() {
  const label = state.currentUser
    ? `Signed in as ${state.currentUser.userId || state.currentUser.email}`
    : "Signed out";
  elements.currentUserLabel.textContent = label;
}

function bindTabNavigation() {
  elements.tabs.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });
}

function bindCompanyProfileActions() {
  elements.companyProfileForm.addEventListener("submit", handleSaveCompanyProfile);
  elements.resetCompanyProfileForm.addEventListener("click", resetCompanyProfileForm);
}

function switchTab(targetId) {
  if (state.onboardingRequired && targetId !== "company") {
    elements.authMessage.textContent = "Complete company onboarding before accessing billing tabs.";
    targetId = "company";
  }

  elements.tabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === targetId);
    if (state.onboardingRequired && button.dataset.tab !== "company") {
      button.setAttribute("aria-disabled", "true");
      button.title = "Complete company onboarding first.";
    } else {
      button.removeAttribute("aria-disabled");
      button.removeAttribute("title");
    }
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
  elements.form.elements.gstPercent.value = state.businessProfile.defaultGst;
  elements.form.elements.discountPercent.value = 0;
  elements.form.elements.status.value = "Pending";
  elements.notesField.value = state.businessProfile.bankNotes;
  updateTotals();
}

function resetCompanyProfileForm() {
  elements.companyProfileForm.reset();
  elements.companyProfileForm.elements.businessName.value = state.businessProfile.businessName || "";
  elements.companyProfileForm.elements.businessGst.value = state.businessProfile.businessGst || "";
  elements.companyProfileForm.elements.businessEmail.value = state.businessProfile.businessEmail || "";
  elements.companyProfileForm.elements.businessPhone.value = state.businessProfile.businessPhone || "";
  elements.companyProfileForm.elements.businessAddress.value = state.businessProfile.address || "";
  elements.companyProfileForm.elements.bankName.value = state.businessProfile.bankName || "";
  elements.companyProfileForm.elements.accountHolder.value = state.businessProfile.accountHolder || "";
  elements.companyProfileForm.elements.accountNumber.value = state.businessProfile.accountNumber || "";
  elements.companyProfileForm.elements.ifscCode.value = state.businessProfile.ifscCode || "";
  elements.companyProfileForm.elements.upiId.value = state.businessProfile.upiId || "";
  elements.companyProfileForm.elements.bankNotes.value = state.businessProfile.bankNotes || "";
}

function normalizeBusinessProfile(profile = {}) {
  return {
    businessName: String(profile.businessName || "").trim(),
    businessEmail: String(profile.businessEmail || "").trim(),
    businessPhone: String(profile.businessPhone || "").trim(),
    businessGst: String(profile.businessGst || "").trim(),
    address: String(profile.address || "").trim(),
    bankName: String(profile.bankName || "").trim(),
    accountHolder: String(profile.accountHolder || "").trim(),
    accountNumber: String(profile.accountNumber || "").trim(),
    ifscCode: String(profile.ifscCode || "").trim(),
    upiId: String(profile.upiId || "").trim(),
    defaultGst: readNumber(profile.defaultGst || DEFAULT_BUSINESS_PROFILE.defaultGst) || DEFAULT_BUSINESS_PROFILE.defaultGst,
    bankNotes: String(profile.bankNotes || "").trim()
  };
}

function hasCompletedOnboarding() {
  return Boolean(state.businessProfile.businessName?.trim());
}

function renderCompanyProfile() {
  const profile = state.businessProfile;
  elements.heroBusinessName.textContent = profile.businessName || "Your Company Workspace";
  elements.heroBusinessCopy.textContent = profile.businessName
    ? `Create, manage, preview, and print professional tax invoices for ${profile.businessName} with your own business details.`
    : "Create, manage, preview, and print professional tax invoices with your own business and bank details.";
  elements.heroBusinessGst.textContent = `GSTIN: ${profile.businessGst || "Not added yet"}`;
  elements.heroBusinessAddress.textContent = profile.address || "Add your company address from the Company tab.";
  elements.heroBusinessEmail.textContent = `Email: ${profile.businessEmail || "Not added yet"}`;
  elements.heroBusinessPhone.textContent = `Phone: ${profile.businessPhone || "Not added yet"}`;
  elements.companyProfileSummary.innerHTML = `
    <table>
      <tbody>
        <tr><th>Company</th><td>${escapeHtml(profile.businessName || "Not added yet")}</td></tr>
        <tr><th>GSTIN</th><td>${escapeHtml(profile.businessGst || "Not added yet")}</td></tr>
        <tr><th>Email</th><td>${escapeHtml(profile.businessEmail || "Not added yet")}</td></tr>
        <tr><th>Phone</th><td>${escapeHtml(profile.businessPhone || "Not added yet")}</td></tr>
        <tr><th>Address</th><td>${escapeHtml(profile.address || "Not added yet")}</td></tr>
        <tr><th>Bank Name</th><td>${escapeHtml(profile.bankName || "Not added yet")}</td></tr>
        <tr><th>Account Holder</th><td>${escapeHtml(profile.accountHolder || "Not added yet")}</td></tr>
        <tr><th>Account Number</th><td>${escapeHtml(profile.accountNumber || "Not added yet")}</td></tr>
        <tr><th>IFSC</th><td>${escapeHtml(profile.ifscCode || "Not added yet")}</td></tr>
        <tr><th>UPI ID</th><td>${escapeHtml(profile.upiId || "Not added yet")}</td></tr>
        <tr><th>Bank Notes</th><td>${escapeHtml(profile.bankNotes || "Not added yet")}</td></tr>
      </tbody>
    </table>
  `;
  resetCompanyProfileForm();
}

async function handleSaveCompanyProfile(event) {
  event.preventDefault();
  elements.companyProfileMessage.textContent = "";

  const profile = normalizeBusinessProfile({
    businessName: elements.companyProfileForm.elements.businessName.value,
    businessGst: elements.companyProfileForm.elements.businessGst.value,
    businessEmail: elements.companyProfileForm.elements.businessEmail.value,
    businessPhone: elements.companyProfileForm.elements.businessPhone.value,
    address: elements.companyProfileForm.elements.businessAddress.value,
    bankName: elements.companyProfileForm.elements.bankName.value,
    accountHolder: elements.companyProfileForm.elements.accountHolder.value,
    accountNumber: elements.companyProfileForm.elements.accountNumber.value,
    ifscCode: elements.companyProfileForm.elements.ifscCode.value,
    upiId: elements.companyProfileForm.elements.upiId.value,
    bankNotes: elements.companyProfileForm.elements.bankNotes.value,
    defaultGst: state.businessProfile.defaultGst
  });

  if (!profile.businessName) {
    elements.companyProfileMessage.textContent = "Company name is required.";
    return;
  }

  try {
    state.businessProfile = profile;
    await saveBusinessProfile();
    await loadWorkspaceData();
    state.onboardingRequired = !hasCompletedOnboarding();
    renderCompanyProfile();
    updateTotals();
    renderPreview(createDraftFromForm());
    elements.companyProfileMessage.textContent = `${profile.businessName} saved successfully.`;
    if (!state.onboardingRequired) {
      elements.authMessage.textContent = "Company onboarding complete. Your dashboard and billing tabs are now unlocked.";
      switchTab("dashboard");
    }
  } catch (error) {
    console.error("Failed to save company profile.", error);
    elements.companyProfileMessage.textContent = `Failed to save company profile. ${error.message || "Please try again."}`;
    window.alert(`Failed to save company profile. ${error.message || "Please try again."}`);
  }
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
  try {
    const invoice = createDraftFromForm();
    if (!invoice.items.length) {
      window.alert("Please add at least one item with quantity and rate.");
      return;
    }

    state.invoices.unshift(normalizeInvoiceRecord({
      ...invoice,
      id: crypto.randomUUID ? crypto.randomUUID() : `invoice-${Date.now()}`,
      createdAt: new Date().toISOString()
    }));
    await saveInvoices();
    await incrementDocumentCounter(invoice.documentType);
    renderDashboard();
    renderInvoicesTable();
    renderPreview(invoice);
    window.alert(`${getDocumentLabel(invoice.documentType)} ${invoice.invoiceNumber} saved successfully.`);
    resetForm();
    switchTab("all-invoices");
  } catch (error) {
    console.error("Failed to save invoice.", error);
    window.alert(`Failed to save document. ${error.message || "Please try again."}`);
  }
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
  try {
    const statuses = ["Pending", "Paid", "Draft"];
    state.invoices = state.invoices.map((invoice) => {
      if (invoice.id !== id) {
        return invoice;
      }
      const currentIndex = statuses.indexOf(invoice.status);
      return normalizeInvoiceRecord({
        ...invoice,
        status: statuses[(currentIndex + 1) % statuses.length]
      });
    });
    await saveInvoices();
    renderDashboard();
    renderInvoicesTable();
  } catch (error) {
    console.error("Failed to update invoice status.", error);
    window.alert(`Failed to update invoice status. ${error.message || "Please try again."}`);
  }
}

async function deleteInvoice(id) {
  const invoice = state.invoices.find((entry) => entry.id === id);
  const confirmed = window.confirm(`Delete ${getDocumentLabel(invoice?.documentType)} ${invoice?.invoiceNumber || ""}?`);
  if (!confirmed) {
    return;
  }
  try {
    state.invoices = state.invoices.filter((entry) => entry.id !== id);
    await saveInvoices();
    renderDashboard();
    renderInvoicesTable();
  } catch (error) {
    console.error("Failed to delete invoice.", error);
    window.alert(`Failed to delete invoice. ${error.message || "Please try again."}`);
  }
}

function renderPreview(invoice) {
  state.previewInvoice = invoice;
  if (!invoice) {
    elements.invoicePreview.innerHTML = `<div class="empty-state">Fill the form to see a live document preview.</div>`;
    return;
  }
  const businessProfile = state.businessProfile;
  const paymentLines = [
    businessProfile.bankName,
    businessProfile.accountHolder ? `Account Name: ${businessProfile.accountHolder}` : "",
    businessProfile.accountNumber ? `A/C: ${businessProfile.accountNumber}` : "",
    businessProfile.ifscCode ? `IFSC: ${businessProfile.ifscCode}` : "",
    businessProfile.upiId ? `UPI: ${businessProfile.upiId}` : "",
    businessProfile.bankNotes
  ].filter(Boolean);

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
        <h2>${escapeHtml(businessProfile.businessName || "Your Company")}</h2>
        <p>${escapeHtml(businessProfile.address || "Add your company address from the Company tab.")}</p>
        <p>Email: ${escapeHtml(businessProfile.businessEmail || "-")}</p>
        <p>Phone: ${escapeHtml(businessProfile.businessPhone || "-")}</p>
        <p>GSTIN: ${escapeHtml(businessProfile.businessGst || "-")}</p>
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
        ${(invoice.notes || "").split("\n").filter(Boolean).map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
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
        ${paymentLines.length
          ? paymentLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")
          : "<p>Add your bank details from the Company tab.</p>"}
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

function clearAuthMessages() {
  elements.loginError.textContent = "";
  elements.authMessage.textContent = "";
}

function buildAuthRedirectUrl() {
  if (window.location.protocol === "file:") {
    return null;
  }

  return window.location.href;
}

function createSessionFromSupabaseUser(user) {
  const metadata = user.user_metadata || {};
  return {
    id: user.id,
    userId: metadata.user_id || user.email?.split("@")[0] || "user",
    name: metadata.name || user.email || "User",
    email: user.email || "",
    companyName: metadata.company_name || "",
    businessGst: metadata.business_gst || "",
    businessPhone: metadata.business_phone || "",
    businessAddress: metadata.business_address || ""
  };
}

function canUseSupabaseStorage() {
  return Boolean(supabaseClient && state.currentUser?.id && BACKEND_URL);
}

function normalizeUsernameInput(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_.-]/g, "");
}

function renderSignupUsernameStatus(message, tone = "") {
  if (!elements.signupUserIdStatus) {
    return;
  }

  elements.signupUserIdStatus.textContent = message;
  elements.signupUserIdStatus.classList.remove("available", "unavailable", "checking");
  if (tone) {
    elements.signupUserIdStatus.classList.add(tone);
  }
  elements.signupUserIdTick?.classList.toggle("visible", tone === "available");
}

function updateSignupSubmitState() {
  if (!elements.signupSubmitButton || !elements.signupForm) {
    return;
  }

  const username = normalizeUsernameInput(elements.signupForm.elements.userId.value);
  const email = elements.signupForm.elements.email.value.trim();
  const password = elements.signupForm.elements.password.value;
  const usernameConfirmed =
    state.signupUsernameCheck.available &&
    state.signupUsernameCheck.username === username &&
    !state.signupUsernameCheck.checking;
  const emailValid = Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  const passwordValid = password.length >= 6;
  const formReady = usernameConfirmed && emailValid && passwordValid && !state.signupSubmitting;

  elements.signupSubmitButton.disabled = !formReady;
  elements.signupSubmitButton.textContent = state.signupSubmitting ? "Creating Account..." : "Create Account";

  if (!elements.signupSubmitHint) {
    return;
  }

  elements.signupSubmitHint.classList.remove("ready", "waiting");
  if (state.signupSubmitting) {
    elements.signupSubmitHint.textContent = "Creating your account and requesting confirmation email...";
    elements.signupSubmitHint.classList.add("waiting");
    return;
  }

  if (formReady) {
    elements.signupSubmitHint.textContent = "Everything looks good. You can create the account now.";
    elements.signupSubmitHint.classList.add("ready");
    return;
  }

  if (!username) {
    elements.signupSubmitHint.textContent = "Enter a username to start the availability check.";
  } else if (state.signupUsernameCheck.checking) {
    elements.signupSubmitHint.textContent = "Waiting for username availability confirmation...";
  } else if (!usernameConfirmed) {
    elements.signupSubmitHint.textContent = "Choose a username that shows the green available check.";
  } else if (!emailValid) {
    elements.signupSubmitHint.textContent = "Enter a valid email address.";
  } else if (!passwordValid) {
    elements.signupSubmitHint.textContent = "Password must be at least 6 characters.";
  } else {
    elements.signupSubmitHint.textContent = "Complete the fields above to continue.";
  }
  elements.signupSubmitHint.classList.add("waiting");
}

async function publicBackendRequest(pathname, options = {}) {
  let response;

  try {
    response = await fetch(`${BACKEND_URL}${pathname}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch {
    throw new Error(`Cannot reach backend at ${BACKEND_URL}. Start the backend server and try again.`);
  }

  if (!response.ok) {
    let message = `Backend request failed with ${response.status}.`;
    try {
      const payload = await response.json();
      message = payload.error || payload.message || message;
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function checkUsernameAvailability(username) {
  const normalizedUsername = normalizeUsernameInput(username);
  if (!normalizedUsername) {
    return { username: "", available: false };
  }

  const requestId = state.signupUsernameCheck.requestId + 1;
  state.signupUsernameCheck.requestId = requestId;

  const result = await publicBackendRequest(`/api/auth/check-username?username=${encodeURIComponent(normalizedUsername)}`);
  if (requestId !== state.signupUsernameCheck.requestId) {
    return result;
  }

  state.signupUsernameCheck.username = result.username;
  state.signupUsernameCheck.available = Boolean(result.available);
  state.signupUsernameCheck.checking = false;
  renderSignupUsernameStatus(
    result.available ? `Username available. ${result.username} is yours to use.` : `Username unavailable. ${result.username} is already taken.`,
    result.available ? "available" : "unavailable"
  );
  updateSignupSubmitState();
  return result;
}

async function getAccessToken() {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not available.");
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    throw error;
  }

  const accessToken = data?.session?.access_token;
  if (!accessToken) {
    throw new Error("Your session expired. Please log in again.");
  }

  return accessToken;
}

async function backendRequest(pathname, options = {}) {
  const accessToken = await getAccessToken();
  let response;

  try {
    response = await fetch(`${BACKEND_URL}${pathname}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch {
    throw new Error(`Cannot reach backend at ${BACKEND_URL}. Start the backend server and try again.`);
  }

  if (!response.ok) {
    let message = `Backend request failed with ${response.status}.`;
    try {
      const payload = await response.json();
      message = payload.error || payload.message || message;
    } catch {
      // Ignore JSON parse errors and keep the fallback message.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function buildWorkspacePayload() {
  return {
    profile: {
      user_id: state.currentUser?.userId || "user",
      full_name: state.currentUser?.name || "User",
      email: state.currentUser?.email || "",
      company_name: state.currentUser?.companyName || state.businessProfile.businessName,
      business_name: state.businessProfile.businessName,
      business_email: state.businessProfile.businessEmail,
      business_phone: state.businessProfile.businessPhone,
      business_gst: state.businessProfile.businessGst,
      business_address: state.businessProfile.address,
      bank_name: state.businessProfile.bankName,
      account_holder: state.businessProfile.accountHolder,
      account_number: state.businessProfile.accountNumber,
      ifsc_code: state.businessProfile.ifscCode,
      upi_id: state.businessProfile.upiId,
      default_gst: state.businessProfile.defaultGst,
      bank_notes: state.businessProfile.bankNotes
    },
    items: state.items.map(mapItemToSupabaseRow),
    invoices: state.invoices.map(mapInvoiceToSupabaseRow),
    counters: {
      invoice_counter: state.nextInvoiceCounter,
      proforma_counter: state.proformaCounter
    }
  };
}

async function saveWorkspaceData() {
  const workspace = await backendRequest("/api/workspace", {
    method: "PUT",
    body: buildWorkspacePayload()
  });
  applyWorkspaceResponse(workspace);
  await cacheWorkspaceLocally();
}

function applyWorkspaceResponse(workspace) {
  if (!workspace) {
    return;
  }

  const profile = workspace.profile || null;
  if (profile) {
    state.currentUser = {
      ...state.currentUser,
      userId: profile.user_id || state.currentUser?.userId,
      name: profile.full_name || state.currentUser?.name,
      email: profile.email || state.currentUser?.email,
      companyName: profile.company_name || state.currentUser?.companyName
    };
    saveSession(state.currentUser);
  }

  state.businessProfile = mapBusinessProfileFromProfile(profile);
  state.users = buildUserState(profile);
  state.items = Array.isArray(workspace.items) ? workspace.items.map(mapItemFromSupabaseRow) : [];
  state.invoices = Array.isArray(workspace.invoices) ? workspace.invoices.map(mapInvoiceFromSupabaseRow) : [];
  state.nextInvoiceCounter = Math.max(1, Number(workspace.counters?.invoice_counter) || 1);
  state.proformaCounter = Math.max(1, Number(workspace.counters?.proforma_counter) || 1);
}

function createCurrentUserRecord(overrides = {}) {
  return {
    userId: overrides.userId || state.currentUser?.userId || "user",
    name: overrides.name || state.currentUser?.name || "User",
    email: overrides.email || state.currentUser?.email || "",
    companyName: overrides.companyName || state.currentUser?.companyName || "",
    supabaseUserId: overrides.supabaseUserId || state.currentUser?.id || ""
  };
}

function mapBusinessProfileFromProfile(profile = null) {
  if (!profile) {
    return normalizeBusinessProfile();
  }

  return normalizeBusinessProfile({
    businessName: profile.business_name,
    businessEmail: profile.business_email,
    businessPhone: profile.business_phone,
    businessGst: profile.business_gst,
    address: profile.business_address,
    bankName: profile.bank_name,
    accountHolder: profile.account_holder,
    accountNumber: profile.account_number,
    ifscCode: profile.ifsc_code,
    upiId: profile.upi_id,
    defaultGst: profile.default_gst,
    bankNotes: profile.bank_notes
  });
}

function buildUserState(profile = null) {
  if (!state.currentUser) {
    return [];
  }

  if (!profile) {
    return [createCurrentUserRecord()];
  }

  return [createCurrentUserRecord({
    userId: profile.user_id,
    name: profile.full_name,
    email: profile.email,
    companyName: profile.company_name
  })];
}

function createWorkspaceSnapshot() {
  return JSON.parse(JSON.stringify({
    invoices: state.invoices,
    users: state.users,
    items: state.items,
    businessProfile: state.businessProfile,
    nextInvoiceCounter: state.nextInvoiceCounter,
    proformaCounter: state.proformaCounter
  }));
}

function shouldSeedSupabaseWorkspace(localSnapshot, remoteWorkspace) {
  const hasRemoteRecords = remoteWorkspace.invoices.length || remoteWorkspace.items.length;
  const hasLocalRecords = localSnapshot.invoices.length || localSnapshot.items.length;
  const localUserMatchesCurrent = localSnapshot.users.some((entry) =>
    entry.email?.toLowerCase() === state.currentUser?.email?.toLowerCase()
  );
  const localLooksLikeLegacySingleUser = localSnapshot.users.every((entry) =>
    !entry.email || entry.userId === DEFAULT_USER.userId
  );

  return !hasRemoteRecords && hasLocalRecords && (localUserMatchesCurrent || localLooksLikeLegacySingleUser || !localSnapshot.users.length);
}

function normalizeItemRecord(item) {
  return {
    id: item.id || (crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}`),
    name: String(item.name || "").trim(),
    hsnCode: String(item.hsnCode || "").trim(),
    rate: readNumber(item.rate),
    stockQty: readNumber(item.stockQty)
  };
}

function normalizeInvoiceRecord(invoice) {
  return {
    ...invoice,
    id: invoice.id || (crypto.randomUUID ? crypto.randomUUID() : `invoice-${Date.now()}`),
    createdAt: invoice.createdAt || new Date().toISOString(),
    documentType: invoice.documentType || "Bill",
    clientName: String(invoice.clientName || "").trim(),
    clientEmail: String(invoice.clientEmail || "").trim(),
    clientPhone: String(invoice.clientPhone || "").trim(),
    clientGst: String(invoice.clientGst || "").trim(),
    clientAddress: String(invoice.clientAddress || "").trim(),
    invoiceNumber: String(invoice.invoiceNumber || "").trim(),
    invoiceDate: invoice.invoiceDate || todayString(),
    dueDate: invoice.dueDate || todayString(7),
    status: invoice.status || "Pending",
    gstPercent: readNumber(invoice.gstPercent),
    discountPercent: readNumber(invoice.discountPercent),
    notes: String(invoice.notes || ""),
    items: Array.isArray(invoice.items) ? invoice.items.map((item) => ({
      description: String(item.description || "").trim(),
      hsnCode: String(item.hsnCode || "").trim(),
      quantity: readNumber(item.quantity),
      rate: readNumber(item.rate),
      itemDiscountPercent: readNumber(item.itemDiscountPercent),
      baseAmount: readNumber(item.baseAmount),
      amount: readNumber(item.amount)
    })) : [],
    subtotal: readNumber(invoice.subtotal),
    itemDiscountTotal: readNumber(invoice.itemDiscountTotal),
    invoiceLevelDiscountAmount: readNumber(invoice.invoiceLevelDiscountAmount),
    discountAmount: readNumber(invoice.discountAmount),
    taxableAmount: readNumber(invoice.taxableAmount),
    gstAmount: readNumber(invoice.gstAmount),
    total: readNumber(invoice.total)
  };
}

function mapItemToSupabaseRow(item) {
  return {
    id: item.id,
    user_id: state.currentUser.id,
    name: item.name,
    hsn_code: item.hsnCode || null,
    rate: readNumber(item.rate),
    stock_qty: readNumber(item.stockQty)
  };
}

function mapItemFromSupabaseRow(row) {
  return normalizeItemRecord({
    id: row.id,
    name: row.name,
    hsnCode: row.hsn_code,
    rate: row.rate,
    stockQty: row.stock_qty
  });
}

function mapInvoiceToSupabaseRow(invoice) {
  return {
    id: invoice.id,
    user_id: state.currentUser.id,
    document_type: invoice.documentType,
    client_name: invoice.clientName,
    client_email: invoice.clientEmail,
    client_phone: invoice.clientPhone,
    client_gst: invoice.clientGst,
    client_address: invoice.clientAddress,
    invoice_number: invoice.invoiceNumber,
    invoice_date: invoice.invoiceDate || null,
    due_date: invoice.dueDate || null,
    status: invoice.status,
    gst_percent: readNumber(invoice.gstPercent),
    discount_percent: readNumber(invoice.discountPercent),
    notes: invoice.notes || "",
    items: invoice.items || [],
    subtotal: readNumber(invoice.subtotal),
    item_discount_total: readNumber(invoice.itemDiscountTotal),
    invoice_level_discount_amount: readNumber(invoice.invoiceLevelDiscountAmount),
    discount_amount: readNumber(invoice.discountAmount),
    taxable_amount: readNumber(invoice.taxableAmount),
    gst_amount: readNumber(invoice.gstAmount),
    total: readNumber(invoice.total),
    created_at: invoice.createdAt || new Date().toISOString()
  };
}

function mapInvoiceFromSupabaseRow(row) {
  return normalizeInvoiceRecord({
    id: row.id,
    documentType: row.document_type,
    clientName: row.client_name,
    clientEmail: row.client_email,
    clientPhone: row.client_phone,
    clientGst: row.client_gst,
    clientAddress: row.client_address,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    status: row.status,
    gstPercent: row.gst_percent,
    discountPercent: row.discount_percent,
    notes: row.notes,
    items: row.items,
    subtotal: row.subtotal,
    itemDiscountTotal: row.item_discount_total,
    invoiceLevelDiscountAmount: row.invoice_level_discount_amount,
    discountAmount: row.discount_amount,
    taxableAmount: row.taxable_amount,
    gstAmount: row.gst_amount,
    total: row.total,
    createdAt: row.created_at
  });
}

async function cacheWorkspaceLocally() {
  await replaceStoreContents(INVOICES_STORE, state.invoices);
  await replaceStoreContents(USERS_STORE, state.users);
  await replaceStoreContents(ITEMS_STORE, state.items);
  await setMetaValue("businessProfile", state.businessProfile);
  await setMetaValue("invoiceCounter", state.nextInvoiceCounter);
  await setMetaValue("proformaCounter", state.proformaCounter);
}

async function saveBusinessProfile() {
  if (!canUseSupabaseStorage()) {
    await setMetaValue("businessProfile", state.businessProfile);
    throw new Error("Backend workspace is not available.");
  }

  state.currentUser = {
    ...state.currentUser,
    companyName: state.businessProfile.businessName || state.currentUser.companyName
  };
  saveSession(state.currentUser);
  state.users = [createCurrentUserRecord()];
  await saveUsers();
  await saveWorkspaceData();
}

async function saveUserCounters() {
  if (canUseSupabaseStorage()) {
    await saveWorkspaceData();
    return;
  }

  await setMetaValue("businessProfile", state.businessProfile);
  await setMetaValue("invoiceCounter", state.nextInvoiceCounter);
  await setMetaValue("proformaCounter", state.proformaCounter);
}

async function loadWorkspaceData() {
  if (!canUseSupabaseStorage()) {
    return;
  }

  const localSnapshot = createWorkspaceSnapshot();
  const workspace = await backendRequest("/api/workspace");
  applyWorkspaceResponse(workspace);

  if (shouldSeedSupabaseWorkspace(localSnapshot, {
    invoices: state.invoices,
    items: state.items
  })) {
    state.invoices = localSnapshot.invoices.map(normalizeInvoiceRecord);
    state.items = localSnapshot.items.map(normalizeItemRecord);
    state.businessProfile = normalizeBusinessProfile(localSnapshot.businessProfile);
    state.nextInvoiceCounter = Math.max(1, Number(localSnapshot.nextInvoiceCounter) || 1);
    state.proformaCounter = Math.max(1, Number(localSnapshot.proformaCounter) || 1);
    await saveWorkspaceData();
    return;
  }

  await cacheWorkspaceLocally();
}

async function applyAuthenticatedUser(user) {
  state.currentUser = createSessionFromSupabaseUser(user);
  saveSession(state.currentUser);
  await syncUserProfile(user);
  try {
    await loadWorkspaceData();
  } catch (error) {
    console.error("Failed to load Supabase workspace.", error);
    elements.authMessage.textContent = "Signed in, but your cloud data could not be loaded. Showing the local cache for now.";
  }
  updateSessionLabel();
  showApp();
  initializeBillingApp();
  state.onboardingRequired = !hasCompletedOnboarding();
  if (state.onboardingRequired) {
    elements.authMessage.textContent = "Email confirmed. Finish company onboarding to unlock the dashboard, bills, and inventory for this account.";
    switchTab("company");
    elements.companyProfileForm?.elements.businessName?.focus();
  } else {
    switchTab("dashboard");
  }
}

async function syncUserProfile(user) {
  const sessionUser = createSessionFromSupabaseUser(user);
  const nextBusinessProfile = normalizeBusinessProfile({
    ...state.businessProfile,
    businessName: state.businessProfile.businessName || sessionUser.companyName
  });
  state.businessProfile = nextBusinessProfile;

  const existingUserIndex = state.users.findIndex((entry) => entry.email?.toLowerCase() === sessionUser.email.toLowerCase());
  const localUserRecord = {
    userId: sessionUser.userId,
    name: sessionUser.name,
    email: sessionUser.email,
    companyName: sessionUser.companyName,
    supabaseUserId: user.id
  };

  if (existingUserIndex >= 0) {
    state.users = [{
      ...state.users[existingUserIndex],
      ...localUserRecord
    }];
  } else {
    state.users = [localUserRecord];
  }

  await saveUsers();
}

async function saveInvoices() {
  if (canUseSupabaseStorage()) {
    await saveWorkspaceData();
    return;
  }
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
    await saveUserCounters();
    return;
  }

  state.nextInvoiceCounter += 1;
  await saveUserCounters();
}

async function saveUsers() {
  await replaceStoreContents(USERS_STORE, state.users);
}

async function saveItems() {
  if (canUseSupabaseStorage()) {
    await saveWorkspaceData();
    return;
  }
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
    businessProfile: state.businessProfile,
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
    businessProfile: normalizeBusinessProfile(payload.businessProfile),
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
