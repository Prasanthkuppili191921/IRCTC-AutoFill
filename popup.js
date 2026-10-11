"use strict";

const RECORDS_STORAGE_KEY = "bookingRecords";

document.addEventListener("DOMContentLoaded", initializePopup);

function initializePopup() {
    document
        .getElementById("fillNewForm")
        .addEventListener("click", openNewForm);

    renderSavedRecords();

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (
            areaName === "local" &&
            changes[RECORDS_STORAGE_KEY]
        ) {
            renderSavedRecords();
        }
    });
}

// Open the booking form in a new tab.
function openNewForm() {
    const url = chrome.runtime.getURL(
        "forms/dashboard/dashboard.html"
    );

    chrome.tabs.create({ url }, () => {
        if (chrome.runtime.lastError) {
            showStatus(
                chrome.runtime.lastError.message,
                "error"
            );
        }
    });
}

// Retrieve records from Chrome local storage.
async function getSavedRecords() {
    const result = await chrome.storage.local.get(
        RECORDS_STORAGE_KEY
    );

    const records = result[RECORDS_STORAGE_KEY];

    return Array.isArray(records) ? records : [];
}

// Render all saved records.
async function renderSavedRecords() {
    const recordsContainer = document.getElementById("records");
    const recordCount = document.getElementById("recordCount");

    if (!recordsContainer || !recordCount) {
        return;
    }

    try {
        const records = await getSavedRecords();

        recordsContainer.replaceChildren();

        recordCount.textContent =
            `${ records.length } ${ records.length === 1 ? "record" : "records" } `;

        if (records.length === 0) {
            recordsContainer.appendChild(createEmptyState());
            return;
        }

        records.forEach(record => {
            recordsContainer.appendChild(
                createRecordCard(record)
            );
        });
    } catch (error) {
        console.error("Failed to load saved records:", error);

        recordsContainer.replaceChildren();

        const errorMessage = document.createElement("p");
        errorMessage.textContent = "Unable to load saved records.";

        recordsContainer.appendChild(errorMessage);

        showStatus(
            "Could not read saved records. Please try again.",
            "error"
        );
    }
}

// Empty-state UI matching popup.html.
function createEmptyState() {
    const container = document.createElement("div");
    container.className = "empty-state";

    const icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "▤";

    const heading = document.createElement("h3");
    heading.textContent = "No saved records yet";

    const description = document.createElement("p");
    description.textContent =
        'Select “Fill New Form” to create your first record.';

    container.append(icon, heading, description);

    return container;
}

// Support both the new nested record and older flat records.
function getBookingDetails(record) {
    if (
        record &&
        record.booking &&
        typeof record.booking === "object"
    ) {
        return record.booking;
    }

    return record || {};
}

// Create an individual saved-record card.
function createRecordCard(record) {
    const booking = getBookingDetails(record);

    const card = document.createElement("article");
    card.className = "record-card";

    const route = document.createElement("p");
    route.className = "record-route";

    route.textContent =
        record.name ||
        `${ booking.fromStation || "?" } → ${ booking.toStation || "?" } `;

    const meta = document.createElement("div");
    meta.className = "record-meta";

    appendTag(
        meta,
        booking.journeyDate || "Date not set"
    );

    appendTag(
        meta,
        booking.travelClass || "Class not set"
    );

    appendTag(
        meta,
        booking.quota || "GN"
    );

    if (booking.flexibleDate) {
        appendTag(meta, "Flexible Date");
    }

    const actions = document.createElement("div");
    actions.className = "record-actions";

    const editButton = createActionButton(
        "Edit",
        "",
        () => editRecord(record.id)
    );

    const deleteButton = createActionButton(
        "Delete",
        "delete-button",
        () => deleteRecord(record.id)
    );

    const autoFillButton = createActionButton(
        "Auto-Fill",
        "autofill-button",
        () => autoFillRecord(record)
    );

    actions.append(
        editButton,
        deleteButton,
        autoFillButton
    );

    card.append(route, meta, actions);

    return card;
}

function appendTag(container, text) {
    const tag = document.createElement("span");

    tag.className = "record-tag";
    tag.textContent = text;

    container.appendChild(tag);
}

function createActionButton(label, className, handler) {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = label;

    if (className) {
        button.className = className;
    }

    button.addEventListener("click", handler);

    return button;
}

// Open the selected record in edit mode.

function editRecord(recordId) {
    if (!recordId) {
        showStatus("The selected record has no valid ID.", "error");
        return;
    }

    const url =
        chrome.runtime.getURL("forms/dashboard/dashboard.html") +
        "?id=" +
        encodeURIComponent(recordId);

    chrome.tabs.create({ url }, () => {
        if (chrome.runtime.lastError) {
            showStatus(
                chrome.runtime.lastError.message,
                "error"
            );
        }
    });
}


// Delete the selected record.
async function deleteRecord(recordId) {
    if (!recordId) {
        showStatus("Unable to identify this record.", "error");
        return;
    }

    const confirmed = window.confirm(
        "Are you sure you want to delete this saved journey?"
    );

    if (!confirmed) {
        return;
    }

    try {
        const records = await getSavedRecords();

        const updatedRecords = records.filter(
            record => record.id !== recordId
        );

        if (updatedRecords.length === records.length) {
            showStatus("The selected record was not found.", "error");
            return;
        }

        await chrome.storage.local.set({
            [RECORDS_STORAGE_KEY]: updatedRecords
        });

        await renderSavedRecords();

        showStatus("Journey deleted successfully.", "success");
    } catch (error) {
        console.error("Failed to delete record:", error);

        showStatus(
            "Unable to delete the record. Please try again.",
            "error"
        );
    }
}

// Send the selected journey to the background autofill flow.
async function autoFillRecord(record) {
    const booking = getBookingDetails(record);

    if (
        !booking.fromStation ||
        !booking.toStation ||
        !booking.journeyDate
    ) {
        showStatus(
            "Journey details are incomplete. Edit the record first.",
            "error"
        );
        return;
    }

    try {
        const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        const activeTab = tabs[0];

        if (
            !activeTab ||
            !activeTab.id ||
            !activeTab.url ||
            !activeTab.url.startsWith(
                "https://www.irctc.co.in/"
            )
        ) {
            showStatus(
                "Open the IRCTC website in the active tab first.",
                "error"
            );
            return;
        }

        // Send the request to the background script.
        chrome.runtime.sendMessage(
            {
                action: "START_BACKGROUND_AUTOFILL",
                booking
            },
            response => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "Auto-Fill error:",
                        chrome.runtime.lastError.message
                    );
                    return;
                }

                if (!response || !response.success) {
                    console.error(
                        "Auto-Fill could not start:",
                        response?.message || "Unknown error"
                    );
                }
            }
        );

        // Close the extension popup immediately.
        window.close();

    } catch (error) {
        console.error("Auto-Fill failed:", error);

        showStatus(
            "Auto-Fill failed. Please try again.",
            "error"
        );
    }
}

// Display a message using the existing #status element.
function showStatus(message, type = "") {
    const status = document.getElementById("status");

    if (!status) {
        return;
    }

    status.textContent = message;
    status.className = type;
}
