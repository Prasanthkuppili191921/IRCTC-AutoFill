"use strict";

(() => {
    const form = document.getElementById("paymentModeForm");

    if (!form) {
        return;
    }

    const DEFAULT_PAYMENT_MODE = "other";

    const optionsContainer = document.getElementById(
        "paymentOptionsContainer"
    );

    function getSelectedMode() {
        const selected = form.querySelector(
            'input[name="paymentMode"]:checked'
        );

        return selected
            ? selected.value
            : DEFAULT_PAYMENT_MODE;
    }

    function updatePaymentOptionsMode() {
        const paymentMode = getSelectedMode();

        if (optionsContainer) {
            optionsContainer.dataset.paymentMode = paymentMode;
        }
    }

    function read() {
        return {
            paymentMode: getSelectedMode()
        };
    }

    function populate(data = {}) {
        const paymentMode =
            data.paymentMode === "bhim-upi"
                ? "bhim-upi"
                : DEFAULT_PAYMENT_MODE;

        const radio = form.querySelector(
            `input[name="paymentMode"][value="${paymentMode}"]`
        );

        if (radio) {
            radio.checked = true;
        }

        updatePaymentOptionsMode();
    }

    form.addEventListener("change", event => {
        if (
            event.target.matches('input[name="paymentMode"]')
        ) {
            updatePaymentOptionsMode();
        }
    });

    window.IRCTCPaymentMode = {
        read,
        populate
    };

    updatePaymentOptionsMode();
})();