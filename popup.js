
window.addEventListener("load", async function () {
    const status = document.getElementById("status");

    const loginForm = document.getElementById("loginForm");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const fillLoginButton = document.getElementById("fillLogin");

    const bookingForm = document.getElementById("bookingForm");
    const fillBookingButton = document.getElementById("fillBooking");

    const journeyDateInput = document.getElementById("journeyDate");
    const journeyDatePicker = document.getElementById("journeyDatePicker");

    const bookingFields = {
        fromStation: document.getElementById("fromStation"),
        toStation: document.getElementById("toStation"),
        journeyDate: journeyDateInput,
        travelClass: document.getElementById("travelClass"),
        quota: document.getElementById("quota"),
        flexibleDate: document.getElementById("flexibleDate"),
        passengerName: document.getElementById("passengerName"),
        passengerAge: document.getElementById("passengerAge"),
        passengerGender: document.getElementById("passengerGender"),
        berthPreference: document.getElementById("berthPreference"),
        foodPreference: document.getElementById("foodPreference")
    };

    const bookingStorageKeys = Object.keys(bookingFields);

    // Validate DD/MM/YYYY and return ISO date.
    function parseDisplayDate(value) {
        const match = String(value || "").trim().match(
            /^(\d{2})\/(\d{2})\/(\d{4})$/
        );

        if (!match) {
            return null;
        }

        const day = Number(match[1]);
        const month = Number(match[2]);
        const year = Number(match[3]);

        const date = new Date(year, month - 1, day);

        if (
            date.getFullYear() !== year ||
            date.getMonth() !== month - 1 ||
            date.getDate() !== day
        ) {
            return null;
        }

        return `${year}-${match[2]}-${match[1]}`;
    }

    // Convert ISO date to DD/MM/YYYY.
    function isoDateToDisplay(value) {
        const match = String(value || "").match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        );

        if (!match) {
            return value || "";
        }

        return `${match[3]}/${match[2]}/${match[1]}`;
    }

    // Open the native calendar when the date textbox receives focus.
    // Browser policy may prevent automatic opening in some situations.
    journeyDateInput.addEventListener("focus", function () {
        const isoDate = parseDisplayDate(journeyDateInput.value);

        if (isoDate) {
            journeyDatePicker.value = isoDate;
        }

        try {
            if (typeof journeyDatePicker.showPicker === "function") {
                journeyDatePicker.showPicker();
            }
        } catch (error) {
            console.debug(
                "Calendar could not open automatically:",
                error
            );
        }
    });

    // Calendar selection -> DD/MM/YYYY.
    journeyDatePicker.addEventListener("change", function () {
        if (!this.value) {
            return;
        }

        journeyDateInput.value = isoDateToDisplay(this.value);

        journeyDateInput.dispatchEvent(
            new Event("input", { bubbles: true })
        );

        journeyDateInput.dispatchEvent(
            new Event("change", { bubbles: true })
        );

        status.textContent = "";
    });

    // Load saved login and booking details.
    try {
        const keys = [
            "irctcUsername",
            "irctcPassword",
            ...bookingStorageKeys
        ];

        const saved = await chrome.storage.local.get(keys);

        usernameInput.value = saved.irctcUsername || "";
        passwordInput.value = saved.irctcPassword || "";

        for (const key of bookingStorageKeys) {
            const element = bookingFields[key];

            if (
                saved[key] === undefined ||
                saved[key] === null
            ) {
                continue;
            }

            if (element.type === "checkbox") {
                element.checked = Boolean(saved[key]);
            } else if (key === "journeyDate") {
                // Support older values saved as YYYY-MM-DD.
                element.value =
                    /^\d{4}-\d{2}-\d{2}$/.test(saved[key])
                        ? isoDateToDisplay(saved[key])
                        : saved[key];
            } else {
                element.value = saved[key];
            }
        }
    } catch (error) {
        console.error("Load error:", error);
        status.textContent = "Saved details load కాలేదు.";
    }

    // Save login details.
    loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            status.textContent =
                "Username, Password నమోదు చేయండి.";
            return;
        }

        try {
            await chrome.storage.local.set({
                irctcUsername: username,
                irctcPassword: password
            });

            status.textContent = "Login details సేవ్ అయ్యాయి.";
        } catch (error) {
            console.error("Login save error:", error);
            status.textContent = "Login details సేవ్ కాలేదు.";
        }
    });

    // Auto-fill login details on IRCTC.
    fillLoginButton.addEventListener("click", async function () {
        await sendToIrctc({
            action: "FILL_LOGIN",
            username: usernameInput.value.trim(),
            password: passwordInput.value
        });
    });

    // Read all booking fields.
    function getBookingDetails() {
        const details = {};

        for (const key of bookingStorageKeys) {
            const element = bookingFields[key];

            details[key] = element.type === "checkbox"
                ? element.checked
                : element.value.trim();
        }

        return details;
    }

    // Save booking details.
    bookingForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const details = getBookingDetails();

        if (!parseDisplayDate(details.journeyDate)) {
            status.textContent =
                "Journey Date DD/MM/YYYY formatలో నమోదు చేయండి. ఉదా: 20/10/2026";
            journeyDateInput.focus();
            return;
        }

        try {
            await chrome.storage.local.set(details);

            status.textContent = "Booking details సేవ్ అయ్యాయి.";
        } catch (error) {
            console.error("Booking save error:", error);
            status.textContent = "Booking details సేవ్ కాలేదు.";
        }
    });


    // Auto-fill booking details on IRCTC.
    fillBookingButton.addEventListener("click", async function () {
        const details = getBookingDetails();

        if (
            !details.fromStation ||
            !details.toStation ||
            !details.journeyDate
        ) {
            status.textContent =
                "From, To, Journey Date నమోదు చేయండి.";
            return;
        }

        if (!parseDisplayDate(details.journeyDate)) {
            status.textContent =
                "Journey Date DD/MM/YYYY formatలో నమోదు చేయండి.";
            journeyDateInput.focus();
            return;
        }

        try {
            // Popup మూసుకుపోయినా Background Service Worker పని కొనసాగించాలి.
            chrome.runtime.sendMessage({
                action: "START_BACKGROUND_AUTOFILL",
                booking: details
            });

            // Auto-Fill ప్రారంభించడానికి message పంపిన వెంటనే popup మూసివేయాలి.
            window.close();
        } catch (error) {
            console.error("Background Auto-Fill error:", error);
            status.textContent = "Auto-Fill ప్రారంభించలేకపోయాం.";
        }
    });


    // Send data to the IRCTC content script.
    async function sendToIrctc(message) {
        status.textContent = "";

        try {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true
            });

            if (
                !tab ||
                !tab.id ||
                !tab.url ||
                !tab.url.startsWith("https://www.irctc.co.in/")
            ) {
                status.textContent =
                    "ముందుగా IRCTC వెబ్‌సైట్‌ను తెరవండి.";
                return;
            }

            const response = await chrome.tabs.sendMessage(
                tab.id,
                message
            );

            if (response && response.success) {
                status.textContent =
                    response.message || "Auto-Fill పూర్తయింది.";
            } else {
                status.textContent =
                    "కొన్ని fields నిండలేదు. IRCTC పేజీని తనిఖీ చేయండి.";

                console.warn("Auto-fill response:", response);
            }
        } catch (error) {

            status.textContent =
                "Connection failed. Extension, IRCTC పేజీని Reload చేయండి.";
        }
    }
});
