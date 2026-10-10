
"use strict";

const RECORDS_STORAGE_KEY = "bookingRecords";

window.addEventListener("DOMContentLoaded", initializePopup);

async function initializePopup() {
    const fillNewFormButton = document.getElementById("fillNewForm");
    const recordsContainer = document.getElementById("records");
    const recordCount = document.getElementById("recordCount");
    const status = document.getElementById("status");

    function showStatus(message, type = "") {
        status.textContent = message;
        status.className = type;
    }

    function clearStatus() {
        showStatus("");
    }

    function getRecordBooking(record) {
        // New records may keep journey details inside "booking".
        // Also support flat records for compatibility.
        return record?.booking &&
            typeof record.booking === "object"
            ? record.booking
            : record || {};
    }

    function getRecordId(record) {
        return record?.id === undefined ||
            record?.id === null
            ? ""
            : String(record.id);
    }

    function getRecordTitle(record) {
        const booking = getRecordBooking(record);

        const from = String(booking.fromStation || "").trim();
        const to = String(booking.toStation || "").trim();

        if (from && to) {
            return `${from} → ${to}`;
        }

        return String(record?.name || "Untitled Record");
    }

    function getRecordDate(record) {
        const booking = getRecordBooking(record);
        const value = String(booking.journeyDate || "").trim();

        // Existing display format: DD/MM/YYYY.
        const displayMatch = value.match(
            /^(\d{2})\/(\d{2})\/(\d{4})$/
        );

        if (displayMatch) {
            return value;
        }

        // Support ISO format: YYYY-MM-DD.
        const isoMatch = value.match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        );

        if (isoMatch) {
            return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
        }

        return value;
    }

    function createTag(text) {
        const tag = document.createElement("span");
        tag.className = "record-tag";
        tag.textContent = text;
        return tag;
    }

    function createActionButton(label, action, className = "") {
        const button = document.createElement("button");

        button.type = "button";
        button.textContent = label;
        button.dataset.action = action;

        if (className) {
            button.className = className;
        }

        return button;
    }

    function renderRecords(records) {
        recordsContainer.replaceChildren();

        recordCount.textContent =
            `${records.length} ${records.length === 1 ? "record" : "records"}`;

        if (records.length === 0) {
            const emptyState = document.createElement("div");
            emptyState.className = "empty-state";

            const icon = document.createElement("div");
            icon.className = "empty-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.textContent = "▤";

            const heading = document.createElement("h3");
            heading.textContent = "No saved records yet";

            const description = document.createElement("p");
            description.textContent =
                "Select “Fill New Form” to create your first record.";

            emptyState.append(icon, heading, description);
            recordsContainer.appendChild(emptyState);
            return;
        }

        for (const record of records) {
            const recordId = getRecordId(record);

            // Records must have an ID for Edit/Delete/Auto-Fill.
            if (!recordId) {
                console.warn("Skipping record without an ID:", record);
                continue;
            }

            const booking = getRecordBooking(record);

            const card = document.createElement("article");
            card.className = "record-card";
            card.dataset.recordId = recordId;

            const title = document.createElement("h3");
            title.className = "record-route";
            title.textContent = getRecordTitle(record);

            const metadata = document.createElement("div");
            metadata.className = "record-meta";

            const journeyDate = getRecordDate(record);
            const travelClass = String(
                booking.travelClass || ""
            ).trim();
            const quota = String(booking.quota || "").trim();

            if (journeyDate) {
                metadata.appendChild(createTag(journeyDate));
            }

            if (travelClass) {
                metadata.appendChild(createTag(travelClass));
            }

            if (quota) {
                metadata.appendChild(createTag(quota));
            }

            const actions = document.createElement("div");
            actions.className = "record-actions";

            actions.append(
                createActionButton("Edit", "edit"),
                createActionButton(
                    "Delete",
                    "delete",
                    "delete-button"
                ),
                createActionButton(
                    "Auto-Fill",
                    "autofill",
                    "autofill-button"
                )
            );

            card.append(title, metadata, actions);
            recordsContainer.appendChild(card);
        }

        // If all records were skipped, show an informative message.
        if (!recordsContainer.children.length) {
            const message = document.createElement("div");
            message.className = "empty-state";

            const heading = document.createElement("h3");
            heading.textContent = "Records need an ID";

            const description = document.createElement("p");
            description.textContent =
                "Saved records need a unique ID before they can be managed.";

            message.append(heading, description);
            recordsContainer.appendChild(message);
        }
    }

    async function loadRecords() {
        try {
            const saved = await chrome.storage.local.get(
                RECORDS_STORAGE_KEY
            );

            const records = saved[RECORDS_STORAGE_KEY];

            renderRecords(
                Array.isArray(records) ? records : []
            );
        } catch (error) {
            console.error("Failed to load saved records:", error);
            showStatus("Saved records could not be loaded.", "error");
        }
    }

    // Open the future full-page form in a new browser tab.
    fillNewFormButton.addEventListener("click", async function () {
        clearStatus();

        try {
            await chrome.tabs.create({
                url: chrome.runtime.getURL("form.html")
            });
        } catch (error) {
            console.error("Could not open the form:", error);
            showStatus("Could not open the new form.", "error");
        }
    });

    // Handle Edit, Delete and Auto-Fill from each saved record.
    recordsContainer.addEventListener("click", async function (event) {
        const button = event.target.closest("button[data-action]");

        if (!button) {
            return;
        }

        const card = button.closest("[data-record-id]");

        if (!card) {
            return;
        }

        const recordId = card.dataset.recordId;
        const action = button.dataset.action;

        clearStatus();
        button.disabled = true;

        try {
            const saved = await chrome.storage.local.get(
                RECORDS_STORAGE_KEY
            );

            const records = Array.isArray(
                saved[RECORDS_STORAGE_KEY]
            )
                ? saved[RECORDS_STORAGE_KEY]
                : [];

            const record = records.find(
                item => getRecordId(item) === recordId
            );

            if (!record) {
                showStatus(
                    "Record not found. Refreshing the list.",
                    "error"
                );

                await loadRecords();
                return;
            }

            if (action === "edit") {
                const editUrl = new URL(
                    chrome.runtime.getURL("form.html")
                );

                editUrl.searchParams.set("id", recordId);

                await chrome.tabs.create({
                    url: editUrl.toString()
                });

                return;
            }

            if (action === "delete") {
                const confirmed = window.confirm(
                    `Delete "${getRecordTitle(record)}"?`
                );

                if (!confirmed) {
                    return;
                }

                const updatedRecords = records.filter(
                    item => getRecordId(item) !== recordId
                );

                await chrome.storage.local.set({
                    [RECORDS_STORAGE_KEY]: updatedRecords
                });

                showStatus("Record deleted.", "success");
                await loadRecords();
                return;
            }

            if (action === "autofill") {
                const booking = getRecordBooking(record);

                if (
                    !String(booking.fromStation || "").trim() ||
                    !String(booking.toStation || "").trim() ||
                    !String(booking.journeyDate || "").trim()
                ) {
                    showStatus(
                        "This record needs From, To and Journey Date.",
                        "error"
                    );
                    return;
                }

                // Send the selected record's journey details
                // to the existing background autofill pipeline.
                const response = await chrome.runtime.sendMessage({
                    action: "START_BACKGROUND_AUTOFILL",
                    booking
                });

                if (response?.success) {
                    showStatus(
                        response.message || "Auto-Fill completed.",
                        "success"
                    );
                } else {
                    showStatus(
                        response?.message ||
                        "Auto-Fill could not be started. Open IRCTC and try again.",
                        "error"
                    );
                }
            }
        } catch (error) {
            console.error(`Record action failed (${action}):`, error);

            showStatus(
                action === "autofill"
                    ? "Auto-Fill failed. Check that an IRCTC tab is open and reload it if needed."
                    : "The requested action could not be completed.",
                "error"
            );
        } finally {
            button.disabled = false;
        }
    });

    // Refresh the list if another extension page changes records.
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (
            areaName === "local" &&
            changes[RECORDS_STORAGE_KEY]
        ) {
            loadRecords();
        }
    });

    await loadRecords();
}
