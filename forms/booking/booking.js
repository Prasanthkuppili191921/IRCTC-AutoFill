"use strict";

const RECORDS_STORAGE_KEY = "bookingRecords";

const form = document.getElementById("bookingForm");
const fromStationInput = document.getElementById("fromStation");
const toStationInput = document.getElementById("toStation");
const journeyDateInput = document.getElementById("journeyDate");
const openCalendarButton = document.getElementById("openCalendar");
const calendarPopup = document.getElementById("calendarPopup");
const calendarDays = document.getElementById("calendarDays");
const monthYearButton = document.getElementById("monthYearButton");
const previousMonthButton = document.getElementById("previousMonth");
const nextMonthButton = document.getElementById("nextMonth");
const clearCalendarDateButton = document.getElementById("clearCalendarDate");
const todayButton = document.getElementById("todayButton");

const travelClassInput = document.getElementById("travelClass");
const quotaInput = document.getElementById("quota");
const flexibleDateInput = document.getElementById("flexibleDate");
const disabilityInput = document.getElementById("personWithDisabilityConcession");
const railwayPassInput = document.getElementById("railwayPassConcession");
const saveButton = document.getElementById("saveButton");
const clearButton = document.getElementById("clearButton");
const statusMessage = document.getElementById("statusMessage");

const params = new URLSearchParams(window.location.search);
const editingRecordId = params.get("id");

let isSaving = false;
let displayedMonth = new Date();
displayedMonth = new Date(
    displayedMonth.getFullYear(),
    displayedMonth.getMonth(),
    1
);

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {
        once: true
    });
} else {
    initialize();
}



function initialize() {
    const isEmbedded =
        new URLSearchParams(window.location.search).get("embedded") === "1";

    // Embedded mode: buttons may not exist in booking.html.
    if (isEmbedded) {
        if (saveButton) {
            saveButton.hidden = true;
        }

        if (clearButton) {
            clearButton.hidden = true;
        }
    } else {
        if (form) {
            form.addEventListener("submit", handleSave);
        }

        if (clearButton) {
            clearButton.addEventListener("click", handleClear);
        }
    }

    // Date input events
    journeyDateInput.addEventListener("click", openCalendar);
    journeyDateInput.addEventListener("keydown", handleDateKeydown);
    journeyDateInput.addEventListener("input", handleDateTyping);
    journeyDateInput.addEventListener("blur", normalizeManualDateOnBlur);

    // Calendar controls
    openCalendarButton.addEventListener("click", openCalendar);
    previousMonthButton.addEventListener("click", () => changeMonth(-1));
    nextMonthButton.addEventListener("click", () => changeMonth(1));
    clearCalendarDateButton.addEventListener("click", clearCalendarDate);
    todayButton.addEventListener("click", selectToday);

    document.addEventListener("pointerdown", handleOutsideClick);
    document.addEventListener("keydown", handleDocumentKeydown);

    openCalendarButton.setAttribute("aria-expanded", "false");

    renderCalendar();

    if (editingRecordId) {
        loadRecordForEditing(editingRecordId);
    }
}



// --------------------------------------------------
// Custom calendar
// --------------------------------------------------


function openCalendar() {
    if (calendarPopup.hidden) {
        const typedDate = journeyDateInput.value.trim();

        if (isValidJourneyDate(typedDate)) {
            const [day, month, year] = typedDate.split("/");

            displayedMonth = new Date(
                Number(year),
                Number(month) - 1,
                1
            );
        }
    }

    calendarPopup.hidden = false;
    openCalendarButton.setAttribute("aria-expanded", "true");

    renderCalendar();

    // Parent dashboard ki calendar open ayindani teliyajeyali.
    if (window.parent !== window) {
        window.parent.postMessage(
            { type: "IRCTC_CALENDAR_OPEN" },
            window.location.origin
        );
    }
}

function closeCalendar() {
    calendarPopup.hidden = true;
    openCalendarButton.setAttribute("aria-expanded", "false");

    // Parent dashboard ki calendar close ayindani teliyajeyali.
    if (window.parent !== window) {
        window.parent.postMessage(
            { type: "IRCTC_CALENDAR_CLOSE" },
            window.location.origin
        );
    }
}


function handleDateKeydown(event) {
    if (event.key === "Enter" || event.key === "ArrowDown") {
        event.preventDefault();
        openCalendar();
    } else if (event.key === "Escape") {
        closeCalendar();
    }
}

function handleDocumentKeydown(event) {
    if (event.key === "Escape" && !calendarPopup.hidden) {
        closeCalendar();
    }
}

function handleOutsideClick(event) {
    if (
        !calendarPopup.hidden &&
        !calendarPopup.contains(event.target) &&
        !journeyDateInput.contains(event.target) &&
        !openCalendarButton.contains(event.target)
    ) {
        closeCalendar();
    }
}

function changeMonth(offset) {
    displayedMonth = new Date(
        displayedMonth.getFullYear(),
        displayedMonth.getMonth() + offset,
        1
    );

    renderCalendar();
}

function renderCalendar() {
    const year = displayedMonth.getFullYear();
    const month = displayedMonth.getMonth();

    monthYearButton.textContent = displayedMonth.toLocaleDateString(
        "en-US",
        {
            month: "long",
            year: "numeric"
        }
    );

    calendarDays.replaceChildren();

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPreviousMonth = new Date(year, month, 0).getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const selectedDate = parseDisplayDate(journeyDateInput.value.trim());

    for (let index = 0; index < 42; index++) {
        let day;
        let cellMonth = month;
        let cellYear = year;
        let outsideMonth = false;

        if (index < firstWeekday) {
            day = daysInPreviousMonth - firstWeekday + index + 1;
            cellMonth = month - 1;
            outsideMonth = true;
        } else if (index >= firstWeekday + daysInMonth) {
            day = index - firstWeekday - daysInMonth + 1;
            cellMonth = month + 1;
            outsideMonth = true;
        } else {
            day = index - firstWeekday + 1;
        }

        const cellDate = new Date(cellYear, cellMonth, day);
        const button = document.createElement("button");

        button.type = "button";
        button.className = "calendar-day";
        button.textContent = String(day);
        button.setAttribute(
            "aria-label",
            cellDate.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric"
            })
        );

        if (outsideMonth) {
            button.classList.add("outside-month");
        }

        if (sameDate(cellDate, today)) {
            button.classList.add("today");
            button.setAttribute("aria-current", "date");
        }

        if (selectedDate && sameDate(cellDate, selectedDate)) {
            button.classList.add("selected");
            button.setAttribute("aria-pressed", "true");
        }

        button.addEventListener("click", () => {
            selectDate(cellDate);
        });

        calendarDays.appendChild(button);
    }
}

function selectDate(date) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear());

    journeyDateInput.value =
        `${String(date.getDate()).padStart(2, "0")}/` +
        `${String(date.getMonth() + 1).padStart(2, "0")}/` +
        `${date.getFullYear()}`;


    displayedMonth = new Date(
        date.getFullYear(),
        date.getMonth(),
        1
    );

    clearMessage();
    closeCalendar();
    renderCalendar();
}

function selectToday() {
    selectDate(new Date());
}

function clearCalendarDate() {
    journeyDateInput.value = "";
    clearMessage();
    closeCalendar();
    renderCalendar();
    journeyDateInput.focus();
}

function handleDateTyping() {
    const value = journeyDateInput.value.trim();

    // Typing chestunnappudu input value ni modify cheyyakudadhu.
    // Valid date unte calendar month matrame update cheyyali.
    if (!isValidJourneyDate(value)) {
        return;
    }

    const dateKey = getDateKey(value);
    if (!dateKey) {
        return;
    }

    const [year, month] = dateKey.split("-").map(Number);

    displayedMonth = new Date(year, month - 1, 1);
    renderCalendar();
}


function normalizeManualDateOnBlur() {
    const input = journeyDateInput;
    const value = input.value.trim();

    let formatted = value;

    // 11102026 -> 11/10/2026
    if (/^\d{8}$/.test(value)) {
        formatted =
            `${value.slice(0, 2)}/` +
            `${value.slice(2, 4)}/` +
            `${value.slice(4, 8)}`;
    } else {
        // 1/10/2026 -> 01/10/2026
        const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);

        if (match) {
            formatted =
                `${match[1].padStart(2, "0")}/` +
                `${match[2].padStart(2, "0")}/` +
                match[3];
        }
    }

    if (!isValidJourneyDate(formatted)) {
        return;
    }

    input.value = formatted;

    const dateKey = getDateKey(formatted);
    const [year, month] = dateKey.split("-").map(Number);

    displayedMonth = new Date(year, month - 1, 1);

    // Calendar lo selected date update avutundi.
    renderCalendar();
}


// --------------------------------------------------
// Date helpers
// --------------------------------------------------

function parseDisplayDate(value) {
    if (!isValidJourneyDate(value)) {
        return null;
    }

    const [day, month, year] = value.split("/");

    return new Date(
        Number(year),
        Number(month) - 1,
        Number(day)
    );
}

function isValidJourneyDate(value) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);

    if (!match) {
        return false;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);

    const date = new Date(year, month - 1, day);

    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

function getDateKey(value) {
    const [day, month, year] = value.split("/");
    return `${year}-${month}-${day}`;
}

function sameDate(first, second) {
    return (
        first.getFullYear() === second.getFullYear() &&
        first.getMonth() === second.getMonth() &&
        first.getDate() === second.getDate()
    );
}

// --------------------------------------------------
// Messages
// --------------------------------------------------

function showMessage(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
}

function clearMessage() {
    statusMessage.textContent = "";
    statusMessage.className = "status-message";
}

// --------------------------------------------------
// Storage
// --------------------------------------------------

async function getRecords() {
    const result = await chrome.storage.local.get(RECORDS_STORAGE_KEY);

    return Array.isArray(result[RECORDS_STORAGE_KEY])
        ? result[RECORDS_STORAGE_KEY]
        : [];
}

function getStationCode(stationName) {
    const match = String(stationName || "").match(
        /-\s*([A-Z0-9]{2,5})\s*\(/i
    );

    return match
        ? match[1].toUpperCase()
        : String(stationName || "").trim().toUpperCase();
}

function getRecordName(booking) {
    const fromCode = getStationCode(booking.fromStation);
    const toCode = getStationCode(booking.toStation);

    return `${fromCode} → ${toCode}`;
}

function getBookingFromForm() {
    const journeyDate = journeyDateInput.value.trim();

    return {
        fromStation: fromStationInput.value.trim().toUpperCase(),
        toStation: toStationInput.value.trim().toUpperCase(),
        journeyDate,
        journeyDateKey: isValidJourneyDate(journeyDate)
            ? getDateKey(journeyDate)
            : "",
        travelClass: travelClassInput.value,
        quota: quotaInput.value,
        flexibleDate: flexibleDateInput.checked,
        personWithDisabilityConcession: disabilityInput.checked,
        railwayPassConcession: railwayPassInput.checked
    };
}

// --------------------------------------------------
// Edit
// --------------------------------------------------

async function loadRecordForEditing(recordId) {
    try {
        const records = await getRecords();
        const record = records.find(item => item.id === recordId);

        if (!record) {
            showMessage(
                "The requested journey record could not be found.",
                "error"
            );

            saveButton.disabled = true;
            return;
        }

        const booking =
            record.booking && typeof record.booking === "object"
                ? record.booking
                : record;

        fromStationInput.value = booking.fromStation || "";
        toStationInput.value = booking.toStation || "";
        journeyDateInput.value = normalizeSavedDate(booking.journeyDate);

        travelClassInput.value =
            booking.travelClass === undefined
                ? ""
                : booking.travelClass;

        quotaInput.value = booking.quota || "GN";
        flexibleDateInput.checked = Boolean(booking.flexibleDate);

        disabilityInput.checked =
            Boolean(booking.personWithDisabilityConcession);

        railwayPassInput.checked =
            Boolean(booking.railwayPassConcession);

        const selectedDate = parseDisplayDate(journeyDateInput.value);

        if (selectedDate) {
            displayedMonth = new Date(
                selectedDate.getFullYear(),
                selectedDate.getMonth(),
                1
            );
        }

        renderCalendar();

        saveButton.textContent = "Update Journey";
        document.title = "Edit Journey - IRCTC AutoFill";
    } catch (error) {
        console.error("Failed to load journey:", error);

        showMessage("Unable to load the saved journey.", "error");
        saveButton.disabled = true;
    }
}

function normalizeSavedDate(value) {
    if (typeof value !== "string") {
        return "";
    }

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        return isValidJourneyDate(value) ? value : "";
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split("-");
        const displayDate = `${day}/${month}/${year}`;

        return isValidJourneyDate(displayDate) ? displayDate : "";
    }

    return "";
}

// --------------------------------------------------
// Save / Update
// --------------------------------------------------

async function handleSave(event) {
    event.preventDefault();

    if (isSaving) {
        return;
    }

    clearMessage();

    const booking = getBookingFromForm();

    if (!booking.fromStation || !booking.toStation) {
        showMessage("Please enter both From and To stations.", "error");
        return;
    }

    if (booking.fromStation === booking.toStation) {
        showMessage("From and To stations must be different.", "error");
        return;
    }

    if (!isValidJourneyDate(booking.journeyDate)) {
        showMessage(
            "Enter a valid date in DD/MM/YYYY format.",
            "error"
        );

        journeyDateInput.focus();
        return;
    }

    booking.journeyDateKey = getDateKey(booking.journeyDate);

    isSaving = true;
    saveButton.disabled = true;

    try {
        const records = await getRecords();
        const now = new Date().toISOString();

        if (editingRecordId) {
            const index = records.findIndex(
                item => item.id === editingRecordId
            );

            if (index === -1) {
                showMessage("This record no longer exists.", "error");
                return;
            }

            const existingRecord = records[index];

            records[index] = {
                ...existingRecord,
                name: getRecordName(booking),
                booking,
                updatedAt: now
            };
        } else {
            records.push({
                id: crypto.randomUUID(),
                name: getRecordName(booking),
                booking,
                createdAt: now,
                updatedAt: now
            });
        }

        await chrome.storage.local.set({
            [RECORDS_STORAGE_KEY]: records
        });

        showMessage(
            editingRecordId
                ? "Journey updated successfully."
                : "Journey saved successfully.",
            "success"
        );

        saveButton.textContent = "Saved";

        window.setTimeout(() => window.close(), 700);
    } catch (error) {
        console.error("Failed to save journey:", error);

        showMessage(
            "Unable to save the journey. Please try again.",
            "error"
        );
    } finally {
        isSaving = false;
        saveButton.disabled = false;
    }
}

// --------------------------------------------------
// Clear form without deleting stored records
// --------------------------------------------------

function handleClear() {
    if (isSaving) {
        return;
    }

    form.reset();
    clearMessage();
    closeCalendar();

    displayedMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
    );

    renderCalendar();

    saveButton.textContent = editingRecordId
        ? "Update Journey"
        : "Save Journey";

    fromStationInput.focus();
}
