"use strict";

// ======================================================
// PAGE-AWARE AUTOFILL
// File: content/content-3.js
// ======================================================

const PageAwareAutofill = (() => {

    function isVisible(element) {
        if (!element) return false;

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

                return /passenger.?name|psgn.?name/.test(
                    description
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

        const bookingSelectors = [
            "#origin input",
            "#destination input",
            "#jDate input",
            "#journeyClass",
            "#journeyQuota"
        ];

        const bookingFormVisible = bookingSelectors.every(
            selector => {
                const element =
                    document.querySelector(selector);

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
                message:
                    "Existing login autofill method అందుబాటులో లేదు."
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

        console.log(
            "[IRCTC PageAware] Saved Auto-Fill record:",
            {
                trainNumber,
                fromStation,
                toStation,
                journeyDate,
                travelClass,
                quota,
                flexibleDate
            }
        );

        if (!fromStation || !toStation || !journeyDate) {
            return {
                success: false,
                message:
                    "Auto-Fill formలో From Station, To Station లేదా Journey Date missing ఉంది.",
                pageType: "train-list"
            };
        }

        if (!trainNumber) {
            return {
                success: false,
                message:
                    "Auto-Fill formలో Train Number save కాలేదు.",
                pageType: "train-list"
            };
        }

        if (!travelClass) {
            return {
                success: false,
                message:
                    "Auto-Fill formలో Travel Class save కాలేదు.",
                pageType: "train-list"
            };
        }

        if (typeof checkSavedTrainOnPage !== "function") {
            return {
                success: false,
                message:
                    "Train selection function అందుబాటులో లేదు.",
                pageType: "train-list"
            };
        }

        try {
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
                message:
                    error?.message ||
                    "Train List Auto-Fill failed.",
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
                message: "Saved passenger details levu."
            };
        }

        if (typeof fillPassengerDetails !== "function") {
            return {
                success: false,
                pageType: "passenger",
                message: "Passenger autofill function andubatulo ledu."
            };
        }

        // Passenger details
        const result = await Promise.resolve(
            fillPassengerDetails({
                passengers,
                contactDetails
            })
        );

        // Latest payment mode — only one declaration
        const paymentMode =
            message?.paymentMode ||
            message?.booking?.paymentMode;

        let paymentModeResult = null;

        if (paymentMode) {
            try {
                const selected = await selectPaymentMode(paymentMode);

                paymentModeResult = {
                    success: selected,
                    message: selected
                        ? "Payment mode selected."
                        : "Payment mode select kaaledu."
                };
            } catch (error) {
                console.error(
                    "[IRCTC Payment] Selection failed:",
                    error
                );

                paymentModeResult = {
                    success: false,
                    message: error?.message ||
                        "Payment mode selection failed."
                };
            }
        }

        // Passenger AutoFill పూర్తయిన తర్వాత Continue క్లిక్ చేయాలి
        if (result?.success) {
            const continueClicked = await clickContinueButton();

            console.log(
                "[IRCTC Passenger] Continue result:",
                continueClicked
            );
        }

        return {
            ...result,
            pageType: "passenger",
            passengersAvailable: passengers.length,
            contactDetailsAvailable:
                Object.keys(contactDetails).length > 0,
            paymentModeResult
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

    return {
        detectIrctcPageContext,
        handlePageAwareAutofill
    };

})();

// ------------------------------------------------------
// MESSAGE HANDLER
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
                        message:
                            "Page-aware AutoFill విఫలమైంది."
                    });
                });

            return true;
        }
    }
);


// ======================================================
// AUTOMATIC PASSENGER AND PAYMENT MODE AUTOFILL
// ======================================================

(() => {
    let processing = false;
    let passengerProcessedKey = "";
    let paymentProcessedKey = "";
    let reviewProcessedKey = "";

    const sleep = ms =>
        new Promise(resolve => setTimeout(resolve, ms));

    function isPassengerPage() {
        return /psgninput|passenger-details/i.test(
            window.location.href
        );
    }

    function isPaymentPage() {
        const paymentRadio = document.querySelector(
            'input[name="paymentType"][value="2"], ' +
            'input[name="paymentType"][value="3"]'
        );

        if (
            paymentRadio &&
            paymentRadio.getClientRects().length > 0
        ) {
            return true;
        }

        return (
            /payment|bank|bhim|upi/i.test(
                window.location.href
            ) ||
            /payment mode|bhim\s*\/?\s*upi/i.test(
                document.body?.innerText || ""
            )
        );
    }

    function isReviewBookingPage() {
        return window.location.pathname.includes(
            "/nget/booking/reviewBooking"
        );
    }

    function passengerFormReady() {
        return Boolean(
            document.querySelector(
                'input[formcontrolname="passengerName"], ' +
                'input[name*="passengerName" i], ' +
                'input[placeholder*="name" i]'
            )
        );
    }

    // --------------------------------------------------
    // PAYMENT MODE SELECTION
    // --------------------------------------------------

    async function selectSavedPaymentMode(paymentModeData) {
        const mode =
            paymentModeData?.paymentMode || paymentModeData;

        const expectedValue =
            mode === "bhim-upi"
                ? "2"
                : mode === "other"
                    ? "3"
                    : null;

        if (!expectedValue) {
            console.warn(
                "[IRCTC Payment] Saved payment mode is missing or invalid.",
                paymentModeData
            );

            return {
                success: false,
                reason: "missing-payment-mode"
            };
        }

        const deadline = Date.now() + 5000;

        while (Date.now() < deadline) {
            const radio = document.querySelector(
                `input[name="paymentType"][value="${expectedValue}"]`
            );

            if (
                radio &&
                radio.getClientRects().length > 0
            ) {
                const container =
                    radio.closest("p-radiobutton");

                const isSelected = () =>
                    radio.checked ||
                    container
                        ?.querySelector('[role="radio"]')
                        ?.getAttribute("aria-checked") === "true";

                if (isSelected()) {
                    return { success: true };
                }

                const radioBox =
                    container?.querySelector(
                        ".ui-radiobutton-box"
                    );

                if (radioBox) {
                    radioBox.click();
                } else {
                    radio.click();
                }

                await sleep(300);

                if (isSelected()) {
                    console.log(
                        "[IRCTC Payment] Payment mode selected:",
                        expectedValue
                    );

                    return { success: true };
                }
            }

            await sleep(300);
        }

        return {
            success: false,
            reason: "option-not-confirmed"
        };
    }

    // --------------------------------------------------
    // PENDING AUTOFILL DATA
    // --------------------------------------------------

    async function getPendingData() {
        const response = await chrome.runtime.sendMessage({
            action: "GET_PENDING_AUTOFILL"
        });

        return (
            response?.success && response.pending
                ? response.pending
                : null
        );
    }

    // --------------------------------------------------
    // AUTOMATIC AUTOFILL
    // --------------------------------------------------

    async function tryPendingAutofill() {
        if (processing) return;

        const passengerPage = isPassengerPage();
        const paymentPage = isPaymentPage();
        const reviewPage = isReviewBookingPage();

        if (!passengerPage && !paymentPage && !reviewPage) {
            return;
        }

        const pageKey = window.location.href;

        processing = true;

        try {
            // ------------------------------------------
            // REVIEW BOOKING PAGE
            // ------------------------------------------
            if (reviewPage) {
                if (reviewProcessedKey !== pageKey) {
                    const continueClicked =
                        await clickContinueButton();

                    console.log(
                        "[IRCTC Review] Continue result:",
                        continueClicked
                    );

                    if (continueClicked) {
                        reviewProcessedKey = pageKey;
                    }
                }

                return;
            }

            // ------------------------------------------
            // EXISTING PASSENGER / PAYMENT AUTOFILL
            // ------------------------------------------
            const pending = await getPendingData();

            if (!pending) return;

            // ------------------------------------------
            // PASSENGER DETAILS
            // ------------------------------------------

            if (
                passengerPage &&
                passengerProcessedKey !== pageKey
            ) {
                const passengerDetails =
                    pending.passengerDetails ||
                    pending.booking?.passengerDetails ||
                    {};

                const passengers = Array.isArray(
                    passengerDetails.passengers
                )
                    ? passengerDetails.passengers
                    : Array.isArray(
                        pending.booking?.passengers
                    )
                        ? pending.booking.passengers
                        : pending.booking?.passenger
                            ? [pending.booking.passenger]
                            : [];

                if (passengers.length === 0) {
                    console.warn(
                        "[IRCTC Passenger] Saved passenger details are missing."
                    );

                    return;
                }

                const deadline = Date.now() + 15000;

                while (
                    Date.now() < deadline &&
                    !passengerFormReady()
                ) {
                    await sleep(300);
                }

                if (!passengerFormReady()) {
                    console.warn(
                        "[IRCTC Passenger] Passenger form did not load in time."
                    );

                    return;
                }

                const result =
                    await PageAwareAutofill.handlePageAwareAutofill({
                        passengerDetails,
                        booking: pending.booking,
                        login: pending.login
                    });

                console.log(
                    "[IRCTC Passenger] Autofill result:",
                    result
                );

                if (!result?.success) {
                    console.warn(
                        "[IRCTC Passenger] Autofill failed; pending data retained."
                    );

                    return;
                }

                passengerProcessedKey = pageKey;

                console.log(
                    "[IRCTC Passenger] Autofill successful; pending data retained."
                );
            }

            // ------------------------------------------
            // PAYMENT MODE
            // Same page or separate payment page
            // ------------------------------------------

            if (
                (passengerPage || paymentPage) &&
                paymentProcessedKey !== pageKey
            ) {
                const paymentMode =
                    pending.paymentMode ||
                    pending.booking?.paymentMode;

                const paymentResult =
                    await selectSavedPaymentMode(paymentMode);

                if (paymentResult.success) {
                    paymentProcessedKey = pageKey;

                    await chrome.runtime.sendMessage({
                        action: "CLEAR_PENDING_AUTOFILL"
                    });

                    console.log(
                        "[IRCTC Payment] Payment Mode selected; pending data cleared."
                    );
                } else {
                    console.warn(
                        "[IRCTC Payment] Payment Mode not selected yet; will retry.",
                        paymentResult.reason
                    );
                }
            }
        } catch (error) {
            console.error(
                "[IRCTC Autofill] Pending autofill failed:",
                error
            );
        } finally {
            processing = false;
        }
    }

    // Angular may render the payment options after
    // passenger fields. Retry without refilling passengers.
    setInterval(tryPendingAutofill, 1000);

})();

// ------------------------------------------------------
// EXISTING PAYMENT MODE FUNCTION
// ------------------------------------------------------


async function selectPaymentMode(paymentMode) {
    const mode =
        paymentMode?.paymentMode || paymentMode;

    const expectedValue =
        mode === "bhim-upi"
            ? "2"
            : mode === "other"
                ? "3"
                : null;

    if (!expectedValue) {
        console.warn(
            "[IRCTC Payment] Saved payment mode missing or invalid:",
            paymentMode
        );
        return false;
    }

    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
        const radio = document.querySelector(
            `input[name="paymentType"][value="${expectedValue}"]`
        );

        if (radio && radio.getClientRects().length > 0) {
            const container = radio.closest("p-radiobutton");

            const isSelected = () =>
                radio.checked ||
                container
                    ?.querySelector('[role="radio"]')
                    ?.getAttribute("aria-checked") === "true";

            if (isSelected()) {
                console.log(
                    "[IRCTC Payment] Already selected:",
                    expectedValue
                );
                return true;
            }

            const radioBox = container?.querySelector(
                ".ui-radiobutton-box"
            );

            if (radioBox) {
                radioBox.click();
            } else {
                radio.click();
            }

            await new Promise(resolve => setTimeout(resolve, 300));

            if (isSelected()) {
                console.log(
                    "[IRCTC Payment] Payment mode selected:",
                    expectedValue
                );
                return true;
            }
        }

        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.warn(
        "[IRCTC Payment] Payment option not found or not selected:",
        expectedValue
    );

    return false;
}

async function clickContinueButton() {
    const continueButton = document.querySelector(
        'button.train_Search[type="submit"]'
    );

    if (!continueButton) {
        console.warn("Continue button not found.");
        return false;
    }

    if (continueButton.disabled) {
        console.warn("Continue button is disabled.");
        return false;
    }

    continueButton.click();
    console.log("Continue button clicked.");
    return true;
}

async function handleReviewBookingPage() {
    const isReviewPage = window.location.pathname.includes(
        "/nget/booking/reviewBooking"
    );

    if (!isReviewPage) {
        return;
    }

    console.log(
        "[IRCTC Review] Review Booking page detected."
    );

    const continueClicked = await clickContinueButton();

    console.log(
        "[IRCTC Review] Continue result:",
        continueClicked
    );
}