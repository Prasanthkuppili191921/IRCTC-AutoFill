"use strict";

document.addEventListener("DOMContentLoaded", initializeDashboard);

async function initializeDashboard() {
    const sectionsContainer =
        document.getElementById("sectionsContainer");

    const dashboardStatus =
        document.getElementById("dashboardStatus");

    if (!sectionsContainer || !dashboardStatus) {
        console.error("Dashboard elements not found.");
        return;
    }

    function showStatus(message, type = "") {
        dashboardStatus.textContent = message;
        dashboardStatus.className = type;
    }

    function getExtensionUrl(path) {
        return chrome.runtime.getURL(path);
    }

    try {
        const bookingUrl = getExtensionUrl(
            "forms/booking/booking.html"
        );

        const response = await fetch(bookingUrl);

        if (!response.ok) {
            throw new Error(
                `Unable to load booking.html: HTTP ${ response.status } `
            );
        }

        const html = await response.text();

        const parsedDocument = new DOMParser().parseFromString(
            html,
            "text/html"
        );

        const bookingPage =
            parsedDocument.querySelector(".page-container");

        if (!bookingPage) {
            throw new Error(
                "The .page-container element was not found in booking.html."
            );
        }

        // Insert the complete booking UI, not only the form.
        sectionsContainer.replaceChildren(
            document.importNode(bookingPage, true)
        );

        const bookingCard =
            sectionsContainer.querySelector(".booking-card");

        const bookingForm =
            sectionsContainer.querySelector("#bookingForm");

        if (!bookingCard || !bookingForm) {
            throw new Error(
                "The booking card or booking form was not found."
            );
        }

        // Add the one centralized Save Details button
        // at the end of the existing booking card.
        const saveArea = document.createElement("div");
        saveArea.className = "dashboard-save-area";

        const saveButton = document.createElement("button");
        saveButton.id = "saveDetailsButton";
        saveButton.type = "button";
        saveButton.textContent = "Save Details";

        saveArea.appendChild(saveButton);
        bookingCard.appendChild(saveArea);

        // Load the existing booking.js after its HTML exists.
        await loadScript(
            getExtensionUrl("forms/booking/booking.js")
        );

        // Use the existing booking.js save and validation logic.
        saveButton.addEventListener("click", () => {
            const form = document.getElementById("bookingForm");

            if (!form) {
                showStatus("Booking form not found.", "error");
                return;
            }

            saveButton.disabled = true;
            saveButton.textContent = "Saving...";
            showStatus("");

            form.requestSubmit();

            // Existing booking.js updates statusMessage.
            const formStatus =
                document.getElementById("statusMessage");

            let attempts = 0;

            const timer = window.setInterval(() => {
                attempts++;

                const message =
                    formStatus?.textContent?.trim() || "";

                const className =
                    formStatus?.className || "";

                if (
                    message &&
                    (
                        className.includes("success") ||
                        className.includes("error")
                    )
                ) {
                    showStatus(
                        message,
                        className.includes("success")
                            ? "success"
                            : "error"
                    );

                    saveButton.disabled = false;
                    saveButton.textContent = "Save Details";
                    window.clearInterval(timer);
                    return;
                }

                if (attempts >= 40) {
                    saveButton.disabled = false;
                    saveButton.textContent = "Save Details";
                    window.clearInterval(timer);
                }
            }, 250);
        });


        const isEditMode = new URLSearchParams(
            window.location.search
        ).has("id");

        document.title = isEditMode
            ? "Edit - IRCTC AutoFill Dashboard"
            : "IRCTC AutoFill Dashboard";


        console.log(
            "Dashboard initialized. Journey Details loaded successfully."
        );

    } catch (error) {
        console.error("Dashboard initialization failed:", error);

        showStatus(
            "Unable to load Journey Details. Check the extension files.",
            "error"
        );
    }
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");

        script.src = src;

        script.onload = () => resolve();
        script.onerror = () => {
            reject(new Error(`Unable to load script: ${ src } `));
        };

        document.body.appendChild(script);
    });
}
