
"use strict";

(function () {
    const DEFAULT_DURATION = 4500;
    const EXIT_DURATION = 220;

    let container = null;
    let nextToastId = 0;

    function ensureContainer() {
        if (container && container.isConnected) {
            return container;
        }

        container = document.createElement("div");
        container.id = "irctcToastContainer";
        container.setAttribute("aria-label", "Notifications");

        document.body.appendChild(container);

        return container;
    }

    function removeToast(toast) {
        if (!toast || toast.dataset.closing === "true") {
            return;
        }

        toast.dataset.closing = "true";

        window.clearTimeout(toast._hideTimer);

        if (toast._animationFrame !== null) {
            cancelAnimationFrame(toast._animationFrame);
            toast._animationFrame = null;
        }

        toast.classList.add("is-closing");

        window.setTimeout(() => {
            toast.remove();

            if (container && container.children.length === 0) {
                container.remove();
                container = null;
            }
        }, EXIT_DURATION);
    }

    function show(message, type = "error", duration = DEFAULT_DURATION) {
        if (message === null || message === undefined ||
            String(message).trim() === "") {
            return null;
        }

        const host = ensureContainer();
        const toast = document.createElement("div");

        toast.className = type === "success"
            ? "irctc-toast is-success"
            : "irctc-toast";
        toast.dataset.toastId = String(++nextToastId);
        toast.dataset.closing = "false";

        const isSuccess = type === "success";

        toast.setAttribute(
            "role",
            isSuccess ? "status" : "alert"
        );

        toast.setAttribute(
            "aria-live",
            isSuccess ? "polite" : "assertive"
        );

        const content = document.createElement("div");
        content.className = "irctc-toast-content";

        const icon = document.createElement("span");
        icon.className = "irctc-toast-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = isSuccess ? "✓" : "!";

        const text = document.createElement("p");
        text.className = "irctc-toast-message";
        text.textContent = String(message);

        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "irctc-toast-close";
        closeButton.setAttribute(
            "aria-label",
            "Dismiss notification"
        );
        closeButton.textContent = "×";

        const progress = document.createElement("div");
        progress.className = "irctc-toast-progress";
        progress.setAttribute("aria-hidden", "true");

        const progressBar = document.createElement("div");
        progressBar.className = "irctc-toast-progress-bar";

        //if (isSuccess) {
        //    toast.style.borderColor = "#b7e4c7";
        //    icon.style.background = "#dcfce7";
        //    icon.style.color = "#15803d";
        //    progress.style.background = "#dcfce7";
        //    progressBar.style.background = "#16a34a";
        //}

        content.append(icon, text, closeButton);
        progress.appendChild(progressBar);
        toast.append(content, progress);
        host.appendChild(toast);

        const timeout = Math.max(
            1000,
            Number(duration) || DEFAULT_DURATION
        );

        let remaining = timeout;
        let startedAt = performance.now();
        let paused = false;

        toast._hideTimer = null;
        toast._animationFrame = null;

        function updateProgress() {
            if (
                toast.dataset.closing === "true" ||
                paused
            ) {
                toast._animationFrame = null;
                return;
            }

            const elapsed = performance.now() - startedAt;
            const fraction = Math.max(
                0,
                remaining - elapsed
            ) / timeout;

            progressBar.style.transform =
                `scaleX(${fraction})`;

            if (fraction > 0) {
                toast._animationFrame =
                    requestAnimationFrame(updateProgress);
            } else {
                toast._animationFrame = null;
            }
        }

        function dismiss() {
            removeToast(toast);
        }

        function pause() {
            if (
                paused ||
                toast.dataset.closing === "true"
            ) {
                return;
            }

            paused = true;

            remaining = Math.max(
                0,
                remaining - (performance.now() - startedAt)
            );

            window.clearTimeout(toast._hideTimer);

            if (toast._animationFrame !== null) {
                cancelAnimationFrame(toast._animationFrame);
                toast._animationFrame = null;
            }

            progressBar.style.transform =
                `scaleX(${remaining / timeout})`;
        }

        function resume() {
            if (
                !paused ||
                toast.dataset.closing === "true"
            ) {
                return;
            }

            paused = false;
            startedAt = performance.now();

            toast._hideTimer = window.setTimeout(
                dismiss,
                remaining
            );

            toast._animationFrame =
                requestAnimationFrame(updateProgress);
        }

        closeButton.addEventListener("click", dismiss);
        toast.addEventListener("mouseenter", pause);
        toast.addEventListener("mouseleave", resume);
        toast.addEventListener("focusin", pause);
        toast.addEventListener("focusout", event => {
            if (!toast.contains(event.relatedTarget)) {
                resume();
            }
        });

        toast._hideTimer = window.setTimeout(
            dismiss,
            remaining
        );

        toast._animationFrame =
            requestAnimationFrame(updateProgress);

        return {
            dismiss,
            element: toast
        };
    }

    function clear() {
        if (!container) {
            return;
        }

        container
            .querySelectorAll(".irctc-toast")
            .forEach(toast => removeToast(toast));
    }

    window.IRCTCToast = {
        show,
        clear
    };
})();
