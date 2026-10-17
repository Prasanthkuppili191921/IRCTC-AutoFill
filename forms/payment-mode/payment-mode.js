
"use strict";

(() => {
    const form = document.getElementById("paymentModeForm");

    if (!form) {
        return;
    }

    const DEFAULT_PAYMENT_MODE = "other";

    function read() {
        const selected = form.querySelector(
            'input[name="paymentMode"]:checked'
        );

        return {
            paymentMode: selected
                ? selected.value
                : DEFAULT_PAYMENT_MODE
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
    }

    window.IRCTCPaymentMode = {
        read,
        populate
    };
})();
