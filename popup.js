
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

// Open a new booking form in a new tab.
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

// Adjust the records list height without changing
// the record storage or action functionality.
function adjustPopupHeight() {
    const body = document.body;
    const records = document.getElementById("records");

    if (!body || !records) {
        return;
    }

    const maxPopupHeight = 580;

    // Reset the list to its natural height before measuring.
    records.style.maxHeight = "none";
    records.style.overflowY = "visible";

    requestAnimationFrame(() => {
        const totalContentHeight = body.scrollHeight;
        const naturalRecordsHeight = records.scrollHeight;

        if (totalContentHeight <= maxPopupHeight) {
            records.style.maxHeight = "none";
            records.style.overflowY = "visible";
            return;
        }

        // Reserve space for all content outside the list.
        const fixedContentHeight =
            totalContentHeight - naturalRecordsHeight;

        const availableRecordsHeight = Math.max(
            100,
            maxPopupHeight - fixedContentHeight
        );

        records.style.maxHeight =
            `${availableRecordsHeight}px`;

        records.style.overflowY = "auto";
    });
}

// Render all saved records.
async function renderSavedRecords() {
    const recordsContainer =
        document.getElementById("records");

    const recordCount =
        document.getElementById("recordCount");

    if (!recordsContainer || !recordCount) {
        return;
    }

    try {
        const records = await getSavedRecords();

        recordsContainer.replaceChildren();

        recordCount.textContent =
            `${records.length} ${records.length === 1 ? "record" : "records"
            }`;

        if (records.length === 0) {
            recordsContainer.appendChild(createEmptyState());
            adjustPopupHeight();
            return;
        }

        records.forEach(record => {
            recordsContainer.appendChild(
                createRecordCard(record)
            );
        });

        adjustPopupHeight();
    } catch (error) {
        console.error(
            "Failed to load saved records:",
            error
        );

        recordsContainer.replaceChildren();

        const errorMessage = document.createElement("p");
        errorMessage.textContent =
            "Unable to load saved records.";

        recordsContainer.appendChild(errorMessage);

        showStatus(
            "Could not read saved records. Please try again.",
            "error"
        );
    }
}

// Empty-state UI.
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

// Support nested records and older flat records.
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

    // Card header: route/title and Edit/Delete icons.
    const header = document.createElement("div");
    header.className = "record-card-header";

    const route = document.createElement("p");
    route.className = "record-route";
    route.textContent =
        record.name ||
        `${booking.fromStation || "?"} → ${booking.toStation || "?"
        }`;

    const iconActions = document.createElement("div");
    iconActions.className = "record-icon-actions";

    const editButton = createIconActionButton({
        label: "Edit",
        className: "edit-icon-button",
        icon: "✎",
        handler: () => editRecord(record.id)
    });

    const deleteButton = createIconActionButton({
        label: "Delete",
        className: "delete-icon-button",
        icon: "×",
        handler: () => deleteRecord(record.id)
    });

    iconActions.append(editButton, deleteButton);
    header.append(route, iconActions);

    // Journey metadata.
    const meta = document.createElement("div");
    meta.className = "record-meta";

    appendTag(meta, booking.journeyDate || "Date not set");
    appendTag(meta, booking.travelClass || "Class not set");
    appendTag(meta, booking.quota || "GN");

    if (booking.flexibleDate) {
        appendTag(meta, "Flexible Date");
    }

    // Full-width Auto-Fill button below the metadata.
    const actions = document.createElement("div");
    actions.className = "record-actions";

    const autoFillButton = createActionButton(
        "Auto-Fill",
        "autofill-button",
        () => autoFillRecord(record)
    );

    actions.appendChild(autoFillButton);

    card.append(header, meta, actions);

    return card;
}

// Create an icon-only Edit/Delete button.
function createIconActionButton({
    label,
    className,
    icon,
    handler
}) {
    const button = document.createElement("button");

    button.type = "button";
    button.className =
        `record-icon-button ${className}`;

    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);

    const iconElement = document.createElement("span");
    iconElement.setAttribute("aria-hidden", "true");
    iconElement.textContent = icon;

    button.appendChild(iconElement);
    button.addEventListener("click", handler);

    return button;
}

// Create a regular text button.
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

function appendTag(container, text) {
    const tag = document.createElement("span");

    tag.className = "record-tag";
    tag.textContent = text;

    container.appendChild(tag);
}

// Open the selected record in edit mode.
function editRecord(recordId) {
    if (!recordId) {
        showStatus(
            "The selected record has no valid ID.",
            "error"
        );
        return;
    }

    const url =
        chrome.runtime.getURL(
            "forms/dashboard/dashboard.html"
        ) +
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

// Delete the selected record from chrome.storage.local.
async function deleteRecord(recordId) {
    if (!recordId) {
        showStatus(
            "Unable to identify this record.",
            "error"
        );
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
            showStatus(
                "The selected record was not found.",
                "error"
            );
            return;
        }

        await chrome.storage.local.set({
            [RECORDS_STORAGE_KEY]: updatedRecords
        });

        await renderSavedRecords();

        showStatus(
            "Journey deleted successfully.",
            "success"
        );
    } catch (error) {
        console.error(
            "Failed to delete record:",
            error
        );

        showStatus(
            "Unable to delete the record. Please try again.",
            "error"
        );
    }
}

// Send the selected journey to the background autofill flow.
async function autoFillRecord(record) {
    const booking = getBookingDetails(record);

    const passengerDetails =
        record?.passengerDetails ||
        booking?.passengerDetails ||
        {};

    try {
        const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        const activeTab = tabs[0];

        if (
            !activeTab?.id ||
            !activeTab.url?.startsWith(
                "https://www.irctc.co.in/"
            )
        ) {
            showStatus(
                "Open the IRCTC website in the active tab first.",
                "error"
            );
            return;
        }

        chrome.runtime.sendMessage(
            {
                action: "START_BACKGROUND_AUTOFILL",
                login: record?.login || {},
                booking,
                passengerDetails
            },
            response => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "[IRCTC AutoFill] Error:",
                        chrome.runtime.lastError.message
                    );
                    return;
                }

                if (!response?.success) {
                    console.error(
                        "[IRCTC AutoFill] Failed:",
                        response?.message || "Unknown error"
                    );
                } else {
                    console.log(
                        "[IRCTC AutoFill] Result:",
                        response
                    );
                }
            }
        );

        window.close();
    } catch (error) {
        console.error(
            "[IRCTC AutoFill] Failed to start:",
            error
        );

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
