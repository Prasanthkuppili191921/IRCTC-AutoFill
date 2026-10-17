
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

    // The URL determines the record mode.
    // ?id=... means Edit mode; otherwise this is a New Record.
    let editingRecordId = new URLSearchParams(
        window.location.search
    ).get("id");

    let recordMode = editingRecordId ? "edit" : "new";
    let isSaving = false;
    let isLoading = false;

    function showStatus(message, type = "") {
        if (!statusElement) return;

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

    // Journey Details iframe height.
    window.addEventListener("message", event => {
        if (event.origin !== window.location.origin) return;
        if (event.source !== bookingFrame.contentWindow) return;
        if (event.data?.type !== "IRCTC_BOOKING_HEIGHT") return;

        const height = Number(event.data.height);

        if (!Number.isFinite(height) || height <= 0) return;

        bookingFrame.style.height =
            `${Math.min(Math.ceil(height), 1200)}px`;
    });

    // Passenger Details iframe height.
    window.addEventListener("message", event => {
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
                    new Error(
                        `Unable to load ${frame.title || "a form"}.`
                    )
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
        // Do not initialize RecordStorage here.
        // Saving records uses chrome.storage.local only.

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

        if (recordMode === "edit" && editingRecordId) {
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

    // Populate all forms from a record.
    // IMPORTANT: This function does not change recordMode or editingRecordId.
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

        populateForms(record);
    }

    // Populate forms from either a saved local record or an imported JSON record.
    function populateForms(record) {
        const loginDoc = getFrameDocument(loginFrame);
        const bookingDoc = getFrameDocument(bookingFrame);

        const login = record.login || {};
        const booking = record.booking || record;

        loginDoc.getElementById("username").value =
            login.username || "";

        loginDoc.getElementById("password").value =
            login.password || "";

        const fromStationInput =
            bookingDoc.getElementById("fromStation");

        const toStationInput =
            bookingDoc.getElementById("toStation");

        fromStationInput.value =
            getStationCode(booking.fromStation);

        toStationInput.value =
            getStationCode(booking.toStation);

        const FrameEvent = bookingFrame.contentWindow.Event;

        fromStationInput.dispatchEvent(
            new FrameEvent("change", { bubbles: true })
        );

        toStationInput.dispatchEvent(
            new FrameEvent("change", { bubbles: true })
        );

        const dateInput =
            bookingDoc.getElementById("journeyDate");

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

        bookingDoc.getElementById(
            "railwayPassConcession"
        ).checked = Boolean(
            booking.railwayPassConcession
        );

        dateInput.dispatchEvent(
            new bookingFrame.contentWindow.Event(
                "input",
                { bubbles: true }
            )
        );

        const trainSelection =
            record.trainSelection || booking.trainSelection || {};

        populateTrainSelection(trainSelection);

        getPassengerDetailsForm().setData(
            record.passengerDetails || {}
        );
    }

    // Import JSON and load the selected record into the forms.
    // This does not insert records into local storage and does not change
    // New/Edit mode. The Save button decides the operation using recordMode.
    async function loadJsonRecords() {
        if (isLoading || isSaving) return;

        isLoading = true;

        if (loadButton) {
            loadButton.disabled = true;
            loadButton.textContent = "Loading...";
        }

        showStatus("");

        try {
            const importedRecords = await RecordStorage.readRecords();

            if (!importedRecords.length) {
                showStatus(
                    "JSON file contains no records.",
                    "error"
                );
                return;
            }

            const options = importedRecords.map((record, index) => {
                const label =
                    record.name ||
                    record.id ||
                    `Record ${index + 1}`;

                return `${index + 1}. ${label}`;
            });

            const answer = window.prompt(
                "Enter the record number to load:\n\n" +
                options.join("\n"),
                "1"
            );

            if (answer === null) {
                return;
            }

            const selectedIndex = Number(answer) - 1;

            if (
                !Number.isInteger(selectedIndex) ||
                selectedIndex < 0 ||
                selectedIndex >= importedRecords.length
            ) {
                throw new Error("Invalid record number.");
            }

            const selectedRecord = importedRecords[selectedIndex];

            if (
                !selectedRecord ||
                typeof selectedRecord.id !== "string"
            ) {
                throw new Error("Selected record has an invalid ID.");
            }

            // Only populate the form.
            // Do not set editingRecordId to the imported record's ID.
            // Do not change recordMode.
            populateForms(selectedRecord);

            showStatus(
                `Loaded: ${selectedRecord.name || selectedRecord.id}. ` +
                `Save mode: ${recordMode === "edit" ? "Edit" : "New Record"}.`,
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

    // Save or update according to recordMode only.
    async function saveAllDetails() {
        if (isSaving || isLoading) return;

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
                throw new Error("Enter the User Name and Password.");
            }

            const fromStation = getStationCode(
                bookingDoc.getElementById("fromStation").value
            );

            const toStation = getStationCode(
                bookingDoc.getElementById("toStation").value
            );

            const journeyDate =
                bookingDoc.getElementById("journeyDate").value.trim();

            if (!fromStation || !toStation) {
                throw new Error("Enter both From and To stations.");
            }

            if (
                fromStation.toUpperCase() ===
                toStation.toUpperCase()
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

            const trainSelection = readTrainSelection();
            const passengerDetails =
                getPassengerDetailsForm().getData();

            if (!passengerDetails) {
                throw new Error("Passenger Details are unavailable.");
            }

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
                throw new Error(
                    "Enter a Train Number or Train Name."
                );
            }

            if (
                trainSelection.matchingRule === "both" &&
                (
                    !trainSelection.trainNumber ||
                    !trainSelection.trainName
                )
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

            const result = await chrome.storage.local.get(
                RECORDS_STORAGE_KEY
            );

            const records = Array.isArray(
                result[RECORDS_STORAGE_KEY]
            )
                ? result[RECORDS_STORAGE_KEY]
                : [];

            const now = new Date().toISOString();

            const name =
                `${getStationCode(fromStation)} → ` +
                `${getStationCode(toStation)}`;

            const login = { username, password };

            if (recordMode === "edit") {
                if (!editingRecordId) {
                    throw new Error(
                        "Cannot update record: record ID is missing."
                    );
                }

                const index = records.findIndex(
                    record => record.id === editingRecordId
                );

                if (index === -1) {
                    throw new Error(
                        "Record to update was not found."
                    );
                }

                // Edit mode: update only the target record.
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
                // New mode: every save creates a separate record.
                records.push({
                    id: crypto.randomUUID(),
                    name,
                    login,
                    booking,
                    trainSelection,
                    passengerDetails,
                    createdAt: now,
                    updatedAt: now
                });
            }

            // All records are stored in Chrome local storage.
            await chrome.storage.local.set({
                [RECORDS_STORAGE_KEY]: records
            });

            showStatus(
                recordMode === "edit"
                    ? "Record updated successfully."
                    : "New record created successfully.",
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
