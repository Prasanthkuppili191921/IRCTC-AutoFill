"use strict";

// Train Selection fields are injected into the dashboard before booking.js loads.
// The selected class is intentionally read from Journey Details, not this section.
window.IRCTCTrainSelection = {
    read() {
        const trainNumber = document
            .getElementById("preferredTrainNumber")
            ?.value.trim() || "";

        const trainName = document
            .getElementById("preferredTrainName")
            ?.value.trim() || "";

        return {
            trainNumber,
            trainName,
            matchingRule: document.getElementById("trainMatchingRule")?.value || "both",
            availabilityRule: document.getElementById("trainAvailabilityRule")?.value || "any"
        };
    },

    populate(value = {}) {
        const numberInput = document.getElementById("preferredTrainNumber");
        const nameInput = document.getElementById("preferredTrainName");
        const matchingInput = document.getElementById("trainMatchingRule");
        const availabilityInput = document.getElementById("trainAvailabilityRule");

        if (numberInput) numberInput.value = value.trainNumber || "";
        if (nameInput) nameInput.value = value.trainName || "";
        if (matchingInput) matchingInput.value = value.matchingRule || "both";
        if (availabilityInput) availabilityInput.value = value.availabilityRule || "any";
    }
};