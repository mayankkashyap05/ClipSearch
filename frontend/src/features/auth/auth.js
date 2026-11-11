import { api } from "../../services/api.js";
import { DEFAULT_API_BASE, state } from "../../state/app-state.js";
import { showToast } from "../../components/feedback.js";
import { showScreen, updateAccount } from "../../components/navigation.js";

export function createAuthFeature({ onAuthenticated, onSignedOut }) {
  const tabLogin = document.getElementById("tabLogin");
  const tabSignup = document.getElementById("tabSignup");
  const title = document.getElementById("signinTitle");
  const subtitle = document.getElementById("signinSub");
  const submitButton = document.getElementById("authSubmit");
  const errorBox = document.getElementById("signinError");
  const form = document.getElementById("authForm");
  const passwordInput = document.getElementById("authPassword");
  const apiBaseInput = document.getElementById("apiBaseInput");
  const advancedToggle = document.getElementById("advancedToggle");
  const advancedFields = document.getElementById("advancedFields");

  apiBaseInput.value = state.auth.apiBase;

  function setMode(mode) {
    state.auth.mode = mode;
    const isLogin = mode === "login";
    tabLogin.classList.toggle("active", isLogin);
    tabSignup.classList.toggle("active", !isLogin);
    tabLogin.setAttribute("aria-selected", String(isLogin));
    tabSignup.setAttribute("aria-selected", String(!isLogin));
    title.textContent = isLogin ? "Welcome back" : "Create your account";
    subtitle.textContent = isLogin ? "Sign in to your video library." : "Set a password to start indexing videos.";
    submitButton.textContent = isLogin ? "Sign in" : "Create account";
    passwordInput.autocomplete = isLogin ? "current-password" : "new-password";
    form.setAttribute("aria-labelledby", isLogin ? "tabLogin" : "tabSignup");
    errorBox.textContent = "";
  }

  function showAuthError(message) {
    errorBox.textContent = message;
  }

  tabLogin.addEventListener("click", () => setMode("login"));
  tabSignup.addEventListener("click", () => setMode("signup"));
  [tabLogin, tabSignup].forEach((tab, index, tabs) => {
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[nextIndex].focus();
      setMode(nextIndex === 0 ? "login" : "signup");
    });
  });

  advancedToggle.addEventListener("click", () => {
    const expanded = advancedToggle.getAttribute("aria-expanded") !== "true";
    advancedToggle.setAttribute("aria-expanded", String(expanded));
    advancedFields.classList.toggle("show", expanded);
  });
  apiBaseInput.addEventListener("change", () => {
    state.auth.apiBase = apiBaseInput.value.trim() || DEFAULT_API_BASE;
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const email = document.getElementById("authEmail").value.trim();
    const password = passwordInput.value;
    state.auth.apiBase = apiBaseInput.value.trim() || DEFAULT_API_BASE;

    if (!email || !password) {
      showAuthError("Enter both an email address and a password.");
      return;
    }
    if (state.auth.mode === "signup" && password.length < 8) {
      showAuthError("Password must be at least 8 characters.");
      return;
    }

    errorBox.textContent = "";
    submitButton.classList.add("btn-loading");
    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");
    try {
      const data = await api.authenticate(state.auth.mode, { email, password });
      state.auth.token = data.access_token;
      state.auth.email = data.email;
      localStorage.setItem("clipsearch_token", state.auth.token);
      localStorage.setItem("clipsearch_email", state.auth.email);
      localStorage.setItem("clipsearch_api_base", state.auth.apiBase);
      updateAccount();
      showToast("success", state.auth.mode === "login" ? "Signed in successfully." : "Account created — welcome.");
      onAuthenticated();
    } catch (error) {
      const message = error.message || "Could not reach the server. Check the API base URL.";
      showAuthError(message);
      showToast("error", /invalid|incorrect|unauthorized|401/i.test(message) ? "Incorrect email or password." : message);
    } finally {
      submitButton.classList.remove("btn-loading");
      submitButton.disabled = false;
      submitButton.removeAttribute("aria-busy");
    }
  });

  function signOut(showMessage = true) {
    state.auth.token = null;
    state.auth.email = null;
    localStorage.removeItem("clipsearch_token");
    localStorage.removeItem("clipsearch_email");
    document.getElementById("authPassword").value = "";
    onSignedOut();
    setMode("login");
    updateAccount();
    showScreen("signin", { focus: true });
    if (showMessage) showToast("success", "Signed out.");
  }

  document.querySelectorAll('[data-action="signout"]').forEach(button => {
    button.addEventListener("click", () => signOut(true));
  });

  return { signOut, setMode };
}
