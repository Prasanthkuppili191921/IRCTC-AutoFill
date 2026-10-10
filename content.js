

"use strict";

// ఆటోఫిల్ నడుస్తున్నప్పుడు నిజమైన user interactions‌ను తాత్కాలికంగా నిరోధించాలి.
let bookingAutofillRunning = false;

const autofillBlockedEvents = [
    "pointerdown",
    "mousedown",
    "mouseup",
    "click",
    "touchstart",
    "touchend",
    "keydown",
    "keyup",
    "contextmenu"
];

function blockUserInteractionDuringAutofill(event) {
    if (!bookingAutofillRunning || !event.isTrusted) {
        return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
}

for (const eventName of autofillBlockedEvents) {
    document.addEventListener(
        eventName,
        blockUserInteractionDuringAutofill,
        {
            capture: true,
            passive: false
        }
    );
}


// ======================================================
// COMMON HELPERS
// ======================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeText(value) {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function setFieldValue(element, value) {
    if (!element) return false;

    const prototype =
        element instanceof HTMLInputElement
            ? HTMLInputElement.prototype
            : element instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : null;

    const setter = prototype
        ? Object.getOwnPropertyDescriptor(prototype, "value")?.set
        : null;

    if (setter) {
        setter.call(element, String(value ?? ""));
    } else {
        element.value = String(value ?? "");
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));

    return true;
}

function getFieldDescription(element) {
    const labels = Array.from(element.labels || [])
        .map(label => label.innerText)
        .join(" ");

    return [
        labels,
        element.name,
        element.id,
        element.placeholder,
        element.getAttribute("aria-label"),
        element.getAttribute("autocomplete")
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

// ======================================================
// LOGIN AUTOFILL
// ======================================================

function fillLoginDetails(username, password) {
    const usernameField = document.querySelector(
        'input[formcontrolname="userid"], ' +
        'input[placeholder="User Name"]'
    );

    const passwordField = document.querySelector(
        'input[formcontrolname="password"], ' +
        'input[placeholder="Password"], ' +
        'input[type="password"]'
    );

    if (!usernameField) {
        return {
            success: false,
            message: "Username field కనిపించలేదు."
        };
    }

    if (!passwordField) {
        return {
            success: false,
            message: "Password field కనిపించలేదు."
        };
    }

    setFieldValue(usernameField, username);
    setFieldValue(passwordField, password);

    return {
        success: true,
        usernameFilled: true,
        passwordFilled: true,
        message: "Login details నింపబడ్డాయి."
    };
}

// ======================================================
// PASSENGER DETAILS AUTOFILL
// ======================================================

function fillPassengerDetails(passenger) {
    if (!passenger) {
        return {
            success: false,
            message: "Passenger details ఇవ్వలేదు."
        };
    }

    const inputs = Array.from(
        document.querySelectorAll(
            'input:not([type="hidden"]):' +
            ':not([type="checkbox"]):' +
            ':not([type="radio"])'
        )
    );

    const nameField = inputs.find(element =>
        /passenger.?name|full.?name|psgn.?name/.test(
            getFieldDescription(element)
        )
    );

    const ageField = inputs.find(element =>
        /passenger.?age|psgn.?age/.test(
            getFieldDescription(element)
        )
    );

    if (nameField) {
        setFieldValue(nameField, passenger.name);
    }

    if (ageField) {
        setFieldValue(ageField, passenger.age);
    }

    const nameFilled = Boolean(nameField);
    const ageFilled = Boolean(ageField);

    return {
        success: nameFilled || ageFilled,
        nameFilled,
        ageFilled,
        message: nameFilled || ageFilled
            ? "Passenger details నింపబడ్డాయి."
            : "Passenger Name/Age fields కనిపించలేదు."
    };
}

// ======================================================
// STATION AUTOCOMPLETE
// ======================================================


async function fillStation(selector, stationName) {
    const input = document.querySelector(selector);

    if (!input) {
        return {
            success: false,
            message: `Station field కనిపించలేదు: ${selector}`
        };
    }

    const requested = String(stationName ?? "").trim();

    if (!requested) {
        return {
            success: false,
            message: "Station పేరు ఖాళీగా ఉంది."
        };
    }

    const normalize = value =>
        String(value ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

    const setValue = value => {
        const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
        )?.set;

        if (setter) {
            setter.call(input, value);
        } else {
            input.value = value;
        }

        input.dispatchEvent(
            new Event("input", { bubbles: true })
        );
    };

    const getVisibleOptions = () => {
        const listId = input.getAttribute("aria-controls");
        const lists = [];

        if (listId) {
            const list = document.getElementById(listId);
            if (list) lists.push(list);
        }

        const autocomplete = input.closest("p-autocomplete");

        if (autocomplete) {
            lists.push(autocomplete);
        }

        const options = [];

        for (const container of lists) {
            options.push(
                ...container.querySelectorAll(
                    '[role="option"], ' +
                    "li.ui-autocomplete-list-item, " +
                    ".ui-autocomplete-list-item"
                )
            );
        }

        return [...new Set(options)].filter(option => {
            const style = window.getComputedStyle(option);

            return style.display !== "none" &&
                style.visibility !== "hidden" &&
                option.getClientRects().length > 0;
        });
    };

    try {
        input.focus();
        input.click();

        // పాత station value తొలగించి, autocomplete‌ను మళ్లీ trigger చేయాలి.
        setValue("");
        await sleep(150);

        // IRCTCలో టైప్ చేసినట్టుగా ఒక్కో అక్షరం పంపాలి.
        for (const character of requested) {
            const nextValue = input.value + character;

            input.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: character,
                    bubbles: true
                })
            );

            setValue(nextValue);

            input.dispatchEvent(
                new KeyboardEvent("keyup", {
                    key: character,
                    bubbles: true
                })
            );

            await sleep(45);
        }

        // Suggestions load కావడానికి గరిష్ఠంగా 3 సెకన్లు వేచి ఉండాలి.
        let options = [];

        for (let attempt = 0; attempt < 30; attempt++) {
            await sleep(100);
            options = getVisibleOptions();

            if (options.length > 0) break;
        }

        if (!options.length) {
            return {
                success: false,
                message:
                    `"${requested}" కోసం IRCTC station suggestions రాలేదు.`
            };
        }

        const requestedText = normalize(requested);

        const exact = options.find(option =>
            normalize(option.innerText || option.textContent) ===
            requestedText
        );

        const startsWith = options.find(option =>
            normalize(option.innerText || option.textContent)
                .startsWith(requestedText)
        );

        const contains = options.find(option =>
            normalize(option.innerText || option.textContent)
                .includes(requestedText)
        );

        const target = exact || startsWith || contains;

        if (!target) {
            return {
                success: false,
                message:
                    `"${requested}"కు సరిపోయే station కనిపించలేదు. ` +
                    "Popupలో station పేరు/code తనిఖీ చేయండి."
            };
        }

        target.click();
        await sleep(350);

        // IRCTC ఎంపికను inputలో చూపించిందో తనిఖీ చేయాలి.
        const actual = normalize(input.value);
        const selectedText = normalize(
            target.innerText || target.textContent
        );

        const verified =
            actual === requestedText ||
            actual === selectedText ||
            selectedText.startsWith(actual) ||
            actual.startsWith(requestedText);

        if (!verified) {
            return {
                success: false,
                message:
                    `Station ఎంపిక నిర్ధారణ కాలేదు. ` +
                    `Inputలో ఉన్నది: ${input.value || "ఖాళీ"}`
            };
        }

        return {
            success: true,
            message:
                `${input.value} station ఎంపిక చేయబడింది.`
        };
    } catch (error) {
        console.error("IRCTC station autocomplete error:", error);

        return {
            success: false,
            message:
                `Station ఎంపికలో లోపం: ${String(error.message || error)}`
        };
    }
}


// ======================================================
// JOURNEY DATE
// IRCTC p-calendar: #jDate input
// Expected format: DD/MM/YYYY
// ======================================================


function convertDateToIRCTC(value) {
    const dateValue = String(value ?? "").trim();

    if (!dateValue) return "";

    let day;
    let month;
    let year;

    // Popup date: YYYY-MM-DD
    const isoMatch = dateValue.match(
        /^(\d{4})-(\d{2})-(\d{2})$/
    );

    // Display date: DD/MM/YYYY
    const displayMatch = dateValue.match(
        /^(\d{2})\/(\d{2})\/(\d{4})$/
    );

    if (isoMatch) {
        year = Number(isoMatch[1]);
        month = Number(isoMatch[2]);
        day = Number(isoMatch[3]);
    } else if (displayMatch) {
        day = Number(displayMatch[1]);
        month = Number(displayMatch[2]);
        year = Number(displayMatch[3]);
    } else {
        return "";
    }

    // Invalid dates, such as 31/02/2026, must be rejected.
    const parsed = new Date(year, month - 1, day);

    if (
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== day
    ) {
        return "";
    }

    return (
        String(day).padStart(2, "0") + "/" +
        String(month).padStart(2, "0") + "/" +
        String(year)
    );
}




async function fillJourneyDate(value) {
    const calendar = document.querySelector("#jDate");
    const input = calendar?.querySelector("input");

    if (!calendar || !input) {
        return {
            success: false,
            message: "Journey Date Calendar కనిపించలేదు."
        };
    }

    const date = convertDateToIRCTC(value);

    if (!date) {
        return {
            success: false,
            message: "తేదీ format తప్పుగా ఉంది."
        };
    }

    const [day, month, year] = date.split("/").map(Number);

    const targetDate = new Date(year, month - 1, day);

    if (
        targetDate.getFullYear() !== year ||
        targetDate.getMonth() !== month - 1 ||
        targetDate.getDate() !== day
    ) {
        return {
            success: false,
            message: "ఎంచుకున్న తేదీ చెల్లదు."
        };
    }

    input.click();
    input.focus();

    await sleep(250);

    const getPicker = () =>
        calendar.querySelector(".ui-datepicker");

    let picker = getPicker();

    if (!picker) {
        return {
            success: false,
            message: "Calendar popup తెరవబడలేదు."
        };
    }

    // Calendar headerలో చూపిస్తున్న నెల, సంవత్సరం చదవాలి.
    for (let attempt = 0; attempt < 24; attempt++) {
        picker = getPicker();

        if (!picker) {
            return {
                success: false,
                message: "Calendar popup మూసుకుపోయింది."
            };
        }

        const monthElement = picker.querySelector(
            ".ui-datepicker-month"
        );

        const yearElement = picker.querySelector(
            ".ui-datepicker-year"
        );

        if (!monthElement || !yearElement) {
            return {
                success: false,
                message: "Calendar నెల/సంవత్సరం కనిపించలేదు."
            };
        }

        const shownMonth = new Date(
            `${monthElement.textContent.trim()} 1, ` +
            yearElement.textContent.trim()
        );

        if (Number.isNaN(shownMonth.getTime())) {
            return {
                success: false,
                message: "Calendar నెలను గుర్తించలేకపోయాం."
            };
        }

        const difference =
            (year - shownMonth.getFullYear()) * 12 +
            (month - 1 - shownMonth.getMonth());

        if (difference === 0) {
            break;
        }

        const direction = difference > 0
            ? ".ui-datepicker-next"
            : ".ui-datepicker-prev";

        const navigationButton =
            picker.querySelector(direction);

        if (!navigationButton) {
            return {
                success: false,
                message: "Calendar నెలను మార్చలేకపోయాం."
            };
        }

        navigationButton.click();
        await sleep(150);
    }

    picker = getPicker();

    if (!picker) {
        return {
            success: false,
            message: "Calendar popup కనిపించలేదు."
        };
    }

    const dayCells = Array.from(
        picker.querySelectorAll(
            ".ui-datepicker-calendar td"
        )
    );

    const targetCell = dayCells.find(cell => {
        if (
            cell.classList.contains(
                "ui-datepicker-other-month"
            )
        ) {
            return false;
        }

        const link = cell.querySelector(
            "a.ui-state-default"
        );

        return link &&
            Number(link.textContent.trim()) === day &&
            !link.classList.contains("ui-state-disabled");
    });

    if (!targetCell) {
        return {
            success: false,
            message:
                `Calendarలో ${date} తేదీ ఎంపిక చేయలేకపోయాం.`
        };
    }

    targetCell.querySelector("a.ui-state-default").click();

    await sleep(300);

    const actualValue = input.value.trim();

    return {
        success: actualValue === date,
        message: actualValue === date
            ? `Journey Date ఎంపిక చేయబడింది: ${date}`
            : `తేదీ నిర్ధారణ విఫలమైంది. ప్రస్తుతం: ${
                actualValue || "ఖాళీ"
            }`
    };
}




// ======================================================
// IRCTC CLASS AND QUOTA DROPDOWNS
// ======================================================



async function selectIrctcDropdown(selector, requestedValue) {
    const dropdown = document.querySelector(selector);

    if (!dropdown) {
        return {
            success: false,
            message: `Dropdown కనిపించలేదు: ${selector}`
        };
    }

    const requested = String(requestedValue ?? "").trim();

    if (!requested) {
        return {
            success: true,
            message: "ఎంపిక ఇవ్వలేదు."
        };
    }

    const normalize = value =>
        String(value ?? "")
            .normalize("NFKC")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

    const aliases = {
        "1a": ["1a", "ac first class"],
        "2a": ["2a", "ac 2 tier", "ac two tier"],
        "3a": ["3a", "ac 3 tier", "ac three tier"],
        "3e": ["3e", "ac 3 economy"],
        "cc": ["cc", "ac chair car"],
        "ec": ["ec", "executive chair car"],
        "sl": ["sl", "sleeper"],
        "2s": ["2s", "second sitting"],
        "general": ["general", "gn"],
        "gn": ["general", "gn"],
        "tatkal": ["tatkal", "ck"],
        "ck": ["tatkal", "ck"],
        "premium tatkal": ["premium tatkal", "pt"],
        "pt": ["premium tatkal", "pt"],
        "ladies": ["ladies", "ld"],
        "ld": ["ladies", "ld"],
        "lower berth/sr. citizen": [
            "lower berth/sr. citizen",
            "lower berth",
            "sr. citizen"
        ],
        "person with disability": [
            "person with disability",
            "divyangjan"
        ],
        "duty pass": ["duty pass"],
        "parliament house": ["parliament house"],
        "all classes": ["all classes"]
    };

    function matchesOption(text) {
        const actual = normalize(text);
        const wanted = normalize(requested);

        if (actual === wanted) return true;

        const candidates = aliases[wanted] || [wanted];

        return candidates.some(alias => {
            const candidate = normalize(alias);

            return actual === candidate ||
                actual.includes(`(${candidate})`) ||
                actual.startsWith(`${candidate} `);
        });
    }

    const getLabel = () =>
        dropdown.querySelector(".ui-dropdown-label");

    const getCurrentValue = () => {
        const label = getLabel();

        const hiddenInput = dropdown.querySelector(
            'input[role="listbox"]'
        );

        return label?.textContent?.trim() ||
            hiddenInput?.getAttribute("aria-label") ||
            "";
    };

    if (matchesOption(getCurrentValue())) {
        return {
            success: true,
            message: `${getCurrentValue()} ఇప్పటికే ఎంపిక చేయబడింది.`
        };
    }

    const trigger = dropdown.querySelector(
        ".ui-dropdown-trigger"
    );

    if (!trigger) {
        return {
            success: false,
            message: `Dropdown trigger కనిపించలేదు: ${selector}`
        };
    }

    trigger.click();

    // Dropdown తెరుచుకునే వరకు వేచి ఉండాలి.
    let panel = null;

    for (let i = 0; i < 20; i++) {
        await sleep(100);

        const expanded =
            dropdown.querySelector(
                'input[role="listbox"]'
            )?.getAttribute("aria-expanded") === "true" ||
            trigger.getAttribute("aria-expanded") === "true";

        const visiblePanels = Array.from(
            document.querySelectorAll(".ui-dropdown-panel")
        ).filter(element => {
            const style = window.getComputedStyle(element);

            return style.display !== "none" &&
                style.visibility !== "hidden" &&
                element.getClientRects().length > 0;
        });

        if (visiblePanels.length) {
            panel = visiblePanels[visiblePanels.length - 1];
        }

        if (expanded && panel) break;

        if (panel) break;
    }

    if (!panel) {
        return {
            success: false,
            message:
                `${selector} dropdown తెరుచుకోలేదు. ` +
                "IRCTC పేజీని Refresh చేసి మళ్లీ ప్రయత్నించండి."
        };
    }

    const options = Array.from(
        panel.querySelectorAll(
            "li.ui-dropdown-item, .ui-dropdown-item, [role='option']"
        )
    ).filter(option => {
        const style = window.getComputedStyle(option);

        return style.display !== "none" &&
            style.visibility !== "hidden" &&
            option.getClientRects().length > 0 &&
            !option.classList.contains("ui-state-disabled") &&
            option.getAttribute("aria-disabled") !== "true";
    });

    const target = options.find(option =>
        matchesOption(option.innerText || option.textContent)
    );

    if (!target) {
        document.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Escape",
                bubbles: true
            })
        );

        return {
            success: false,
            message:
                `"${requested}" ఎంపిక ${selector} dropdownలో కనిపించలేదు. ` +
                `కనిపించినవి: ${
                    options.map(option =>
                        option.innerText.trim()
                    ).join(", ") || "ఏవీ లేవు"
                }`
        };
    }

    target.click();
    await sleep(400);

    const updatedValue = getCurrentValue();
    const verified = matchesOption(updatedValue);

    return {
        success: verified,
        message: verified
            ? `${updatedValue} ఎంపిక చేయబడింది.`
            : `${requested} ఎంపిక నిర్ధారణ కాలేదు. ప్రస్తుతం: ${
                updatedValue || "తెలియదు"
            }`
    };
}



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

    return {
        success: true,
        message:
            "Booking fields నింపబడ్డాయి. Search Trains క్లిక్ చేయబడింది.",
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

            bookingAutofillRunning = true;

            (async () => {
                try {
                    const result = await fillBookingDetails(
                        message.booking
                    );

                    sendResponse(result);
                } catch (error) {
                    console.error(
                        "IRCTC booking autofill error:",
                        error
                    );

                    sendResponse({
                        success: false,
                        message:
                            "Booking Autofillలో లోపం వచ్చింది. " +
                            "Consoleలో వివరాలను తనిఖీ చేయండి."
                    });
                } finally {
                    // విజయవంతమైనా, విఫలమైనా user interaction‌ను తిరిగి అనుమతించాలి.
                    bookingAutofillRunning = false;
                }
            })();

            return true;
        }

    }
);
