
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const passwordInput = document.getElementById("password");
    const togglePasswordButton =
        document.getElementById("togglePassword");
    const loginStatus = document.getElementById("loginStatus");

    // Show or hide password.
    togglePasswordButton.addEventListener("click", () => {
        const showPassword = passwordInput.type === "password";

        passwordInput.type = showPassword ? "text" : "password";

        togglePasswordButton.setAttribute(
            "aria-label",
            showPassword ? "Hide password" : "Show password"
        );

        togglePasswordButton.setAttribute(
            "aria-pressed",
            String(showPassword)
        );
    });

    // Validate the form without saving or transmitting credentials.
    loginForm.addEventListener("submit", (event) => {
        event.preventDefault();

        loginStatus.textContent = "";

        if (!loginForm.checkValidity()) {
            loginForm.reportValidity();
            return;
        }

        loginStatus.textContent =
            "Login form is ready. Connect the Sign In action to the IRCTC login flow.";
    });
});
