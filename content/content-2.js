
// ======================================================
// CHECKBOX HANDLING
// ======================================================

function setCheckbox(selector, checked) {
    const checkbox = document.querySelector(selector);

    if (!checkbox) {
        return {
            success: false,
            message: `Checkbox కనిపించలేదు: ${selector}`
        };
    }

    if (checkbox.disabled) {
        return {
            success: false,
            message: `Checkbox disabledలో ఉంది: ${selector}`
        };
    }

    const desiredValue = Boolean(checked);

    if (checkbox.checked !== desiredValue) {
        checkbox.click();
    }

    return {
        success: checkbox.checked === desiredValue,
        message: checkbox.checked === desiredValue
            ? "Checkbox అమరిక పూర్తయింది."
            : "Checkbox అమరిక విఫలమైంది."
    };
}

async function waitForBookingForm(timeoutMs = 20000) {
    const timeoutAt = Date.now() + timeoutMs;

    while (Date.now() < timeoutAt) {
        const from = document.querySelector("#origin input");
        const to = document.querySelector("#destination input");
        const date = document.querySelector("#jDate input");
        const travelClass = document.querySelector("#journeyClass");
        const quota = document.querySelector("#journeyQuota");

        if (
            from?.isConnected &&
            to?.isConnected &&
            date?.isConnected &&
            travelClass?.isConnected &&
            quota?.isConnected
        ) {
            console.log(
                "[IRCTC AutoFill] Booking form is ready."
            );
            return true;
        }

        await sleep(300);
    }

    console.error(
        "[IRCTC AutoFill] Booking form did not load within 20 seconds."
    );

    return false;
}

// ======================================================
// BOOKING AUTOFILL
// ======================================================


async function fillBookingDetails(booking) {
    if (!booking) {
        return {
            success: false,
            message: "Booking details ఇవ్వలేదు.",
            results: []
        };
    }

    const results = [];

    function addResult(field, result) {
        results.push({
            field,
            ...result
        });
    }

    function getFailureMessage() {
        return results
            .filter(result => !result.success)
            .map(result => `${result.field}: ${result.message}`)
            .join(" | ");
    }

    // 1. From Station
    const fromResult = await fillStation(
        "#origin input",
        booking.fromStation
    );

    addResult("From Station", fromResult);

    if (!fromResult.success) {
        return {
            success: false,
            message: getFailureMessage(),
            results
        };
    }

    await sleep(300);

    // 2. To Station
    const toResult = await fillStation(
        "#destination input",
        booking.toStation
    );

    addResult("To Station", toResult);

    if (!toResult.success) {
        return {
            success: false,
            message: getFailureMessage(),
            results
        };
    }

    await sleep(300);

    // 3. Journey Date
    const dateResult = await fillJourneyDate(
        booking.journeyDate
    );

    addResult("Journey Date", dateResult);

    if (!dateResult.success) {
        return {
            success: false,
            message: getFailureMessage(),
            results
        };
    }

    await sleep(300);

    // 4. Travel Class
    if (booking.travelClass) {
        const classResult = await selectIrctcDropdown(
            "#journeyClass",
            booking.travelClass
        );

        addResult("Travel Class", classResult);

        if (!classResult.success) {
            return {
                success: false,
                message: getFailureMessage(),
                results
            };
        }

        await sleep(300);
    }

    // 5. Quota
    if (booking.quota) {
        const quotaResult = await selectIrctcDropdown(
            "#journeyQuota",
            booking.quota
        );

        addResult("Quota", quotaResult);

        if (!quotaResult.success) {
            return {
                success: false,
                message: getFailureMessage(),
                results
            };
        }

        await sleep(300);
    }

    // 6. Flexible With Date
    if (booking.flexibleDate !== undefined) {
        const flexibleResult = setCheckbox(
            "#dateSpecific",
            booking.flexibleDate
        );

        addResult("Flexible With Date", flexibleResult);

        if (!flexibleResult.success) {
            return {
                success: false,
                message: getFailureMessage(),
                results
            };
        }

        await sleep(300);
    }

    // 7. Search Trains
    const searchResult = await clickSearchTrains();

    addResult("Search Trains", searchResult);

    if (!searchResult.success) {
        return {
            success: false,
            message: getFailureMessage(),
            results
        };
    }

    // Search results load కావడానికి కొంత సమయం ఇవ్వాలి.
    await sleep(1000);

    // 8. Saved Train Number‌ను గుర్తించి దాని దగ్గరకు scroll చేయాలి.
    const savedTrainNumber = String(
        booking.trainSelection?.trainNumber ||
        booking.trainNumber ||
        ""
    ).trim();

    if (savedTrainNumber) {
        const trainCheckResult =
            await checkSavedTrainOnPage(savedTrainNumber);

        addResult("Saved Train Check", trainCheckResult);
    } else {
        addResult("Saved Train Check", {
            success: false,
            message: "Saved Train Number కనిపించలేదు."
        });
    }

    const trainCheck = results.find(
        result => result.field === "Saved Train Check"
    );

    return {
        success: true,
        message: trainCheck?.success
            ? "Booking fields నింపబడ్డాయి. Saved train గుర్తించబడింది."
            : "Booking fields నింపబడ్డాయి. Saved train గుర్తించబడలేదు.",
        results
    };
}


async function clickSearchTrains() {
    await sleep(500);

    const searchButton = document.querySelector(
        "button.train_Search"
    );

    if (!searchButton) {
        return {
            success: false,
            message: "Search Trains button కనిపించలేదు."
        };
    }

    if (searchButton.disabled) {
        return {
            success: false,
            message: "Search Trains button ప్రస్తుతం disabledలో ఉంది."
        };
    }

    searchButton.click();

    return {
        success: true,
        message: "Search Trains బటన్ క్లిక్ చేయబడింది."
    };
}


// ======================================================
// CHECK SAVED TRAIN NUMBER IN SEARCH RESULTS
// ======================================================

async function checkSavedTrainOnPage(savedTrainNumber, timeoutMs = 15000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        const trainHeadings = document.querySelectorAll(".train-heading strong");

        for (const heading of trainHeadings) {
            const text = (heading.innerText || heading.textContent || "")
                .replace(/\s+/g, " ")
                .trim();

            const match = text.match(/\((\d+)\)/);

            if (match && match[1] === String(savedTrainNumber).trim()) {
                const trainCard =
                    heading.closest(".train-heading") ||
                    heading.closest(".form-group") ||
                    heading.parentElement?.parentElement;

                const target = trainCard || heading;

                target.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                    inline: "nearest"
                });

                return {
                    found: true,
                    trainNumber: savedTrainNumber
                };
            }
        }

        await new Promise(resolve => setTimeout(resolve, 300));
    }

    return {
        found: false,
        trainNumber: savedTrainNumber
    };
}


// ======================================================
// EXTENSION MESSAGE HANDLER
// ======================================================

chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
        if (!message || !message.action) {
            return;
        }

        if (message.action === "PING") {
            sendResponse({
                success: true,
                message: "IRCTC content script పనిచేస్తోంది."
            });

            return;
        }

        if (message.action === "FILL_LOGIN") {
            sendResponse(
                fillLoginDetails(
                    message.username,
                    message.password
                )
            );

            return;
        }

        if (message.action === "FILL_PASSENGER") {
            sendResponse(
                fillPassengerDetails(message.passenger)
            );

            return;
        }

        if (message.action === "FILL_BOOKING") {
            if (bookingAutofillRunning) {
                sendResponse({
                    success: false,
                    message: "Auto-Fill ఇప్పటికే నడుస్తోంది."
                });

                return;
            }

            (async () => {
                try {
                    // ముందుగా login status తనిఖీ చేయాలి.
                    const loginResult = await ensureIrctcLogin(
                        message.login
                    );

                    if (!loginResult.success) {
                        sendResponse(loginResult);
                        return;
                    }

                    // Login నిర్ధారణ అయిన తర్వాత మాత్రమే booking ప్రారంభించాలి.
                    bookingAutofillRunning = true;

                    const result = await fillBookingDetails(
                        message.booking
                    );

                    // Booking autofill విజయవంతమైతే pending details తొలగించాలి.
                    if (result?.success) {
                        try {
                            await chrome.runtime.sendMessage({
                                action: "CLEAR_PENDING_AUTOFILL"
                            });
                        } catch (error) {
                            console.warn(
                                "[IRCTC AutoFill] Pending details clear కాలేదు:",
                                error
                            );
                        }
                    }

                    sendResponse(result);
                } catch (error) {
                    console.error("IRCTC autofill error:", error);

                    sendResponse({
                        success: false,
                        message: "Login లేదా Booking Auto-Fillలో లోపం వచ్చింది."
                    });
                } finally {
                    bookingAutofillRunning = false;
                }
            })();

            return true;
        }
    }
);


// ======================================================
// RESUME BOOKING AUTOFILL AFTER LOGIN / PAGE RELOAD
// ======================================================

let pendingBookingResumeStarted = false;

async function resumePendingBookingAutofill() {
    if (pendingBookingResumeStarted) {
        return;
    }

    pendingBookingResumeStarted = true;

    try {
        const response = await chrome.runtime.sendMessage({
            action: "GET_PENDING_AUTOFILL"
        });

        if (!response?.success || !response.pending) {
            console.log(
                "[IRCTC AutoFill] Pending booking details లేవు."
            );
            return;
        }

        const pending = response.pending;

        if (!pending.booking) {
            console.warn(
                "[IRCTC AutoFill] Pending booking details ఖాళీగా ఉన్నాయి."
            );
            return;
        }

        console.log(
            "[IRCTC AutoFill] Pending booking details found."
        );

        // Login పూర్తయ్యే వరకు వేచి ఉండాలి.
        const loginTimeoutAt = Date.now() + 120000;

        while (Date.now() < loginTimeoutAt) {
            if (isIrctcLoggedIn()) {
                break;
            }

            await sleep(1000);
        }

        if (!isIrctcLoggedIn()) {
            console.warn(
                "[IRCTC AutoFill] Login confirmation timeout."
            );
            return;
        }

        console.log(
            "[IRCTC AutoFill] Login confirmed."
        );

        // Angular booking form పూర్తిగా load అయ్యే వరకు వేచి ఉండాలి.
        const formReady = await waitForBookingForm(20000);

        if (!formReady) {
            console.warn(
                "[IRCTC AutoFill] Booking form load కాలేదు. " +
                "Pending details అలాగే ఉంచబడ్డాయి."
            );
            return;
        }

        // మరో autofill process నడుస్తుంటే duplicate చేయకూడదు.
        if (bookingAutofillRunning) {
            console.warn(
                "[IRCTC AutoFill] మరో autofill process ఇప్పటికే నడుస్తోంది."
            );
            return;
        }

        bookingAutofillRunning = true;

        try {
            console.log(
                "[IRCTC AutoFill] Starting automatic booking autofill."
            );

            const result = await fillBookingDetails(
                pending.booking
            );

            console.log(
                "[IRCTC AutoFill] Resumed booking result:",
                result
            );

            if (result?.success) {
                await chrome.runtime.sendMessage({
                    action: "CLEAR_PENDING_AUTOFILL"
                });

                console.log(
                    "[IRCTC AutoFill] Pending booking cleared."
                );
            } else {
                console.error(
                    "[IRCTC AutoFill] Booking autofill failed:",
                    result?.message,
                    result?.results
                );
            }
        } finally {
            bookingAutofillRunning = false;
        }
    } catch (error) {
        console.error(
            "[IRCTC AutoFill] Resume error:",
            error
        );
    } finally {
        pendingBookingResumeStarted = false;
    }
}

// Content script load అయిన వెంటనే pending booking‌ను తనిఖీ చేయాలి.
resumePendingBookingAutofill();
