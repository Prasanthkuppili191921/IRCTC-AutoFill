
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
    // BOOKING PAGE HANDLER
    // --------------------------------------------------

    async function handleBookingPageAutofill(message) {
        const booking = message.booking || {};

        if (
            !booking.fromStation ||
            !booking.toStation ||
            !booking.journeyDate
        ) {
            return {
                success: false,
                pageType: "booking",
                message: "Journey details incompleteగా ఉన్నాయి."
            };
        }

        // Delegate to the existing booking flow.
        // Do not duplicate fillBookingDetails() here.
        return {
            success: false,
            pageType: "booking",
            action: "START_BACKGROUND_AUTOFILL",
            message:
                "Booking flow‌ను background dispatcher ద్వారా ప్రారంభించాలి."
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
        const booking = message.booking || {};

        const passenger =
            booking.passengers?.[0] ||
            booking.passenger ||
            message.passenger;

        if (!passenger) {
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
                message: "Existing passenger autofill method అందుబాటులో లేదు."
            };
        }

        const result = fillPassengerDetails(passenger);

        return {
            ...result,
            pageType: "passenger"
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
