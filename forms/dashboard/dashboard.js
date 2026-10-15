
"use strict";

const RECORDS_STORAGE_KEY = "bookingRecords";

document.addEventListener("DOMContentLoaded", initializeDashboard);

async function initializeDashboard() {
    const loginFrame = document.getElementById("loginFrame");
    const bookingFrame = document.getElementById("bookingFrame");
    const trainSelectionFrame = document.getElementById("trainSelectionFrame");
    const passengerDetailsFrame = document.getElementById("passengerDetailsFrame");
    const saveButton = document.getElementById("saveDetailsButton");
    const loadButton = document.getElementById("loadJsonButton");
    const statusElement = document.getElementById("dashboardStatus");

    let editingRecordId = new URLSearchParams(window.location.search).get("id");
    let isSaving = false;
    let isLoading = false;
    let previousBookingFrameHeight = "";

    function showStatus(message, type = "") {
        statusElement.textContent = "";
        statusElement.className = type;

        if (!message) return;

        if (type === "error") {
            if (typeof IRCTCToast !== "undefined") {
                IRCTCToast.show(message, "error");
            } else {
                statusElement.textContent = message;
            }
            return;
        }

        statusElement.textContent = message;
    }

    // Journey Details calendar iframe messages.
    window.addEventListener("message", function (event) {
        if (event.origin !== window.location.origin) return;
        if (event.source !== bookingFrame.contentWindow) return;

        if (event.data?.type === "IRCTC_CALENDAR_OPEN") {
            if (previousBookingFrameHeight === "") {
                previousBookingFrameHeight = bookingFrame.style.height;
            }

            bookingFrame.style.height = "760px";
            bookingFrame.style.overflow = "visible";
        }

        if (event.data?.type === "IRCTC_CALENDAR_CLOSE") {
            bookingFrame.style.height = previousBookingFrameHeight;
            previousBookingFrameHeight = "";
        }
    });

    // Passenger Details iframe height.
    window.addEventListener("message", function (event) {
        if (event.origin !== window.location.origin) return;
        if (event.source !== passengerDetailsFrame.contentWindow) return;
        if (event.data?.type !== "PASSENGER_DETAILS_HEIGHT") return;

        const height = Number(event.data.height);

        if (!Number.isFinite(height) || height <= 0) return;

        passengerDetailsFrame.style.height = `${height}px`;
    });

    function waitForFrame(frame) {
        if (!frame) {
            return Promise.reject(
                new Error("A required Dashboard iframe was not found.")
            );
        }

        if (frame.contentDocument?.readyState === "complete") {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            frame.addEventListener("load", resolve, { once: true });

            frame.addEventListener(
                "error",
                () => reject(
                    new Error(`Unable to load ${frame.title || "a form"}.`)
                ),
                { once: true }
            );
        });
    }

    function getFrameDocument(frame) {
        const doc = frame?.contentDocument;

        if (!doc) {
            throw new Error("Unable to access a form.");
        }

        return doc;
    }


    function getTrainSelectionApi() {
        const api =
            trainSelectionFrame?.contentWindow?.IRCTCTrainSelection;

        if (
            !api ||
            typeof api.read !== "function" ||
            typeof api.populate !== "function"
        ) {
            throw new Error(
                "Train Selection integration is unavailable. " +
                "Check train-selection.js and train-autocomplete.js."
            );
        }

        return api;
    }

    function readTrainSelection() {
        return getTrainSelectionApi().read();
    }

    function populateTrainSelection(value = {}) {
        getTrainSelectionApi().populate(value);
    }


    function getPassengerDetailsForm() {
        const passengerForm =
            passengerDetailsFrame?.contentWindow?.PassengerDetailsForm;

        if (
            !passengerForm ||
            typeof passengerForm.getData !== "function" ||
            typeof passengerForm.setData !== "function"
        ) {
            throw new Error(
                "Passenger Details integration is unavailable. " +
                "Check passenger-details.js."
            );
        }

        return passengerForm;
    }

    try {
        await RecordStorage.initialize();

        await Promise.all([
            waitForFrame(loginFrame),
            waitForFrame(bookingFrame),
            waitForFrame(trainSelectionFrame),
            waitForFrame(passengerDetailsFrame)
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

        getTrainSelectionApi();

        const passengerDoc = getFrameDocument(passengerDetailsFrame);

        if (!passengerDoc.getElementById("passengerDetailsForm")) {
            throw new Error("Passenger Details form was not found.");
        }

        getPassengerDetailsForm();

        if (editingRecordId) {
            await loadExistingRecord(editingRecordId);
        }

        saveButton.addEventListener("click", saveAllDetails);

        if (loadButton) {
            loadButton.addEventListener("click", loadJsonRecords);
        }
    } catch (error) {
        console.error("Dashboard initialization failed:", error);
        showStatus(error.message, "error");

        saveButton.disabled = true;

        if (loadButton) {
            loadButton.disabled = true;
        }
    }

    // Restore a record into all forms.
    async function loadExistingRecord(recordId) {
        const result = await chrome.storage.local.get(RECORDS_STORAGE_KEY);

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
        ).checked = Boolean(booking.personWithDisabilityConcession);

        bookingDoc.getElementById(
            "railwayPassConcession"
        ).checked = Boolean(booking.railwayPassConcession);

        dateInput.dispatchEvent(
            new Event("input", { bubbles: true })
        );

        const trainSelection =
            record.trainSelection || booking.trainSelection || {};

        populateTrainSelection(trainSelection);

        // Backward compatibility: older records may not have passengerDetails.
        getPassengerDetailsForm().setData(record.passengerDetails || {});
    }

    // Import JSON records and optionally load one into the forms.
    async function loadJsonRecords() {
        if (isLoading || isSaving) return;

        isLoading = true;

        if (loadButton) {
            loadButton.disabled = true;
            loadButton.textContent = "Loading...";
        }

        showStatus("");

        try {
            const records = await RecordStorage.readRecords();

            if (records.length === 0) {
                await chrome.storage.local.set({
                    [RECORDS_STORAGE_KEY]: []
                });

                showStatus("JSON file contains no records.", "success");
                return;
            }

            await chrome.storage.local.set({
                [RECORDS_STORAGE_KEY]: records
            });

            const options = records.map((record, index) => {
                const label =
                    record.name || record.id || `Record ${index + 1}`;

                return `${index + 1}. ${label}`;
            });

            const answer = window.prompt(
                "Enter the record number to load:\n\n" +
                options.join("\n"),
                "1"
            );

            if (answer === null) {
                showStatus(
                    `${records.length} record(s) imported from JSON.`,
                    "success"
                );
                return;
            }

            const selectedIndex = Number(answer) - 1;

            if (
                !Number.isInteger(selectedIndex) ||
                selectedIndex < 0 ||
                selectedIndex >= records.length
            ) {
                throw new Error("Invalid record number.");
            }

            const selectedRecord = records[selectedIndex];

            if (
                !selectedRecord ||
                typeof selectedRecord.id !== "string"
            ) {
                throw new Error("Selected record has an invalid ID.");
            }

            editingRecordId = selectedRecord.id;

            await loadExistingRecord(editingRecordId);

            showStatus(
                `Loaded: ${selectedRecord.name || selectedRecord.id}`,
                "success"
            );
        } catch (error) {
            if (error.name === "AbortError") return;

            console.error("Load JSON failed:", error);

            showStatus(
                error.message || "Unable to load JSON records.",
                "error"
            );
        } finally {
            isLoading = false;

            if (loadButton) {
                loadButton.disabled = false;
                loadButton.textContent = "Load";
            }
        }
    }

    // Save or update all form details in Chrome storage and the JSON file.
    async function saveAllDetails() {
        if (isSaving || isLoading) return;

        isSaving = true;

        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
        showStatus("");

        try {
            /*
             * IMPORTANT:
             * Call prepareForWrite immediately in the click handler.
             * If no JSON file has been selected previously, this opens
             * the Save File picker while the user click is still active.
             */

            const loginDoc = getFrameDocument(loginFrame);
            const bookingDoc = getFrameDocument(bookingFrame);

            const username =
                loginDoc.getElementById("username").value.trim();

            const password =
                loginDoc.getElementById("password").value;

            if (!username || !password) {
                throw new Error("Enter the User Name and Password.");
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

            if (fromStation.toUpperCase() === toStation.toUpperCase()) {
                throw new Error("From and To stations must be different.");
            }

            if (!isValidDate(journeyDate)) {
                throw new Error(
                    "Enter a valid Journey Date in DD/MM/YYYY format."
                );
            }

            const trainSelection = readTrainSelection();
            const passengerDetails = getPassengerDetailsForm().getData();

            if (!passengerDetails) {
                return;
            }

            /*
             * Keep the current Train Selection validation compatible
             * with forms that provide matchingRule.
             */
            if (
                trainSelection.matchingRule === "number" &&
                !trainSelection.trainNumber
            ) {
                throw new Error(
                    "Enter a Train Number for the selected matching rule."
                );
            }

            if (
                trainSelection.matchingRule === "name" &&
                !trainSelection.trainName
            ) {
                throw new Error(
                    "Enter a Train Name for the selected matching rule."
                );
            }

            if (
                trainSelection.matchingRule === "both" &&
                !trainSelection.trainNumber &&
                !trainSelection.trainName
            ) {
                throw new Error("Enter a Train Number or Train Name.");
            }

            if (
                trainSelection.matchingRule === "both" &&
                (!trainSelection.trainNumber || !trainSelection.trainName)
            ) {
                throw new Error(
                    "For Train Number and Train Name matching, " +
                    "enter both values."
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
                    ).checked,

                trainSelection
            };

            const result =
                await chrome.storage.local.get(RECORDS_STORAGE_KEY);

            const records = Array.isArray(result[RECORDS_STORAGE_KEY])
                ? result[RECORDS_STORAGE_KEY]
                : [];

            const now = new Date().toISOString();

            const name =
                `${getStationCode(fromStation)} → ` +
                `${getStationCode(toStation)}`;

            const login = { username, password };
            const wasEditing = Boolean(editingRecordId);

            let newRecordId = null;

            if (editingRecordId) {
                const index = records.findIndex(
                    item => item.id === editingRecordId
                );

                if (index === -1) {
                    throw new Error("Saved record no longer exists.");
                }

                // Preserve all other existing record properties.
                records[index] = {
                    ...records[index],
                    name,
                    login,
                    booking,
                    trainSelection,
                    passengerDetails,
                    updatedAt: now
                };
            } else {
                newRecordId = crypto.randomUUID();

                records.push({
                    id: newRecordId,
                    name,
                    login,
                    booking,
                    trainSelection,
                    passengerDetails,
                    createdAt: now,
                    updatedAt: now
                });
            }

            // Update Chrome storage after the JSON write succeeds.
            await chrome.storage.local.set({
                [RECORDS_STORAGE_KEY]: records
            });

            if (newRecordId) {
                editingRecordId = newRecordId;
            }

            showStatus(
                wasEditing
                    ? "Details updated in JSON successfully."
                    : "Details saved to JSON successfully.",
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


// Normalize supported date formats.
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


// Validate DD/MM/YYYY.
function isValidDate(value) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);

    if (!match) return false;

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


// Convert DD/MM/YYYY to YYYY-MM-DD.
function getDateKey(value) {
    const [day, month, year] = value.split("/");

    return `${year}-${month}-${day}`;
}


// Extract station code from a station display value.

function getStationCode(stationName) {
    const value = String(stationName || "").trim();

    const match = value.match(
        /-\s*([A-Z0-9]{2,5})(?=\s*(?:\(|$))/i
    );

    return match
        ? match[1].toUpperCase()
        : value.toUpperCase();
}

