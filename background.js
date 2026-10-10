
"use strict";

chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
        if (!message || message.action !== "START_BACKGROUND_AUTOFILL") {
            return;
        }

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
                    const result = await chrome.tabs.sendMessage(
                        tab.id,
                        {
                            action: "FILL_BOOKING",
                            booking
                        }
                    );

                    sendResponse(result || {
                        success: false,
                        message: "IRCTC నుంచి స్పందన రాలేదు."
                    });
                } catch (error) {
                    sendResponse({
                        success: false,
                        message:
                            "IRCTC content script‌తో కనెక్షన్ విఫలమైంది. " +
                            "IRCTC పేజీని Reload చేయండి."
                    });
                }
            }
        );

        return true;
    }
);
