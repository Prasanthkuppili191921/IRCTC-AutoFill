
"use strict";

const PENDING_KEY = "pendingIrctcAutofill";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) {
        return;
    }

    // ==========================================
    // PAGE-AWARE AUTOFILL
    // ==========================================
    if (message.action === "START_BACKGROUND_AUTOFILL") {
        const login = message.login || {};
        const booking = message.booking || {};

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
                    // Step 1: ప్రస్తుతం ఉన్న IRCTC page గుర్తించాలి.
                    const detection = await chrome.tabs.sendMessage(tab.id, {
                        action: "PAGE_AWARE_DETECT"
                    });

                    if (!detection?.success || !detection.context?.pageType) {
                        sendResponse({
                            success: false,
                            message: "IRCTC page‌ను గుర్తించలేకపోయాం."
                        });
                        return;
                    }

                    const pageType = detection.context.pageType;
                    let result;

                    console.log(
                        "[IRCTC Autofill] Active page:",
                        pageType
                    );

                    // Step 2: గుర్తించిన page‌కు సంబంధించిన
                    // functionality మాత్రమే execute చేయాలి.
                    switch (pageType) {

                        // --------------------------
                        // LOGIN PAGE
                        // --------------------------
                        case "login": {
                            if (!login.username || !login.password) {
                                sendResponse({
                                    success: false,
                                    pageType,
                                    message: "Saved login credentials లేవు."
                                });
                                return;
                            }

                            result = await chrome.tabs.sendMessage(tab.id, {
                                action: "FILL_LOGIN",
                                username: login.username,
                                password: login.password
                            });

                            sendResponse({
                                ...(result || {
                                    success: false,
                                    message: "Login autofill నుంచి స్పందన రాలేదు."
                                }),
                                pageType
                            });

                            return;
                        }

                        // --------------------------
                        // BOOKING / JOURNEY PAGE
                        // --------------------------
                        case "booking": {
                            if (
                                !booking.fromStation ||
                                !booking.toStation ||
                                !booking.journeyDate
                            ) {
                                sendResponse({
                                    success: false,
                                    pageType,
                                    message: "Journey details incompleteగా ఉన్నాయి."
                                });
                                return;
                            }

                            // Existing pending/resume functionality
                            // booking flow కోసం మాత్రమే ఉంచాలి.
                            await chrome.storage.session.set({
                                [PENDING_KEY]: {
                                    tabId: tab.id,
                                    login,
                                    booking,
                                    createdAt: Date.now()
                                }
                            });

                            result = await chrome.tabs.sendMessage(tab.id, {
                                action: "FILL_BOOKING",
                                login,
                                booking
                            });

                            sendResponse({
                                ...(result || {
                                    success: false,
                                    message: "Booking autofill నుంచి స్పందన రాలేదు."
                                }),
                                pageType
                            });

                            return;
                        }

                        // --------------------------
                        // TRAIN LIST PAGE
                        // --------------------------
                        case "train-list": {
                            result = await chrome.tabs.sendMessage(tab.id, {
                                action: "PAGE_AWARE_AUTOFILL",
                                login,
                                booking
                            });

                            sendResponse({
                                ...(result || {
                                    success: false,
                                    message: "Train selection నుంచి స్పందన రాలేదు."
                                }),
                                pageType
                            });

                            return;
                        }

                        // --------------------------
                        // PASSENGER DETAILS PAGE
                        // --------------------------
                        case "passenger": {
                            const passenger =
                                booking.passengers?.[0] ||
                                booking.passenger ||
                                message.passenger;

                            if (!passenger) {
                                sendResponse({
                                    success: false,
                                    pageType,
                                    message: "Saved passenger details లేవు."
                                });
                                return;
                            }

                            result = await chrome.tabs.sendMessage(tab.id, {
                                action: "FILL_PASSENGER",
                                passenger
                            });

                            sendResponse({
                                ...(result || {
                                    success: false,
                                    message: "Passenger autofill నుంచి స్పందన రాలేదు."
                                }),
                                pageType
                            });

                            return;
                        }

                        // --------------------------
                        // UNSUPPORTED PAGE
                        // --------------------------
                        default:
                            sendResponse({
                                success: false,
                                pageType: "unsupported",
                                message:
                                    "ఈ IRCTC page‌కు AutoFill support లేదు."
                            });

                            return;
                    }
                } catch (error) {
                    console.error(
                        "START_BACKGROUND_AUTOFILL error:",
                        error
                    );

                    sendResponse({
                        success: false,
                        message:
                            "IRCTC content script‌తో కనెక్షన్ విఫలమైంది. " +
                            "Extension Reload చేసి మళ్లీ ప్రయత్నించండి."
                    });
                }
            }
        );

        return true;
    }

    // ==========================================
    // GET PENDING AUTOFILL
    // Existing functionality preserved
    // ==========================================
    if (message.action === "GET_PENDING_AUTOFILL") {
        chrome.storage.session.get(PENDING_KEY)
            .then((data) => {
                const pending = data[PENDING_KEY];

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

    // ==========================================
    // CLEAR PENDING AUTOFILL
    // Existing functionality preserved
    // ==========================================
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
