
"use strict";

// ======================================================
// PAGE-AWARE AUTOFILL
// File: content/content-3.js
//
// Existing content-1.js and content-2.js remain unchanged.
// This file only detects the active IRCTC page and routes
// new page-aware requests to existing handlers.
// ======================================================

const PageAwareAutofill = (() => {

    // --------------------------------------------------
    // COMMON HELPERS
    // --------------------------------------------------

    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style = window.getComputedStyle(element);

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity) !== 0 &&
            element.getClientRects().length > 0
        );
    }

    function normalizeText(value) {
        return String(value ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function getVisibleElements(selector) {
        return Array.from(
            document.querySelectorAll(selector)
        ).filter(isVisible);
    }

    // --------------------------------------------------
    // PAGE DETECTION
    // --------------------------------------------------

    function detectIrctcPageContext() {

        // 1. Train List page
        const trainHeadings = getVisibleElements(
            "app-train-avl-enq .train-heading strong"
        );

        if (trainHeadings.length > 0) {
            return {
                pageType: "train-list",
                confidence: "high",
                reason: "Train result headings detected."
            };
        }

        // 2. Login form
        const usernameFields = getVisibleElements(
            'input[formcontrolname="userid"], ' +
            'input[placeholder="User Name"]'
        );

        const passwordFields = getVisibleElements(
            'input[formcontrolname="password"], ' +
            'input[placeholder="Password"], ' +
            'input[type="password"]'
        );

        if (
            usernameFields.length > 0 &&
            passwordFields.length > 0
        ) {
            return {
                pageType: "login",
                confidence: "high",
                reason: "Visible login fields detected."
            };
        }

        // 3. Passenger details page
        const passengerInputs = getVisibleElements("input")
            .filter(input => {
                const description = [
                    input.name,
                    input.id,
                    input.placeholder,
                    input.getAttribute("aria-label"),
                    input.getAttribute("formcontrolname")
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return (
                    /passenger.?name|psgn.?name/.test(description)
                );
            });

        const bodyText = normalizeText(
            document.querySelector("main")?.innerText ||
            document.body?.innerText ||
            ""
        );

        const passengerRoute =
            /passenger-details|psgninput/i.test(location.href);

        if (
            passengerRoute ||
            (
                passengerInputs.length > 0 &&
                bodyText.includes("passenger details")
            )
        ) {
            return {
                pageType: "passenger",
                confidence: "medium",
                reason: "Passenger fields or route detected."
            };
        }

        // 4. Journey booking form
        const bookingSelectors = [
            "#origin input",
            "#destination input",
            "#jDate input",
            "#journeyClass",
            "#journeyQuota"
        ];

        const bookingFormVisible = bookingSelectors.every(
            selector => {
                const element = document.querySelector(selector);
                return isVisible(element);
            }
        );

        if (bookingFormVisible) {
            return {
                pageType: "booking",
                confidence: "high",
                reason: "Journey booking form detected."
            };
        }

        // 5. Unsupported page
        return {
            pageType: "unsupported",
            confidence: "none",
            reason: "No supported IRCTC page pattern matched."
        };
    }

    // --------------------------------------------------
    // LOGIN PAGE HANDLER
    // --------------------------------------------------

    async function handleLoginPageAutofill(message) {
        const login = message.login || {};

        if (!login.username || !login.password) {
            return {
                success: false,
                pageType: "login",
                message: "Saved login credentials లేవు."
            };
        }

        if (typeof fillLoginDetails !== "function") {
            return {
                success: false,
                pageType: "login",
                message: "Existing login autofill method అందుబాటులో లేదు."
            };
        }

        const result = fillLoginDetails(
            login.username,
            login.password
        );

        return {
            ...result,
            pageType: "login"
        };
    }


    // --------------------------------------------------
    // TRAIN LIST PAGE HANDLER
    // --------------------------------------------------



    async function handleTrainListPageAutofill(message) {
        const booking = message?.booking || {};

        // Auto-Fill form నుంచి వచ్చిన saved record మాత్రమే source.
        const trainNumber = String(
            booking.trainSelection?.trainNumber ||
            booking.trainNumber ||
            ""
        ).trim();

        const travelClass = String(
            booking.travelClass || ""
        ).trim();

        const journeyDate = String(
            booking.journeyDate || ""
        ).trim();

        const fromStation = String(
            booking.fromStation || ""
        ).trim();

        const toStation = String(
            booking.toStation || ""
        ).trim();

        const quota = String(
            booking.quota || ""
        ).trim();

        const flexibleDate = Boolean(
            booking.flexibleDate
        );

        console.log("[IRCTC PageAware] Saved Auto-Fill record:", {
            trainNumber,
            fromStation,
            toStation,
            journeyDate,
            travelClass,
            quota,
            flexibleDate
        });

        // Required saved values validation
        if (!fromStation || !toStation || !journeyDate) {
            return {
                success: false,
                message: "Auto-Fill formలో From Station, To Station లేదా Journey Date missing ఉంది.",
                pageType: "train-list"
            };
        }

        if (!trainNumber) {
            return {
                success: false,
                message: "Auto-Fill formలో Train Number save కాలేదు.",
                pageType: "train-list"
            };
        }

        if (!travelClass) {
            return {
                success: false,
                message: "Auto-Fill formలో Travel Class save కాలేదు.",
                pageType: "train-list"
            };
        }

        if (typeof checkSavedTrainOnPage !== "function") {
            return {
                success: false,
                message: "Train selection function అందుబాటులో లేదు.",
                pageType: "train-list"
            };
        }

        try {
            // Train number, class, date అన్నీ saved form నుంచే.
            const result = await checkSavedTrainOnPage(
                trainNumber,
                travelClass,
                journeyDate
            );

            return {
                ...result,
                pageType: "train-list",
                usedSavedForm: true,
                savedDetails: {
                    trainNumber,
                    fromStation,
                    toStation,
                    journeyDate,
                    travelClass,
                    quota,
                    flexibleDate
                }
            };
        } catch (error) {
            console.error(
                "[IRCTC PageAware] Train-list autofill failed:",
                error
            );

            return {
                success: false,
                message: error?.message || "Train List Auto-Fill failed.",
                pageType: "train-list"
            };
        }
    }



    // --------------------------------------------------
    // PASSENGER PAGE HANDLER
    // --------------------------------------------------



    async function handlePassengerPageAutofill(message) {
        const passengerDetails =
            message?.passengerDetails ||
            message?.booking?.passengerDetails ||
            {};

        let passengers = Array.isArray(passengerDetails.passengers)
            ? passengerDetails.passengers
            : [];

        // Backward compatibility for older record structures.
        if (passengers.length === 0) {
            if (Array.isArray(message?.booking?.passengers)) {
                passengers = message.booking.passengers;
            } else if (message?.booking?.passenger) {
                passengers = [message.booking.passenger];
            } else if (message?.passenger) {
                passengers = [message.passenger];
            }
        }

        const contactDetails =
            passengerDetails.contactDetails || {};

        if (passengers.length === 0) {
            return {
                success: false,
                pageType: "passenger",
                message: "Saved passenger details లేవు."
            };
        }

        if (typeof fillPassengerDetails !== "function") {
            return {
                success: false,
                pageType: "passenger",
                message: "Passenger autofill function అందుబాటులో లేదు."
            };
        }

        const result = await Promise.resolve(
            fillPassengerDetails({
                passengers,
                contactDetails
            })
        );

        return {
            ...result,
            pageType: "passenger",
            passengersAvailable: passengers.length,
            contactDetailsAvailable:
                Object.keys(contactDetails).length > 0
        };
    }



    // --------------------------------------------------
    // PAGE-AWARE DISPATCHER
    // --------------------------------------------------

    async function handlePageAwareAutofill(message) {
        const context = detectIrctcPageContext();

        console.log(
            "[IRCTC PageAware] Detected context:",
            context
        );

        switch (context.pageType) {
            case "login":
                return handleLoginPageAutofill(message);

            case "booking":
                return handleBookingPageAutofill(message);

            case "train-list":
                return handleTrainListPageAutofill(message);

            case "passenger":
                return handlePassengerPageAutofill(message);

            default:
                return {
                    success: false,
                    pageType: "unsupported",
                    message:
                        "ఈ IRCTC page‌కు AutoFill support లేదు."
                };
        }
    }

    // --------------------------------------------------
    // PUBLIC API
    // --------------------------------------------------

    return {
        detectIrctcPageContext,
        handlePageAwareAutofill
    };

})();

// ------------------------------------------------------
// MESSAGE HANDLER
// Uses new action names to avoid conflicts with the
// existing message handlers in content-1.js/content-2.js.
// ------------------------------------------------------

chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {

        if (!message || !message.action) {
            return;
        }

        if (message.action === "PAGE_AWARE_DETECT") {
            sendResponse({
                success: true,
                context:
                    PageAwareAutofill.detectIrctcPageContext()
            });

            return;
        }

        if (message.action === "PAGE_AWARE_AUTOFILL") {
            PageAwareAutofill
                .handlePageAwareAutofill(message)
                .then(sendResponse)
                .catch(error => {
                    console.error(
                        "[IRCTC PageAware] Autofill failed:",
                        error
                    );

                    sendResponse({
                        success: false,
                        pageType: "unknown",
                        message: "Page-aware AutoFill విఫలమైంది."
                    });
                });

            return true;
        }
    }
);


(() => {
    let lastProcessedUrl = "";
    let processing = false;

    const sleep = ms =>
        new Promise(resolve => setTimeout(resolve, ms));

    function isPassengerPage() {
        return /psgninput|passenger-details/i.test(location.href);
    }

    function passengerFormReady() {
        return Boolean(document.querySelector(
            'input[formcontrolname="passengerName"], ' +
            'input[name*="passengerName" i], ' +
            'input[placeholder*="name" i]'
        ));
    }

    async function tryPendingPassengerAutofill() {
        const url = location.href;

        if (!isPassengerPage()) {
            return;
        }

        if (processing || lastProcessedUrl === url) {
            return;
        }

        processing = true;

        try {
            const response = await chrome.runtime.sendMessage({
                action: "GET_PENDING_AUTOFILL"
            });

            if (!response?.success || !response.pending) {
                return;
            }

            const pending = response.pending;

            const passengerDetails =
                pending.passengerDetails ||
                pending.booking?.passengerDetails ||
                {};

            const passengers = Array.isArray(passengerDetails.passengers)
                ? passengerDetails.passengers
                : Array.isArray(pending.booking?.passengers)
                    ? pending.booking.passengers
                    : pending.booking?.passenger
                        ? [pending.booking.passenger]
                        : [];

            if (passengers.length === 0) {
                console.warn(
                    "[IRCTC Passenger] Pending recordలో passengers లేరు."
                );
                return;
            }

            // Angular passenger form render అయ్యే వరకు వేచి ఉండాలి.
            const deadline = Date.now() + 15000;

            while (
                Date.now() < deadline &&
                !passengerFormReady()
            ) {
                await sleep(300);
            }

            if (!passengerFormReady()) {
                console.warn(
                    "[IRCTC Passenger] Passenger form 15 seconds‌లో load కాలేదు."
                );
                return;
            }

            // IMPORTANT:
            // handlePassengerPageAutofill private function‌ను నేరుగా
            // call చేయకూడదు. Public PageAwareAutofill API వాడాలి.
            const result =
                await PageAwareAutofill.handlePageAwareAutofill({
                    passengerDetails,
                    booking: pending.booking,
                    login: pending.login
                });

            console.log(
                "[IRCTC Passenger] Pending autofill result:",
                result
            );

            if (result?.success) {
                lastProcessedUrl = url;

                await chrome.runtime.sendMessage({
                    action: "CLEAR_PENDING_AUTOFILL"
                });

                console.log(
                    "[IRCTC Passenger] Passenger autofill successful. " +
                    "Pending data cleared."
                );
            } else {
                console.warn(
                    "[IRCTC Passenger] Autofill incomplete. " +
                    "Pending data retained for retry.",
                    result
                );
            }
        } catch (error) {
            console.error(
                "[IRCTC Passenger] Pending autofill failed:",
                error
            );
        } finally {
            processing = false;
        }
    }

    // IRCTCలో page navigation/Angular rendering ఆలస్యమైనా retry చేయాలి.
    setInterval(tryPendingPassengerAutofill, 1000);
})();
