
"use strict";

const RECORDS_STORAGE_KEY = "bookingRecords";

document.addEventListener("DOMContentLoaded", initializeDashboard);


async function initializeDashboard() {
    const loginFrame = document.getElementById("loginFrame");
    const bookingFrame = document.getElementById("bookingFrame");
    const trainSelectionFrame =
        document.getElementById("trainSelectionFrame");

    const saveButton = document.getElementById("saveDetailsButton");
    const loadButton = document.getElementById("loadJsonButton");
    const statusElement = document.getElementById("dashboardStatus");

    let editingRecordId =
        new URLSearchParams(window.location.search).get("id");

    let isSaving = false;
    let isLoading = false;
    let previousBookingFrameHeight = "";

    function showStatus(message, type = "") {
        statusElement.textContent = "";
        statusElement.className = type;

        if (!message) {
            return;
        }

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


    // Calendar popup messages from Journey Details iframe.
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


    function getTrainSelectionFields() {
        const doc = getFrameDocument(trainSelectionFrame);

        const fields = {
            trainNumber: doc.getElementById("preferredTrainNumber"),
            trainName: doc.getElementById("preferredTrainName")
        };

        if (!fields.trainNumber || !fields.trainName) {
            throw new Error(
                "Train Selection fields were not found. " +
                "Check the IDs in train-selection.html."
            );
        }

        return fields;
    }


    function readTrainSelection() {
        const fields = getTrainSelectionFields();

        return {
            trainNumber: fields.trainNumber.value.trim(),
            trainName: fields.trainName.value.trim()
        };
    }


    function populateTrainSelection(value = {}) {
        const fields = getTrainSelectionFields();

        fields.trainNumber.value = value.trainNumber || "";
        fields.trainName.value = value.trainName || "";
    }


    try {
        await RecordStorage.initialize();

        await Promise.all([
            waitForFrame(loginFrame),
            waitForFrame(bookingFrame),
            waitForFrame(trainSelectionFrame)
        ]);

        const loginDoc = getFrameDocument(loginFrame);
        const bookingDoc = getFrameDocument(bookingFrame);

        // Validate Login form.
        if (
            !loginDoc.getElementById("username") ||
            !loginDoc.getElementById("password")
        ) {
            throw new Error("Login form fields were not found.");
        }

        // Validate Journey Details form.
        if (
            !bookingDoc.getElementById("fromStation") ||
            !bookingDoc.getElementById("toStation") ||
            !bookingDoc.getElementById("journeyDate")
        ) {
            throw new Error("Journey form fields were not found.");
        }

        // Validate Train Selection form.
        getTrainSelectionFields();

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

        // Restore Login fields.
        loginDoc.getElementById("username").value =
            login.username || "";

        loginDoc.getElementById("password").value =
            login.password || "";

        // Restore Journey Details.
        bookingDoc.getElementById("fromStation").value =
            booking.fromStation || "";

        bookingDoc.getElementById("toStation").value =
            booking.toStation || "";

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

        bookingDoc.getElementById("railwayPassConcession").checked =
            Boolean(booking.railwayPassConcession);

        dateInput.dispatchEvent(
            new Event("input", { bubbles: true })
        );

        // Restore Train Selection.
        const trainSelection =
            record.trainSelection ||
            booking.trainSelection ||
            {};

        populateTrainSelection(trainSelection);
    }


    async function loadJsonRecords() {
        if (isLoading || isSaving) {
            return;
        }

        isLoading = true;
        loadButton.disabled = true;
        loadButton.textContent = "Loading...";
        showStatus("");

        try {
            // Open JSON file picker and read the selected file.
            const records = await RecordStorage.readRecords();

            if (records.length === 0) {
                await chrome.storage.local.set({
                    [RECORDS_STORAGE_KEY]: []
                });

                showStatus("JSON file contains no records.", "success");
                return;
            }

            // Import JSON records into extension storage.
            await chrome.storage.local.set({
                [RECORDS_STORAGE_KEY]: records
            });

            // Let the user select a record to display.
            const options = records.map((record, index) => {
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

            // Use the same loader used for existing records.
            await loadExistingRecord(editingRecordId);

            showStatus(
                `Loaded: ${selectedRecord.name || selectedRecord.id}`,
                "success"
            );

        } catch (error) {
            if (error.name === "AbortError") {
                return;
            }

            console.error("Load JSON failed:", error);

            showStatus(
                error.message || "Unable to load JSON records.",
                "error"
            );

        } finally {
            isLoading = false;
            loadButton.disabled = false;
            loadButton.textContent = "Load";
        }
    }


    async function saveAllDetails() {
        if (isSaving || isLoading) {
            return;
        }

        isSaving = true;
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
        showStatus("");

        try {
            const loginDoc = getFrameDocument(loginFrame);
            const bookingDoc = getFrameDocument(bookingFrame);

            // Read Login fields.
            const username =
                loginDoc.getElementById("username").value.trim();

            const password =
                loginDoc.getElementById("password").value;

            if (!username || !password) {
                throw new Error(
                    "Enter the User Name and Password."
                );
            }

            // Read Journey Details fields.
            const fromStation =
                bookingDoc.getElementById("fromStation").value.trim();

            const toStation =
                bookingDoc.getElementById("toStation").value.trim();

            const journeyDate =
                bookingDoc.getElementById("journeyDate").value.trim();

            if (!fromStation || !toStation) {
                throw new Error(
                    "Enter both From and To stations."
                );
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

            // Read Train Selection fields.
            const trainSelection = readTrainSelection();

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

            // Preserve the existing Journey Details record structure.
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

            // Trigger the file picker before other awaited operations.
            // Handle cancellation without losing the existing local save.
            

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
            const wasEditing = Boolean(editingRecordId);

            let newRecordId = null;

            if (editingRecordId) {
                const index = records.findIndex(
                    item => item.id === editingRecordId
                );

                if (index === -1) {
                    throw new Error(
                        "Saved record no longer exists."
                    );
                }

                records[index] = {
                    ...records[index],
                    name,
                    login,
                    booking,
                    trainSelection,
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
                    createdAt: now,
                    updatedAt: now
                });
            }

            // Preserve the existing Chrome storage save.
            await chrome.storage.local.set({
                [RECORDS_STORAGE_KEY]: records
            });

            if (newRecordId) {
                editingRecordId = newRecordId;
            }


            showStatus(
                wasEditing
                    ? "Login, Journey and Train Selection details updated."
                    : "Login, Journey and Train Selection details saved.",
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
    if (typeof value !== "string") {
        return "";
    }

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

    if (!match) {
        return false;
    }

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
