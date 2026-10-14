
"use strict";

(function initializeTrainSelection() {
    const autocomplete = window.IRCTCTrainAutocomplete;

    if (
        !autocomplete ||
        typeof autocomplete.read !== "function" ||
        typeof autocomplete.populate !== "function"
    ) {
        console.error(
            "Train Selection initialization failed: " +
            "train-autocomplete.js was not loaded correctly."
        );

        return;
    }

    window.IRCTCTrainSelection = {
        read() {
            return autocomplete.read();
        },

        populate(value = {}) {
            autocomplete.populate(value);
        }
    };
})();
