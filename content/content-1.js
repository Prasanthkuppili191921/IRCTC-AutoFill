
    "use strict";

    // ఆటోఫిల్ నడుస్తున్నప్పుడు నిజమైన user interactions‌ను తాత్కాలికంగా నిరోధించాలి.
    let bookingAutofillRunning = false;

    const autofillBlockedEvents = [
        "pointerdown",
        "mousedown",
        "mouseup",
        "click",
        "touchstart",
        "touchend",
        "keydown",
        "keyup",
        "contextmenu"
    ];

    function blockUserInteractionDuringAutofill(event) {
        if (!bookingAutofillRunning || !event.isTrusted) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
    }

    for (const eventName of autofillBlockedEvents) {
        document.addEventListener(
            eventName,
            blockUserInteractionDuringAutofill,
            {
                capture: true,
                passive: false
            }
        );
    }


    // ======================================================
    // COMMON HELPERS
    // ======================================================

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function normalizeText(value) {
        return String(value ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function setFieldValue(element, value) {
        if (!element) return false;

        const prototype =
            element instanceof HTMLInputElement
                ? HTMLInputElement.prototype
                : element instanceof HTMLTextAreaElement
                    ? HTMLTextAreaElement.prototype
                    : null;

        const setter = prototype
            ? Object.getOwnPropertyDescriptor(prototype, "value")?.set
            : null;

        if (setter) {
            setter.call(element, String(value ?? ""));
        } else {
            element.value = String(value ?? "");
        }

        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));

        return true;
    }

    function getFieldDescription(element) {
        const labels = Array.from(element.labels || [])
            .map(label => label.innerText)
            .join(" ");

        return [
            labels,
            element.name,
            element.id,
            element.placeholder,
            element.getAttribute("aria-label"),
            element.getAttribute("autocomplete")
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
    }


    // ======================================================
    // LOGIN AUTOFILL
    // ======================================================

    function fillLoginDetails(username, password) {
        const usernameField = document.querySelector(
            'input[formcontrolname="userid"], ' +
            'input[placeholder="User Name"]'
        );

        const passwordField = document.querySelector(
            'input[formcontrolname="password"], ' +
            'input[placeholder="Password"], ' +
            'input[type="password"]'
        );

        if (!usernameField) {
            return {
                success: false,
                message: "Username field కనిపించలేదు."
            };
        }

        if (!passwordField) {
            return {
                success: false,
                message: "Password field కనిపించలేదు."
            };
        }

        setFieldValue(usernameField, username);
        setFieldValue(passwordField, password);

        return {
            success: true,
            usernameFilled: true,
            passwordFilled: true,
            message: "Login details నింపబడ్డాయి."
        };
    }


    function isElementVisible(element) {
        if (!element) return false;

        const style = window.getComputedStyle(element);

        return style.display !== "none" &&
            style.visibility !== "hidden" &&
            element.getClientRects().length > 0;
    }

    function getVisibleLoginFields() {
        const username = Array.from(
            document.querySelectorAll(
                'input[formcontrolname="userid"], ' +
                'input[placeholder="User Name"]'
            )
        ).find(isElementVisible);

        const password = Array.from(
            document.querySelectorAll(
                'input[formcontrolname="password"], ' +
                'input[placeholder="Password"], ' +
                'input[type="password"]'
            )
        ).find(isElementVisible);

        return { username, password };
    }

    function isIrctcLoggedIn() {
        const isVisible = (element) => {
            if (!element) return false;

            const style = window.getComputedStyle(element);

            return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                Number(style.opacity) !== 0 &&
                element.getClientRects().length > 0
            );
        };

        // Login fields కనిపిస్తే ఇంకా login కాలేదు.
        const loginFields = getVisibleLoginFields();

        if (loginFields.username || loginFields.password) {
            return false;
        }

        // Login / Register link ఇంకా కనిపిస్తే login కాలేదు.
        const loginRegisterVisible = Array.from(
            document.querySelectorAll("a.loginText")
        ).some(element => {
            const text = normalizeText(
                element.innerText || element.textContent
            );

            const ariaLabel = normalizeText(
                element.getAttribute("aria-label")
            );

            return (
                isVisible(element) &&
                (
                    text.includes("login / register") ||
                    ariaLabel.includes("login in application")
                )
            );
        });

        if (loginRegisterVisible) {
            return false;
        }

        // Logout indicators ఉంటే login పూర్తయింది.
        const logoutSelectors = [
            'a[href*="logout" i]',
            'button[aria-label*="logout" i]',
            '[aria-label*="sign out" i]',
            '[routerlink*="logout" i]',
            'a[href*="signout" i]'
        ];

        for (const selector of logoutSelectors) {
            const found = Array.from(
                document.querySelectorAll(selector)
            ).some(isVisible);

            if (found) {
                return true;
            }
        }

        // Logout indicator లేకపోయినా, login link లేని స్థితిలో
        // booking form పూర్తిగా కనిపిస్తే login అయి ఉండవచ్చని భావించాలి.
        const from = document.querySelector("#origin input");
        const to = document.querySelector("#destination input");
        const date = document.querySelector("#jDate input");
        const travelClass = document.querySelector("#journeyClass");
        const quota = document.querySelector("#journeyQuota");

        const bookingFormVisible = [
            from,
            to,
            date,
            travelClass,
            quota
        ].every(isVisible);

        if (bookingFormVisible && !loginRegisterVisible) {
            console.log(
                "[IRCTC Login] Booking form కనిపిస్తోంది; login fields లేవు."
            );

            return true;
        }

        return false;
    }

    function hasCaptchaOrOtp() {
        const selectors = [
            'input[formcontrolname*="captcha" i]',
            'input[placeholder*="captcha" i]',
            'input[aria-label*="captcha" i]',
            'input[name*="captcha" i]',
            'input[formcontrolname="otp" i]',
            'input[placeholder*="otp" i]',
            'input[aria-label*="otp" i]',
            'input[name="otp" i]',
            'input[autocomplete="one-time-code"]'
        ];

        return selectors.some(selector =>
            Array.from(document.querySelectorAll(selector))
                .some(element =>
                    isElementVisible(element) &&
                    !element.disabled &&
                    element.type !== "checkbox" &&
                    element.type !== "radio"
                )
        );
    }

    async function openLoginFormIfNeeded() {
        // Login form ఇప్పటికే కనిపిస్తే మళ్లీ open చేయాల్సిన అవసరం లేదు.
        let fields = getVisibleLoginFields();

        if (fields.username && fields.password) {
            return true;
        }

        // IRCTC LOGIN / REGISTER link కోసం వేచి ఉండాలి.
        for (let attempt = 0; attempt < 20; attempt++) {
            const loginControl = Array.from(
                document.querySelectorAll("a.loginText")
            ).find(element =>
                isElementVisible(element) &&
                normalizeText(element.innerText).includes("login / register")
            );

            if (loginControl) {
                loginControl.click();

                // Modal open అయ్యే వరకు వేచి ఉండాలి.
                for (let wait = 0; wait < 40; wait++) {
                    await sleep(250);

                    fields = getVisibleLoginFields();

                    if (fields.username && fields.password) {
                        return true;
                    }
                }

                return false;
            }

            await sleep(250);
        }

        console.warn(
            "[IRCTC AutoFill] LOGIN / REGISTER link కనిపించలేదు."
        );

        return false;
    }




    function findLoginSubmitButton() {
        const username = Array.from(
            document.querySelectorAll(
                'input[formcontrolname="userid"], input[placeholder="User Name"]'
            )
        ).find(isElementVisible);

        const password = Array.from(
            document.querySelectorAll(
                'input[formcontrolname="password"], input[placeholder="Password"], input[type="password"]'
            )
        ).find(isElementVisible);

        if (!username || !password) {
            console.warn(
                "[IRCTC Login] Username or Password field not found."
            );
            return null;
        }

        const loginForm = username.closest("form");

        if (!loginForm || password.closest("form") !== loginForm) {
            console.warn(
                "[IRCTC Login] Username and Password are not in the same form."
            );
            return null;
        }

        const loginButton = loginForm.querySelector(
            'button.train_Search_custom_hover[type="submit"]'
        );

        if (
            !loginButton ||
            !isElementVisible(loginButton) ||
            loginButton.disabled ||
            normalizeText(loginButton.textContent) !== "sign in"
        ) {
            console.warn(
                "[IRCTC Login] SIGN IN button not found in login form."
            );
            return null;
        }

        console.log(
            "[IRCTC Login] SIGN IN button found:",
            loginButton
        );

        return loginButton;
    }


    async function ensureIrctcLogin(login) {
        // 1. Login form కనిపిస్తుందో తనిఖీ చేయాలి.
        let fields = getVisibleLoginFields();

        if (!fields.username || !fields.password) {
            const loginControl = Array.from(
                document.querySelectorAll(
                    'a.loginText[aria-label="Click here to Login in application"]'
                )
            ).find(isElementVisible);

            if (!loginControl) {
                if (isIrctcLoggedIn()) {
                    return {
                        success: true,
                        message: "IRCTC login ఇప్పటికే పూర్తయింది."
                    };
                }

                return {
                    success: false,
                    message: "LOGIN / REGISTER link కనిపించలేదు."
                };
            }

            loginControl.click();

            let formOpened = false;

            for (let attempt = 0; attempt < 40; attempt++) {
                await sleep(250);

                fields = getVisibleLoginFields();

                if (fields.username && fields.password) {
                    formOpened = true;
                    break;
                }
            }

            if (!formOpened) {
                return {
                    success: false,
                    message: "LOGIN / REGISTER నొక్కినా Login box తెరుచుకోలేదు."
                };
            }
        }

        // 2. Saved credentials తనిఖీ చేయాలి.
        if (!login?.username || !login?.password) {
            return {
                success: false,
                message: "Saved login credentials కనిపించలేదు."
            };
        }

        // 3. Username, Password నింపాలి.
        const fillResult = fillLoginDetails(
            login.username,
            login.password
        );

        if (!fillResult.success) {
            return fillResult;
        }

        // 4. Fields మళ్లీ గుర్తించాలి.
        fields = getVisibleLoginFields();

        if (!fields.username || !fields.password) {
            return {
                success: false,
                message: "Username లేదా Password field కనిపించలేదు."
            };
        }

        // 5. Input events పంపాలి.
        for (const field of [fields.username, fields.password]) {
            field.dispatchEvent(
                new Event("input", { bubbles: true })
            );

            field.dispatchEvent(
                new Event("change", { bubbles: true })
            );
        }

        console.log("[IRCTC Login] Credentials filled.");

        // 6. CAPTCHA / OTP ఉంటే ఆపాలి.
        if (hasCaptchaOrOtp()) {
            return {
                success: false,
                message: "CAPTCHA లేదా OTP పూర్తి చేసి Auto-Fill మళ్లీ నొక్కండి."
            };
        }

        // 7. సరైన Login form‌లోని SIGN IN button గుర్తించాలి.
        const loginButton = findLoginSubmitButton();

        if (!loginButton) {
            return {
                success: false,
                message: "SIGN IN button కనిపించలేదు."
            };
        }

        const loginForm = loginButton.closest("form");

        if (!loginForm) {
            return {
                success: false,
                message: "Login form కనిపించలేదు."
            };
        }

        console.log("[IRCTC Login] SIGN IN button:", loginButton);
        console.log("[IRCTC Login] Form:", loginForm);

        // 8. Autofill తర్వాత 50ms వేచి ఉండాలి.
        await sleep(50);

        // 9. Button ఇంకా అందుబాటులో ఉందో తనిఖీ చేయాలి.
        if (
            !loginButton.isConnected ||
            !isElementVisible(loginButton) ||
            loginButton.disabled
        ) {
            return {
                success: false,
                message: "SIGN IN button ప్రస్తుతం అందుబాటులో లేదు."
            };
        }

        // 10. SIGN IN click చేయాలి.
        console.log("[IRCTC Login] Clicking SIGN IN using jQuery.");

        const signInButton = loginButton.closest("form")
            ?.querySelector("button.train_Search_custom_hover[type='submit']");

        if (signInButton && window.jQuery) {
            window.jQuery(signInButton).click();
        } else if (signInButton) {
            signInButton.click();
        } else {
            console.warn("[IRCTC Login] SIGN IN button not found.");
        }

        //loginButton.click();

        // 11. Login response కోసం వేచి ఉండాలి.
        await sleep(1500);

        console.log(
            "[IRCTC Login] Login fields after click:",
            getVisibleLoginFields()
        );

        console.log(
            "[IRCTC Login] CAPTCHA/OTP detected:",
            hasCaptchaOrOtp()
        );

        // 12. గరిష్ఠంగా 10 సెకన్లు Login status తనిఖీ చేయాలి.
        for (let attempt = 0; attempt < 50; attempt++) {
            await sleep(200);

            if (isIrctcLoggedIn()) {
                return {
                    success: true,
                    message: "IRCTC login విజయవంతమైంది."
                };
            }

            if (hasCaptchaOrOtp()) {
                return {
                    success: false,
                    message: "CAPTCHA లేదా OTP పూర్తి చేసి Auto-Fill మళ్లీ నొక్కండి."
                };
            }
        }

        return {
            success: false,
            message: "Login విజయవంతమైందో నిర్ధారించలేకపోయాం."
        };
    }




    // ======================================================
    // PASSENGER DETAILS AUTOFILL
    // ======================================================



async function fillPassengerDetails(data) {
    const passengers = Array.isArray(data?.passengers)
        ? data.passengers
        : (data?.name || data?.age !== undefined ? [data] : []);

    const contactDetails = data?.contactDetails || {};

    if (passengers.length === 0) {
        return {
            success: false,
            message: "Saved passenger details లేవు."
        };
    }

    const sleep = ms =>
        new Promise(resolve => setTimeout(resolve, ms));

    const normalize = value =>
        String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

    const isVisible = element =>
        Boolean(
            element &&
            element.getClientRects().length > 0 &&
            !element.disabled
        );

    function getDescription(element) {
        return (
            getFieldDescription(element) + " " +
            (element.getAttribute("formcontrolname") || "") + " " +
            (element.getAttribute("name") || "") + " " +
            (element.getAttribute("aria-label") || "")
        ).toLowerCase();
    }

    const fieldSelectors = {
        name:
            'input[formcontrolname="passengerName"], ' +
            'input[name*="passengerName" i], ' +
            'input[placeholder*="name" i]',

        age:
            'input[formcontrolname="passengerAge"], ' +
            'input[name*="passengerAge" i], ' +
            'input[placeholder*="age" i]',

        gender:
            'select[formcontrolname="passengerGender"], ' +
            'select[name*="passengerGender" i]',

        nationality:
            'select[formcontrolname="passengerNationality"], ' +
            'select[name*="passengerNationality" i]',

        berth:
            'select[formcontrolname="passengerBerthChoice"], ' +
            'select[name*="passengerBerth" i], ' +
            'select[name*="berth" i]'
    };

    const fieldPatterns = {
        name: /passenger.?name|psgn.?name|full.?name/,
        age: /passenger.?age|psgn.?age/,
        gender: /passenger.?gender|psgn.?gender/,
        nationality: /passenger.?nationality|nationality/,
        berth: /passengerberthchoice|berth.?preference|berth.?choice/
    };

    function getFields(key) {
        const selector = fieldSelectors[key];

        const directMatches = Array.from(
            document.querySelectorAll(selector)
        ).filter(isVisible);

        if (directMatches.length > 0) {
            return directMatches;
        }

        // Fallback: field descriptions/labels ఆధారంగా గుర్తించాలి.
        const pattern = fieldPatterns[key];

        return Array.from(document.querySelectorAll(
            'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea'
        )).filter(element =>
            isVisible(element) &&
            pattern.test(getDescription(element))
        );
    }

    function getPassengerNameFields() {
        return getFields("name");
    }

    // మీ HTMLలో + Add Passenger అనేది span.prenext.
    function findAddPassengerSpan() {
        return Array.from(
            document.querySelectorAll("span.prenext")
        ).find(element =>
            isVisible(element) &&
            normalize(element.textContent).includes("+ add passenger")
        ) || null;
    }

    // అవసరమైన passenger rows వచ్చే వరకు Add Passenger click చేయాలి.
    let addPassengerClicks = 0;

    while (getPassengerNameFields().length < passengers.length) {
        const addSpan = findAddPassengerSpan();

        if (!addSpan) {
            console.warn(
                "[IRCTC Passenger] + Add Passenger span కనిపించలేదు.",
                {
                    availableRows: getPassengerNameFields().length,
                    requiredRows: passengers.length
                }
            );
            break;
        }

        const previousCount = getPassengerNameFields().length;

        // Span‌పై click చేస్తే event parent <a> వరకు bubble అవుతుంది.
        addSpan.click();
        addPassengerClicks++;

        // Angular కొత్త row render చేసే వరకు వేచి ఉండాలి.
        let attempts = 0;

        while (
            attempts < 20 &&
            getPassengerNameFields().length <= previousCount
        ) {
            await sleep(150);
            attempts++;
        }

        if (getPassengerNameFields().length <= previousCount) {
            console.warn(
                "[IRCTC Passenger] Click తర్వాత కొత్త passenger row రాలేదు.",
                {
                    previousCount,
                    currentCount: getPassengerNameFields().length
                }
            );
            break;
        }
    }

    await sleep(300);

    function setControl(element, value) {
        if (
            !element ||
            value === undefined ||
            value === null ||
            value === ""
        ) {
            return false;
        }

        if (element.tagName === "SELECT") {
            const wanted = normalize(value);

            const aliases = {
                m: ["m", "male"],
                male: ["male", "m"],
                f: ["f", "female"],
                female: ["female", "f"],
                t: ["t", "transgender"],
                transgender: ["transgender", "t"],

                in: ["in", "india", "indian"],
                india: ["india", "in", "indian"],
                indian: ["indian", "india", "in"],
                other: ["other"],

                lb: ["lb", "lower", "lower berth"],
                mb: ["mb", "middle", "middle berth"],
                ub: ["ub", "upper", "upper berth"],
                sl: ["sl", "side lower", "side lower berth"],
                su: ["su", "side upper", "side upper berth"]
            };

            const accepted = aliases[wanted] || [wanted];

            const option = Array.from(element.options).find(item =>
                accepted.includes(normalize(item.value)) ||
                accepted.includes(normalize(item.textContent))
            );

            if (!option) {
                console.warn(
                    "[IRCTC Passenger] Dropdown option దొరకలేదు:",
                    { value, element }
                );
                return false;
            }

            element.value = option.value;
            element.dispatchEvent(
                new Event("input", { bubbles: true })
            );
            element.dispatchEvent(
                new Event("change", { bubbles: true })
            );

            return true;
        }

        return Boolean(setFieldValue(element, value));
    }

    const result = {
        success: false,
        passengersRequested: passengers.length,
        rowsAvailable: 0,
        passengersFilled: 0,
        fieldsFilled: 0,
        addPassengerClicks,
        mobileFilled: false,
        details: []
    };

    // ప్రతి passenger‌కు ప్రత్యేక row‌లో values fill చేయాలి.
    for (let index = 0; index < passengers.length; index++) {
        const passenger = passengers[index] || {};
        const detail = {
            passengerNumber: index + 1,
            name: false,
            age: false,
            gender: false,
            nationality: false,
            berthPreference: false
        };

        let fieldsForThisPassenger = 0;

        const values = {
            name: passenger.name ?? passenger.fullName ?? passenger.passengerName,
            age: passenger.age,
            gender: passenger.gender,
            nationality: passenger.nationality,
            berth: passenger.berthPreference
        };

        for (const key of Object.keys(values)) {
            const field = getFields(key)[index];

            detail[key === "berth" ? "berthPreference" : key] =
                setControl(field, values[key]);

            if (detail[key === "berth" ? "berthPreference" : key]) {
                fieldsForThisPassenger++;
                result.fieldsFilled++;
            }
        }

        if (fieldsForThisPassenger > 0) {
            result.passengersFilled++;
        }

        result.details.push(detail);
    }

    // Contact Details‌లో Mobile Number ఉంటే fill చేయాలి.
    const mobileNumber =
        contactDetails.mobileNumber ||
        contactDetails.mobile ||
        "";

    if (mobileNumber) {
        const controls = Array.from(document.querySelectorAll(
            'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea'
        )).filter(isVisible);

        const mobileField = controls.find(element =>
            /mobile.?number|mobile.?no|contact.?number|mobileno|phone.?number/.test(
                getDescription(element)
            )
        );

        result.mobileFilled = setControl(mobileField, mobileNumber);

        if (result.mobileFilled) {
            result.fieldsFilled++;
        }
    }

    result.rowsAvailable = getPassengerNameFields().length;

    // ఒక passenger మాత్రమే fill అయితే మొత్తం successగా పరిగణించకూడదు.
    result.success =
        result.rowsAvailable >= passengers.length &&
        result.passengersFilled === passengers.length &&
        result.fieldsFilled > 0;

    result.message = result.success
        ? `అన్ని ${passengers.length} passenger records process అయ్యాయి.`
        : `Partial autofill: ${result.passengersFilled}/${passengers.length} passengers మాత్రమే fill అయ్యారు.`;

    console.log("[IRCTC Passenger] Autofill result:", result);

    return result;
}




    // ======================================================
    // STATION AUTOCOMPLETE
    // ======================================================


    async function fillStation(selector, stationName) {
        const input = document.querySelector(selector);

        if (!input) {
            return {
                success: false,
                message: `Station field కనిపించలేదు: ${selector}`
            };
        }

        const requested = String(stationName ?? "").trim();

        if (!requested) {
            return {
                success: false,
                message: "Station పేరు ఖాళీగా ఉంది."
            };
        }

        const normalize = value =>
            String(value ?? "")
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase();

        const setValue = value => {
            const setter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value"
            )?.set;

            if (setter) {
                setter.call(input, value);
            } else {
                input.value = value;
            }

            input.dispatchEvent(
                new Event("input", { bubbles: true })
            );
        };

        const getVisibleOptions = () => {
            const listId = input.getAttribute("aria-controls");
            const lists = [];

            if (listId) {
                const list = document.getElementById(listId);
                if (list) lists.push(list);
            }

            const autocomplete = input.closest("p-autocomplete");

            if (autocomplete) {
                lists.push(autocomplete);
            }

            const options = [];

            for (const container of lists) {
                options.push(
                    ...container.querySelectorAll(
                        '[role="option"], ' +
                        "li.ui-autocomplete-list-item, " +
                        ".ui-autocomplete-list-item"
                    )
                );
            }

            return [...new Set(options)].filter(option => {
                const style = window.getComputedStyle(option);

                return style.display !== "none" &&
                    style.visibility !== "hidden" &&
                    option.getClientRects().length > 0;
            });
        };

        try {
            input.focus();
            input.click();

            // పాత station value తొలగించి, autocomplete‌ను మళ్లీ trigger చేయాలి.
            setValue("");
            await sleep(150);

            // IRCTCలో టైప్ చేసినట్టుగా ఒక్కో అక్షరం పంపాలి.
            for (const character of requested) {
                const nextValue = input.value + character;

                input.dispatchEvent(
                    new KeyboardEvent("keydown", {
                        key: character,
                        bubbles: true
                    })
                );

                setValue(nextValue);

                input.dispatchEvent(
                    new KeyboardEvent("keyup", {
                        key: character,
                        bubbles: true
                    })
                );

                await sleep(45);
            }

            // Suggestions load కావడానికి గరిష్ఠంగా 3 సెకన్లు వేచి ఉండాలి.
            let options = [];

            for (let attempt = 0; attempt < 30; attempt++) {
                await sleep(100);
                options = getVisibleOptions();

                if (options.length > 0) break;
            }

            if (!options.length) {
                return {
                    success: false,
                    message:
                        `"${requested}" కోసం IRCTC station suggestions రాలేదు.`
                };
            }

            const requestedText = normalize(requested);

            const exact = options.find(option =>
                normalize(option.innerText || option.textContent) ===
                requestedText
            );

            const startsWith = options.find(option =>
                normalize(option.innerText || option.textContent)
                    .startsWith(requestedText)
            );

            const contains = options.find(option =>
                normalize(option.innerText || option.textContent)
                    .includes(requestedText)
            );

            const target = exact || startsWith || contains;

            if (!target) {
                return {
                    success: false,
                    message:
                        `"${requested}"కు సరిపోయే station కనిపించలేదు. ` +
                        "Popupలో station పేరు/code తనిఖీ చేయండి."
                };
            }

            target.click();
            await sleep(350);

            // IRCTC ఎంపికను inputలో చూపించిందో తనిఖీ చేయాలి.
            const actual = normalize(input.value);
            const selectedText = normalize(
                target.innerText || target.textContent
            );

            const verified =
                actual === requestedText ||
                actual === selectedText ||
                selectedText.startsWith(actual) ||
                actual.startsWith(requestedText);

            if (!verified) {
                return {
                    success: false,
                    message:
                        `Station ఎంపిక నిర్ధారణ కాలేదు. ` +
                        `Inputలో ఉన్నది: ${input.value || "ఖాళీ"}`
                };
            }

            return {
                success: true,
                message:
                    `${input.value} station ఎంపిక చేయబడింది.`
            };
        } catch (error) {
            console.error("IRCTC station autocomplete error:", error);

            return {
                success: false,
                message:
                    `Station ఎంపికలో లోపం: ${String(error.message || error)}`
            };
        }
    }


    // ======================================================
    // JOURNEY DATE
    // IRCTC p-calendar: #jDate input
    // Expected format: DD/MM/YYYY
    // ======================================================


    function convertDateToIRCTC(value) {
        const dateValue = String(value ?? "").trim();

        if (!dateValue) return "";

        let day;
        let month;
        let year;

        // Popup date: YYYY-MM-DD
        const isoMatch = dateValue.match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        );

        // Display date: DD/MM/YYYY
        const displayMatch = dateValue.match(
            /^(\d{2})\/(\d{2})\/(\d{4})$/
        );

        if (isoMatch) {
            year = Number(isoMatch[1]);
            month = Number(isoMatch[2]);
            day = Number(isoMatch[3]);
        } else if (displayMatch) {
            day = Number(displayMatch[1]);
            month = Number(displayMatch[2]);
            year = Number(displayMatch[3]);
        } else {
            return "";
        }

        // Invalid dates, such as 31/02/2026, must be rejected.
        const parsed = new Date(year, month - 1, day);

        if (
            parsed.getFullYear() !== year ||
            parsed.getMonth() !== month - 1 ||
            parsed.getDate() !== day
        ) {
            return "";
        }

        return (
            String(day).padStart(2, "0") + "/" +
            String(month).padStart(2, "0") + "/" +
            String(year)
        );
    }




    async function fillJourneyDate(value) {
        const calendar = document.querySelector("#jDate");
        const input = calendar?.querySelector("input");

        if (!calendar || !input) {
            return {
                success: false,
                message: "Journey Date Calendar కనిపించలేదు."
            };
        }

        const date = convertDateToIRCTC(value);

        if (!date) {
            return {
                success: false,
                message: "తేదీ format తప్పుగా ఉంది."
            };
        }

        const [day, month, year] = date.split("/").map(Number);

        const targetDate = new Date(year, month - 1, day);

        if (
            targetDate.getFullYear() !== year ||
            targetDate.getMonth() !== month - 1 ||
            targetDate.getDate() !== day
        ) {
            return {
                success: false,
                message: "ఎంచుకున్న తేదీ చెల్లదు."
            };
        }

        input.click();
        input.focus();

        await sleep(250);

        const getPicker = () =>
            calendar.querySelector(".ui-datepicker");

        let picker = getPicker();

        if (!picker) {
            return {
                success: false,
                message: "Calendar popup తెరవబడలేదు."
            };
        }

        // Calendar headerలో చూపిస్తున్న నెల, సంవత్సరం చదవాలి.
        for (let attempt = 0; attempt < 24; attempt++) {
            picker = getPicker();

            if (!picker) {
                return {
                    success: false,
                    message: "Calendar popup మూసుకుపోయింది."
                };
            }

            const monthElement = picker.querySelector(
                ".ui-datepicker-month"
            );

            const yearElement = picker.querySelector(
                ".ui-datepicker-year"
            );

            if (!monthElement || !yearElement) {
                return {
                    success: false,
                    message: "Calendar నెల/సంవత్సరం కనిపించలేదు."
                };
            }

            const shownMonth = new Date(
                `${monthElement.textContent.trim()} 1, ` +
                yearElement.textContent.trim()
            );

            if (Number.isNaN(shownMonth.getTime())) {
                return {
                    success: false,
                    message: "Calendar నెలను గుర్తించలేకపోయాం."
                };
            }

            const difference =
                (year - shownMonth.getFullYear()) * 12 +
                (month - 1 - shownMonth.getMonth());

            if (difference === 0) {
                break;
            }

            const direction = difference > 0
                ? ".ui-datepicker-next"
                : ".ui-datepicker-prev";

            const navigationButton =
                picker.querySelector(direction);

            if (!navigationButton) {
                return {
                    success: false,
                    message: "Calendar నెలను మార్చలేకపోయాం."
                };
            }

            navigationButton.click();
            await sleep(150);
        }

        picker = getPicker();

        if (!picker) {
            return {
                success: false,
                message: "Calendar popup కనిపించలేదు."
            };
        }

        const dayCells = Array.from(
            picker.querySelectorAll(
                ".ui-datepicker-calendar td"
            )
        );

        const targetCell = dayCells.find(cell => {
            if (
                cell.classList.contains(
                    "ui-datepicker-other-month"
                )
            ) {
                return false;
            }

            const link = cell.querySelector(
                "a.ui-state-default"
            );

            return link &&
                Number(link.textContent.trim()) === day &&
                !link.classList.contains("ui-state-disabled");
        });

        if (!targetCell) {
            return {
                success: false,
                message:
                    `Calendarలో ${date} తేదీ ఎంపిక చేయలేకపోయాం.`
            };
        }

        targetCell.querySelector("a.ui-state-default").click();

        await sleep(300);

        const actualValue = input.value.trim();

        return {
            success: actualValue === date,
            message: actualValue === date
                ? `Journey Date ఎంపిక చేయబడింది: ${date}`
                : `తేదీ నిర్ధారణ విఫలమైంది. ప్రస్తుతం: ${actualValue || "ఖాళీ"
                }`
        };
    }




    // ======================================================
    // IRCTC CLASS AND QUOTA DROPDOWNS
    // ======================================================



    async function selectIrctcDropdown(selector, requestedValue) {
        const dropdown = document.querySelector(selector);

        if (!dropdown) {
            return {
                success: false,
                message: `Dropdown కనిపించలేదు: ${selector}`
            };
        }

        const requested = String(requestedValue ?? "").trim();

        if (!requested) {
            return {
                success: true,
                message: "ఎంపిక ఇవ్వలేదు."
            };
        }

        const normalize = value =>
            String(value ?? "")
                .normalize("NFKC")
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase();

        const aliases = {
            "1a": ["1a", "ac first class"],
            "2a": ["2a", "ac 2 tier", "ac two tier"],
            "3a": ["3a", "ac 3 tier", "ac three tier"],
            "3e": ["3e", "ac 3 economy"],
            "cc": ["cc", "ac chair car"],
            "ec": ["ec", "executive chair car"],
            "sl": ["sl", "sleeper"],
            "2s": ["2s", "second sitting"],
            "general": ["general", "gn"],
            "gn": ["general", "gn"],
            "tatkal": ["tatkal", "ck", "tq"],
            "tq": ["tatkal", "tq", "ck"],
            "ck": ["tatkal", "ck", "tq"],
            "premium tatkal": ["premium tatkal", "pt"],
            "pt": ["premium tatkal", "pt"],
            "ladies": ["ladies", "ld"],
            "ld": ["ladies", "ld"],
            "lower berth/sr. citizen": [
                "lower berth/sr. citizen",
                "lower berth",
                "sr. citizen"
            ],
            "person with disability": [
                "person with disability",
                "divyangjan"
            ],
            "duty pass": ["duty pass"],
            "parliament house": ["parliament house"],
            "all classes": ["all classes"]
        };

        function matchesOption(text) {
            const actual = normalize(text);
            const wanted = normalize(requested);

            if (actual === wanted) return true;

            const candidates = aliases[wanted] || [wanted];

            return candidates.some(alias => {
                const candidate = normalize(alias);

                return actual === candidate ||
                    actual.includes(`(${candidate})`) ||
                    actual.startsWith(`${candidate} `);
            });
        }

        const getLabel = () =>
            dropdown.querySelector(".ui-dropdown-label");

        const getCurrentValue = () => {
            const label = getLabel();

            const hiddenInput = dropdown.querySelector(
                'input[role="listbox"]'
            );

            return label?.textContent?.trim() ||
                hiddenInput?.getAttribute("aria-label") ||
                "";
        };

        if (matchesOption(getCurrentValue())) {
            return {
                success: true,
                message: `${getCurrentValue()} ఇప్పటికే ఎంపిక చేయబడింది.`
            };
        }

        const trigger = dropdown.querySelector(
            ".ui-dropdown-trigger"
        );

        if (!trigger) {
            return {
                success: false,
                message: `Dropdown trigger కనిపించలేదు: ${selector}`
            };
        }

        trigger.click();

        // Dropdown తెరుచుకునే వరకు వేచి ఉండాలి.
        let panel = null;

        for (let i = 0; i < 20; i++) {
            await sleep(100);

            const expanded =
                dropdown.querySelector(
                    'input[role="listbox"]'
                )?.getAttribute("aria-expanded") === "true" ||
                trigger.getAttribute("aria-expanded") === "true";

            const visiblePanels = Array.from(
                document.querySelectorAll(".ui-dropdown-panel")
            ).filter(element => {
                const style = window.getComputedStyle(element);

                return style.display !== "none" &&
                    style.visibility !== "hidden" &&
                    element.getClientRects().length > 0;
            });

            if (visiblePanels.length) {
                panel = visiblePanels[visiblePanels.length - 1];
            }

            if (expanded && panel) break;

            if (panel) break;
        }

        if (!panel) {
            return {
                success: false,
                message:
                    `${selector} dropdown తెరుచుకోలేదు. ` +
                    "IRCTC పేజీని Refresh చేసి మళ్లీ ప్రయత్నించండి."
            };
        }

        const options = Array.from(
            panel.querySelectorAll(
                "li.ui-dropdown-item, .ui-dropdown-item, [role='option']"
            )
        ).filter(option => {
            const style = window.getComputedStyle(option);

            return style.display !== "none" &&
                style.visibility !== "hidden" &&
                option.getClientRects().length > 0 &&
                !option.classList.contains("ui-state-disabled") &&
                option.getAttribute("aria-disabled") !== "true";
        });

        const target = options.find(option =>
            matchesOption(option.innerText || option.textContent)
        );

        if (!target) {
            document.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Escape",
                    bubbles: true
                })
            );

            return {
                success: false,
                message:
                    `"${requested}" ఎంపిక ${selector} dropdownలో కనిపించలేదు. ` +
                    `కనిపించినవి: ${options.map(option =>
                        option.innerText.trim()
                    ).join(", ") || "ఏవీ లేవు"
                    }`
            };
        }

        target.click();
        await sleep(400);

        const updatedValue = getCurrentValue();
        const verified = matchesOption(updatedValue);

        return {
            success: verified,
            message: verified
                ? `${updatedValue} ఎంపిక చేయబడింది.`
                : `${requested} ఎంపిక నిర్ధారణ కాలేదు. ప్రస్తుతం: ${updatedValue || "తెలియదు"
                }`
        };
    }



