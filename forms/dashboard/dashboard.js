
"use strict";

const RECORDS_STORAGE_KEY = "bookingRecords";

document.addEventListener("DOMContentLoaded", initializeDashboard);


async function initializeDashboard() {
    const loginFrame = document.getElementById("loginFrame");
    const bookingFrame = document.getElementById("bookingFrame");
    const saveButton = document.getElementById("saveDetailsButton");
    const statusElement = document.getElementById("dashboardStatus");

    const editingRecordId =
        new URLSearchParams(window.location.search).get("id");

    let isSaving = false;
    let previousBookingFrameHeight = "";

    function showStatus(message, type = "") {
        statusElement.textContent = message;
        statusElement.className = type;
    }

    // Calendar popup messages from booking iframe.
    window.addEventListener("message", function (event) {
        if (event.origin !== window.location.origin) {
            return;
        }

        if (event.source !== bookingFrame.contentWindow) {
            return;
        }

        if (event.data?.type === "IRCTC_CALENDAR_OPEN") {
            if (previousBookingFrameHeight === "") {
                previousBookingFrameHeight =
                    bookingFrame.style.height;
            }

            bookingFrame.style.height = "760px";
            bookingFrame.style.overflow = "visible";
        }

        if (event.data?.type === "IRCTC_CALENDAR_CLOSE") {
            bookingFrame.style.height =
                previousBookingFrameHeight;

            previousBookingFrameHeight = "";
        }
    });

    function waitForFrame(frame) {
        if (frame.contentDocument?.readyState === "complete") {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            frame.addEventListener("load", resolve, { once: true });

            frame.addEventListener(
                "error",
                () => reject(new Error("Unable to load a form.")),
                { once: true }
            );
        });
    }

    function getFrameDocument(frame) {
        const doc = frame.contentDocument;

        if (!doc) {
            throw new Error("Unable to access a form.");
        }

        return doc;
    }

    try {
        await Promise.all([
            waitForFrame(loginFrame),
            waitForFrame(bookingFrame)
        ]);

        const loginDoc = getFrameDocument(loginFrame);
        const bookingDoc = getFrameDocument(bookingFrame);

        if (
            !loginDoc.getElementById("username") ||
            !loginDoc.getElementById("password")
        ) {
            throw new Error("Login form fields were not found.");
        }

        if (
            !bookingDoc.getElementById("fromStation") ||
            !bookingDoc.getElementById("toStation") ||
            !bookingDoc.getElementById("journeyDate")
        ) {
            throw new Error("Journey form fields were not found.");
        }

        if (editingRecordId) {
            await loadExistingRecord(editingRecordId);
        }

        saveButton.addEventListener("click", saveAllDetails);

    } catch (error) {
        console.error("Dashboard initialization failed:", error);
        showStatus(error.message, "error");
        saveButton.disabled = true;
    }

    async function loadExistingRecord(recordId) {
        const result = await chrome.storage.local.get(
            RECORDS_STORAGE_KEY
        );

        const records = Array.isArray(result[RECORDS_STORAGE_KEY])
            ? result[RECORDS_STORAGE_KEY]
            : [];

        const record = records.find(item => item.id === recordId);

        if (!record) {
            throw new Error("Saved record was not found.");
        }

        const loginDoc = getFrameDocument(loginFrame);
        const bookingDoc = getFrameDocument(bookingFrame);

        const login = record.login || {};
        const booking = record.booking || record;

        loginDoc.getElementById("username").value =
            login.username || "";

        loginDoc.getElementById("password").value =
            login.password || "";

        bookingDoc.getElementById("fromStation").value =
            booking.fromStation || "";

        bookingDoc.getElementById("toStation").value =
            booking.toStation || "";

        const dateInput = bookingDoc.getElementById("journeyDate");
        dateInput.value = normalizeDate(booking.journeyDate);

        bookingDoc.getElementById("travelClass").value =
            booking.travelClass ?? "";

        bookingDoc.getElementById("quota").value =
            booking.quota || "GN";

        bookingDoc.getElementById("flexibleDate").checked =
            Boolean(booking.flexibleDate);

        bookingDoc.getElementById(
            "personWithDisabilityConcession"
        ).checked = Boolean(
            booking.personWithDisabilityConcession
        );

        bookingDoc.getElementById("railwayPassConcession").checked =
            Boolean(booking.railwayPassConcession);

        dateInput.dispatchEvent(
            new Event("input", { bubbles: true })
        );
    }

    async function saveAllDetails() {
        if (isSaving) {
            return;
        }

        isSaving = true;
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
        showStatus("");

        try {
            const loginDoc = getFrameDocument(loginFrame);
            const bookingDoc = getFrameDocument(bookingFrame);

            const username =
                loginDoc.getElementById("username").value.trim();

            const password =
                loginDoc.getElementById("password").value;

            if (!username || !password) {
                throw new Error(
                    "Enter the User Name and Password."
                );
            }

            const fromStation =
                bookingDoc.getElementById("fromStation").value.trim();

            const toStation =
                bookingDoc.getElementById("toStation").value.trim();

            const journeyDate =
                bookingDoc.getElementById("journeyDate").value.trim();

            if (!fromStation || !toStation) {
                throw new Error("Enter both From and To stations.");
            }

            if (
                fromStation.toUpperCase() === toStation.toUpperCase()
            ) {
                throw new Error(
                    "From and To stations must be different."
                );
            }

            if (!isValidDate(journeyDate)) {
                throw new Error(
                    "Enter a valid Journey Date in DD/MM/YYYY format."
                );
            }

            const booking = {
                fromStation: fromStation.toUpperCase(),
                toStation: toStation.toUpperCase(),
                journeyDate,
                journeyDateKey: getDateKey(journeyDate),
                travelClass:
                    bookingDoc.getElementById("travelClass").value,
                quota:
                    bookingDoc.getElementById("quota").value,
                flexibleDate:
                    bookingDoc.getElementById("flexibleDate").checked,
                personWithDisabilityConcession:
                    bookingDoc.getElementById(
                        "personWithDisabilityConcession"
                    ).checked,
                railwayPassConcession:
                    bookingDoc.getElementById(
                        "railwayPassConcession"
                    ).checked
            };

            const result = await chrome.storage.local.get(
                RECORDS_STORAGE_KEY
            );

            const records = Array.isArray(result[RECORDS_STORAGE_KEY])
                ? result[RECORDS_STORAGE_KEY]
                : [];

            const now = new Date().toISOString();

            const name =
                `${getStationCode(fromStation)} → ` +
                `${getStationCode(toStation)}`;

            const login = { username, password };

            if (editingRecordId) {
                const index = records.findIndex(
                    item => item.id === editingRecordId
                );

                if (index === -1) {
                    throw new Error("Saved record no longer exists.");
                }

                records[index] = {
                    ...records[index],
                    name,
                    login,
                    booking,
                    updatedAt: now
                };
            } else {
                records.push({
                    id: crypto.randomUUID(),
                    name,
                    login,
                    booking,
                    createdAt: now,
                    updatedAt: now
                });
            }

            await chrome.storage.local.set({
                [RECORDS_STORAGE_KEY]: records
            });

            showStatus(
                editingRecordId
                    ? "Login and Journey details updated."
                    : "Login and Journey details saved.",
                "success"
            );

            saveButton.textContent = "Saved";

            window.setTimeout(() => window.close(), 500);

        } catch (error) {
            console.error("Save Details failed:", error);
            showStatus(
                error.message || "Unable to save details.",
                "error"
            );
            saveButton.textContent = "Save Details";
        } finally {
            isSaving = false;
            saveButton.disabled = false;
        }
    }
}


function normalizeDate(value) {
    if (typeof value !== "string") return "";

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        return isValidDate(value) ? value : "";
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split("-");
        const formatted = `${day}/${month}/${year}`;
        return isValidDate(formatted) ? formatted : "";
    }

    return "";
}

function isValidDate(value) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (!match) return false;

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month - 1, day);

    return date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day;
}

function getDateKey(value) {
    const [day, month, year] = value.split("/");
    return `${year}-${month}-${day}`;
}

function getStationCode(stationName) {
    const match = String(stationName || "").match(
        /-\s*([A-Z0-9]{2,5})\s*\(/i
    );

    return match
        ? match[1].toUpperCase()
        : String(stationName || "").trim().toUpperCase();
}
