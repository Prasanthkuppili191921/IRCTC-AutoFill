
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
            await checkSavedTrainOnPage(
                savedTrainNumber,
                booking.travelClass,
                booking.journeyDate
            );

        addResult("Saved Train Check", trainCheckResult);
    }
    else {
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



async function selectTrainJourneyDate(trainCard, journeyDate) {
    if (!trainCard || !journeyDate) {
        return {
            success: false,
            message: "Train record లేదా journey date లేదు."
        };
    }

    const value = String(journeyDate).trim();

    let day;
    let month;
    let year;

    // DD/MM/YYYY లేదా DD-MM-YYYY
    let match = value.match(
        /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/
    );

    if (match) {
        day = Number(match[1]);
        month = Number(match[2]);
        year = Number(match[3]);
    } else {
        // YYYY-MM-DD
        match = value.match(
            /^(\d{4})-(\d{1,2})-(\d{1,2})$/
        );

        if (match) {
            year = Number(match[1]);
            month = Number(match[2]);
            day = Number(match[3]);
        } else {
            const parsed = new Date(value);

            if (Number.isNaN(parsed.getTime())) {
                return {
                    success: false,
                    message:
                        `Journey date format గుర్తించబడలేదు: ${value}`
                };
            }

            day = parsed.getDate();
            month = parsed.getMonth() + 1;
            year = parsed.getFullYear();
        }
    }

    if (
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31
    ) {
        return {
            success: false,
            message: `Invalid journey date: ${value}`
        };
    }

    const monthNames = [
        "JAN", "FEB", "MAR", "APR",
        "MAY", "JUN", "JUL", "AUG",
        "SEP", "OCT", "NOV", "DEC"
    ];

    const targetMonth = monthNames[month - 1];

    const targetDateText =
        `${day} ${targetMonth}`;

    // Class selection తర్వాత date cards render అయ్యేవరకు వేచి ఉండాలి.
    let dateCards = [];

    for (let attempt = 0; attempt < 30; attempt++) {
        dateCards = Array.from(
            trainCard.querySelectorAll("div.pre-avl")
        ).filter(card => {
            const text = (
                card.querySelector("div > strong")
                    ?.textContent || ""
            )
                .replace(/\s+/g, " ")
                .trim()
                .toUpperCase();

            return /^\w{3},\s*\d{1,2}\s+\w{3}$/.test(text);
        });

        if (dateCards.length > 0) {
            break;
        }

        await sleep(200);
    }

    console.log(
        "[IRCTC AutoFill] Requested journey date:",
        {
            originalValue: value,
            targetDateText,
            year
        }
    );

    console.log(
        "[IRCTC AutoFill] Available date cards:",
        dateCards.map(card => ({
            date: (
                card.querySelector("div > strong")
                    ?.textContent || ""
            ).trim(),
            status: (
                card.querySelector(
                    ".WL, .AVAILABLE, .REGRET"
                )?.textContent || ""
            ).trim()
        }))
    );

    // ఉదా: "Wed, 14 Oct" తో saved date match చేయాలి.
    const targetCard = dateCards.find(card => {
        const text = (
            card.querySelector("div > strong")
                ?.textContent || ""
        )
            .replace(/\s+/g, " ")
            .trim()
            .toUpperCase();

        const dateMatch = text.match(
            /^\w{3},\s*(\d{1,2})\s+(\w{3})$/
        );

        if (!dateMatch) {
            return false;
        }

        return (
            Number(dateMatch[1]) === day &&
            dateMatch[2] === targetMonth
        );
    });

    if (!targetCard) {
        return {
            success: false,
            message:
                `${targetDateText} date card కనిపించలేదు. ` +
                "Consoleలో Available date cards log చూడండి."
        };
    }

    targetCard.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest"
    });

    await sleep(300);

    // Date card click
    targetCard.click();

    console.log(
        "[IRCTC AutoFill] Journey date card clicked:",
        targetCard.outerHTML
    );

    return {
        success: true,
        selectedDate: targetDateText,
        message:
            `Journey date card click చేయబడింది: ${targetDateText}`
    };
}





function clickTrainClass(trainCard, savedClass) {
    const value = String(savedClass || "")
        .trim()
        .toUpperCase();

    const match = value.match(
        /\b(1A|2A|3A|3E|CC|EC|EA|SL|2S|FC)\b/
    );

    if (!trainCard || !match) {
        return {
            success: false,
            message: `Train record లేదా valid class లేదు: ${value}`
        };
    }

    const classCode = match[1];

    const cards = Array.from(
        trainCard.querySelectorAll("div.pre-avl")
    );

    console.log(
        "[IRCTC AutoFill] Availability cards:",
        cards.map(card => ({
            text: card.querySelector("strong")?.textContent?.trim(),
            tabindex: card.getAttribute("tabindex"),
            className: card.className
        }))
    );

    const targetCard = cards.find(card => {
        const text = (
            card.querySelector("strong")?.textContent || ""
        ).replace(/\s+/g, " ").trim().toUpperCase();

        return text.includes(`(${classCode})`) ||
            text === classCode;
    });

    if (!targetCard) {
        return {
            success: false,
            message: `${classCode} availability card కనిపించలేదు.`
        };
    }

    targetCard.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest"
    });

    targetCard.click();

    console.log(
        "[IRCTC AutoFill] Availability card clicked:",
        targetCard.outerHTML
    );

    return {
        success: true,
        selectedClass: classCode,
        message: `${classCode} availability card click చేయబడింది.`
    };
}




// ======================================================
// CHECK SAVED TRAIN NUMBER IN SEARCH RESULTS
// ======================================================





async function checkSavedTrainOnPage(
    savedTrainNumber,
    savedClass,
    journeyDate,
    timeoutMs = 15000
) {
    const startTime = Date.now();

    const targetNumber = String(
        savedTrainNumber || ""
    ).trim();

    while (Date.now() - startTime < timeoutMs) {
        const trainHeadings = document.querySelectorAll(
            ".train-heading strong"
        );

        for (const heading of trainHeadings) {
            const text = (
                heading.innerText ||
                heading.textContent ||
                ""
            ).replace(/\s+/g, " ").trim();

            const match = text.match(/\((\d+)\)/);

            if (!match || match[1] !== targetNumber) {
                continue;
            }

            // 1. Saved train record గుర్తించాలి.
            const trainRecord = heading.closest(
                "app-train-avl-enq"
            );

            if (!trainRecord) {
                return {
                    success: false,
                    found: true,
                    trainNumber: targetNumber,
                    message: "Target train record కనిపించలేదు."
                };
            }

            trainRecord.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "nearest"
            });

            await sleep(500);

            // 2. Saved class select చేయాలి.
            const classResult = clickTrainClass(
                trainRecord,
                savedClass
            );

            if (!classResult.success) {
                return {
                    success: false,
                    found: true,
                    trainNumber: targetNumber,
                    message: classResult.message
                };
            }

            // Class UI update అయ్యేవరకు వేచి ఉండాలి.
            await sleep(1000);

            // 3. Saved journey date card select చేయాలి.
            const dateResult = await selectTrainJourneyDate(
                trainRecord,
                journeyDate
            );

            if (!dateResult.success) {
                return {
                    success: false,
                    found: true,
                    trainNumber: targetNumber,
                    selectedClass: classResult.selectedClass,
                    message: dateResult.message
                };
            }

            // Date click తర్వాత Angular UI update కోసం వేచి ఉండాలి.
            await sleep(1000);

            // 4. అదే train record లో Book Now button గుర్తించాలి.
            const bookButton = trainRecord.querySelector(
                "button.train_Search"
            );

            // Button state debug information.
            console.log(
                "[IRCTC AutoFill] Book Now state:",
                {
                    trainNumber: targetNumber,
                    selectedClass: classResult.selectedClass,
                    selectedDate: dateResult.selectedDate,
                    exists: !!bookButton,
                    disabled: bookButton?.disabled,
                    className: bookButton?.className,
                    text: bookButton?.innerText?.trim()
                }
            );

            if (!bookButton) {
                return {
                    success: false,
                    found: true,
                    trainNumber: targetNumber,
                    selectedClass: classResult.selectedClass,
                    selectedDate: dateResult.selectedDate,
                    message: "Book Now button కనిపించలేదు."
                };
            }

            // Disabled state ఉన్నప్పుడు click చేయకూడదు.
            if (
                bookButton.disabled ||
                bookButton.classList.contains("disable-book")
            ) {
                return {
                    success: false,
                    found: true,
                    trainNumber: targetNumber,
                    selectedClass: classResult.selectedClass,
                    selectedDate: dateResult.selectedDate,
                    message:
                        "Date card click అయింది, కానీ Book Now button disabledలో ఉంది."
                };
            }

            // 5. Book Now click చేయాలి.
            bookButton.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "nearest"
            });

            await sleep(300);

            // Click చేయడానికి ముందు state మళ్లీ తనిఖీ చేయాలి.
            if (
                !bookButton.isConnected ||
                bookButton.disabled ||
                bookButton.classList.contains("disable-book")
            ) {
                return {
                    success: false,
                    found: true,
                    trainNumber: targetNumber,
                    selectedClass: classResult.selectedClass,
                    selectedDate: dateResult.selectedDate,
                    message:
                        "Book Now button click చేసే ముందు disabled అయింది."
                };
            }

            bookButton.click();

            console.log(
                "[IRCTC AutoFill] Book Now clicked:",
                {
                    trainNumber: targetNumber,
                    selectedClass: classResult.selectedClass,
                    selectedDate: dateResult.selectedDate
                }
            );

            return {
                success: true,
                found: true,
                trainNumber: targetNumber,
                selectedClass: classResult.selectedClass,
                selectedDate: dateResult.selectedDate,
                message:
                    `Train ${targetNumber}, ` +
                    `${classResult.selectedClass}, ` +
                    `${dateResult.selectedDate} select అయ్యాయి. ` +
                    "Book Now click చేయబడింది."
            };
        }

        await sleep(300);
    }

    return {
        success: false,
        found: false,
        trainNumber: targetNumber,
        message:
            `Train ${targetNumber} train listలో కనిపించలేదు.`
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
