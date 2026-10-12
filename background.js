"use strict";

const PENDING_KEY = "pendingIrctcAutofill";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) {
        return;
    }

    // Auto Fill ప్రారంభం
    if (message.action === "START_BACKGROUND_AUTOFILL") {
        const login = message.login || {};
        const booking = message.booking;

        if (!booking) {
            sendResponse({
                success: false,
                message: "Booking details ఇవ్వలేదు."
            });
            return;
        }

        chrome.tabs.query(
            { active: true, lastFocusedWindow: true },
            async (tabs) => {
                const tab = tabs[0];

                if (
                    !tab?.id ||
                    !tab.url?.startsWith("https://www.irctc.co.in/")
                ) {
                    sendResponse({
                        success: false,
                        message: "IRCTC పేజీని తెరిచి మళ్లీ ప్రయత్నించండి."
                    });
                    return;
                }

                try {
                    // Login/navigation సమయంలో booking details కోల్పోకుండా save చేయాలి.
                    await chrome.storage.session.set({
                        [PENDING_KEY]: {
                            tabId: tab.id,
                            login,
                            booking,
                            createdAt: Date.now()
                        }
                    });

                    const result = await chrome.tabs.sendMessage(tab.id, {
                        action: "FILL_BOOKING",
                        login,
                        booking
                    });

                    sendResponse(result || {
                        success: false,
                        message: "IRCTC నుంచి స్పందన రాలేదు."
                    });
                } catch (error) {
                    console.error("START_BACKGROUND_AUTOFILL error:", error);

                    sendResponse({
                        success: false,
                        message:
                            "IRCTC content script‌తో కనెక్షన్ విఫలమైంది. " +
                            "పేజీ Reload అయిన తర్వాత మళ్లీ ప్రయత్నించండి."
                    });
                }
            }
        );

        return true;
    }

    // Content script page load తర్వాత pending details అడిగినప్పుడు
    if (message.action === "GET_PENDING_AUTOFILL") {
        chrome.storage.session.get(PENDING_KEY)
            .then((data) => {
                const pending = data[PENDING_KEY];

                // అదే tab కోసం ఉన్న details మాత్రమే ఇవ్వాలి.
                if (
                    pending &&
                    sender.tab?.id === pending.tabId
                ) {
                    sendResponse({
                        success: true,
                        pending
                    });
                } else {
                    sendResponse({
                        success: true,
                        pending: null
                    });
                }
            })
            .catch((error) => {
                console.error("GET_PENDING_AUTOFILL error:", error);
                sendResponse({
                    success: false,
                    pending: null
                });
            });

        return true;
    }

    // Booking autofill పూర్తయిన తర్వాత pending details తొలగించాలి
    if (message.action === "CLEAR_PENDING_AUTOFILL") {
        chrome.storage.session.get(PENDING_KEY)
            .then(async (data) => {
                const pending = data[PENDING_KEY];

                if (
                    pending &&
                    sender.tab?.id === pending.tabId
                ) {
                    await chrome.storage.session.remove(PENDING_KEY);
                }

                sendResponse({ success: true });
            })
            .catch((error) => {
                console.error("CLEAR_PENDING_AUTOFILL error:", error);
                sendResponse({ success: false });
            });

        return true;
    }
});