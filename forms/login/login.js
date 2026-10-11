"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const usernameInput = document.getElementById("username");
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

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username) {
            IRCTCToast.show("Please enter your username.", "error");
            usernameInput.focus();
            return;
        }

        if (!password.trim()) {
            IRCTCToast.show("Please enter your password.", "error");
            passwordInput.focus();
            return;
        }

        if (!loginForm.checkValidity()) {
            IRCTCToast.show(
                "Please check the entered details.",
                "error"
            );
            loginForm.reportValidity();
            return;
        }

        loginStatus.textContent =
            "Login form is ready. Connect the Sign In action to the IRCTC login flow.";
    });
});
