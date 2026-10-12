"use strict";

(function initializeTrainSelection() {
    function read() {
        return {
            trainNumber:
                document.getElementById("preferredTrainNumber")
                    ?.value.trim() || "",

            trainName:
                document.getElementById("preferredTrainName")
                    ?.value.trim() || ""
        };
    }

    function populate(value = {}) {
        const trainNumber =
            document.getElementById("preferredTrainNumber");

        const trainName =
            document.getElementById("preferredTrainName");

        if (trainNumber) {
            trainNumber.value = value.trainNumber || "";
        }

        if (trainName) {
            trainName.value = value.trainName || "";
        }
    }

    window.IRCTCTrainSelection = {
        read,
        populate
    };
})();
