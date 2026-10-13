
"use strict";

(() => {
    const passengerList = document.getElementById("passengerList");
    const addPassengerBtn = document.getElementById("addPassengerBtn");
    const form = document.getElementById("passengerDetailsForm");
    const formMessage = document.getElementById("formMessage");
    const mobileNumber = document.getElementById("mobileNumber");
    const emailAddress = document.getElementById("emailAddress");

    let nextPassengerId = 1;
    const MAX_PASSENGERS = 6;

    // ========================================
    // Create Field
    // ========================================

    function createField(label, name, type, options = {}) {
        const wrapper = document.createElement("div");
        wrapper.className = "field";

        const inputId = `${name}-${crypto.randomUUID()}`;

        const labelElement = document.createElement("label");
        labelElement.htmlFor = inputId;
        labelElement.textContent = label;

        let input;

        if (type === "select") {
            input = document.createElement("select");

            for (const option of options.choices || []) {
                const optionElement = document.createElement("option");
                optionElement.value = option.value;
                optionElement.textContent = option.label;
                input.appendChild(optionElement);
            }
        } else {
            input = document.createElement("input");
            input.type = type;
        }

        input.id = inputId;
        input.name = name;

        if (options.required) input.required = true;
        if (options.min !== undefined) input.min = options.min;
        if (options.max !== undefined) input.max = options.max;
        if (options.minLength !== undefined) input.minLength = options.minLength;
        if (options.maxLength !== undefined) input.maxLength = options.maxLength;
        if (options.placeholder) input.placeholder = options.placeholder;

        wrapper.append(labelElement, input);
        return wrapper;
    }

    // ========================================
    // Messages
    // ========================================

    function showMessage(message, isError = false) {
        if (!formMessage) return;

        formMessage.textContent = message;
        formMessage.style.color = isError ? "#b91c1c" : "#15803d";
    }

    function clearMessage() {
        showMessage("");
    }

    // ========================================
    // Notify Dashboard About Content Height
    // ========================================

    function notifyContentHeight() {
        if (window.parent === window) {
            return;
        }

        const bodyStyle = getComputedStyle(document.body);

        const verticalPadding =
            (parseFloat(bodyStyle.paddingTop) || 0) +
            (parseFloat(bodyStyle.paddingBottom) || 0);

        const height = Math.ceil(
            document.getElementById("passengerDetailsForm")
                .getBoundingClientRect().height +
            verticalPadding
        );

        window.parent.postMessage(
            {
                type: "PASSENGER_DETAILS_HEIGHT",
                height
            },
            window.location.origin
        );
    }

    // ========================================
    // Set Field Values
    // ========================================

    function setFieldValues(container, values) {
        for (const [name, value] of Object.entries(values)) {
            const field = [...container.querySelectorAll("[name]")]
                .find(element => element.name === name);

            if (field) {
                field.value = value == null ? "" : String(value);
            }
        }
    }

    // ========================================
    // Trash Icon
    // ========================================

    function createRemoveIcon() {
        const svg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg"
        );

        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", "16");
        svg.setAttribute("height", "16");
        svg.setAttribute("aria-hidden", "true");
        svg.classList.add("remove-icon");

        const path = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path"
        );

        path.setAttribute(
            "d",
            "M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"
        );
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "1.7");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");

        svg.appendChild(path);
        return svg;
    }

    // ========================================
    // Renumber Passengers
    // ========================================

    function renumberPassengers() {
        [...passengerList.children].forEach((card, index) => {
            const heading = card.querySelector(".passenger-card-header h3");

            if (heading) {
                heading.textContent = `Passenger ${index + 1}`;
            }

            const removeButton = card.querySelector(".remove-btn");

            if (removeButton) {
                const isLastPassenger = passengerList.children.length <= 1;

                removeButton.disabled = isLastPassenger;
                removeButton.setAttribute(
                    "aria-label",
                    `Remove passenger ${index + 1}`
                );
                removeButton.title = isLastPassenger
                    ? "At least one passenger is required"
                    : `Remove passenger ${index + 1}`;
            }
        });

        addPassengerBtn.disabled =
            passengerList.children.length >= MAX_PASSENGERS;
    }

    // ========================================
    // Add Passenger
    // ========================================

    function addPassenger(data = {}) {
        if (passengerList.children.length >= MAX_PASSENGERS) {
            showMessage("Maximum 6 passengers allowed.", true);
            return false;
        }

        const passengerId = nextPassengerId++;

        const card = document.createElement("div");
        card.className = "passenger-card";
        card.dataset.passengerId = String(passengerId);

        const header = document.createElement("div");
        header.className = "passenger-card-header";

        const heading = document.createElement("h3");
        heading.textContent = "Passenger";

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "remove-btn";
        removeButton.setAttribute("aria-label", "Remove passenger");
        removeButton.title = "Remove passenger";
        removeButton.appendChild(createRemoveIcon());

        removeButton.addEventListener("click", () => {
            if (passengerList.children.length <= 1) {
                showMessage("At least one passenger is required.", true);
                return;
            }

            card.remove();
            renumberPassengers();
            clearMessage();
            requestAnimationFrame(notifyContentHeight);
        });

        header.append(heading, removeButton);

        const fieldsRow = document.createElement("div");
        fieldsRow.className = "passenger-fields-row";

        fieldsRow.append(
            createField(
                "Full Name",
                `passengerName_${passengerId}`,
                "text",
                {
                    required: true,
                    minLength: 3,
                    maxLength: 16,
                    placeholder: "Full Name as per Govt. ID"
                }
            ),

            createField(
                "Age",
                `passengerAge_${passengerId}`,
                "number",
                {
                    required: true,
                    min: 5,
                    max: 125,
                    placeholder: "Age"
                }
            ),

            createField(
                "Gender",
                `passengerGender_${passengerId}`,
                "select",
                {
                    required: true,
                    choices: [
                        { value: "", label: "Gender" },
                        { value: "M", label: "Male" },
                        { value: "F", label: "Female" },
                        { value: "T", label: "Transgender" }
                    ]
                }
            ),

            createField(
                "Nationality",
                `passengerNationality_${passengerId}`,
                "select",
                {
                    choices: [
                        { value: "IN", label: "India" },
                        { value: "OTHER", label: "Other" }
                    ]
                }
            ),

            createField(
                "Berth Preference",
                `passengerBerth_${passengerId}`,
                "select",
                {
                    choices: [
                        { value: "", label: "No Preference" },
                        { value: "LB", label: "Lower" },
                        { value: "MB", label: "Middle" },
                        { value: "UB", label: "Upper" },
                        { value: "SL", label: "Side Lower" },
                        { value: "SU", label: "Side Upper" }
                    ]
                }
            )
        );

        const separator = document.createElement("hr");
        separator.className = "passenger-separator";

        card.append(header, fieldsRow, separator);
        passengerList.appendChild(card);

        setFieldValues(card, {
            [`passengerName_${passengerId}`]: data.name ?? data.fullName ?? data.passengerName ?? "",
            [`passengerAge_${passengerId}`]: data.age ?? "",
            [`passengerGender_${passengerId}`]: data.gender ?? "",
            [`passengerNationality_${passengerId}`]: data.nationality ?? "IN",
            [`passengerBerth_${passengerId}`]: data.berthPreference ?? ""
        });

        renumberPassengers();
        clearMessage();

        requestAnimationFrame(notifyContentHeight);

        return true;
    }

    // ========================================
    // Collect Form Data
    // ========================================

    function collectFormData() {
        const passengers = [...passengerList.children].map(card => {
            const getValue = prefix => {
                const field = [...card.querySelectorAll("[name]")]
                    .find(element =>
                        element.name.startsWith(`${prefix}_`)
                    );

                return field?.value?.trim() ?? "";
            };

            return {
                name: getValue("passengerName"),
                age: getValue("passengerAge"),
                gender: getValue("passengerGender"),
                nationality: getValue("passengerNationality"),
                berthPreference: getValue("passengerBerth")
            };
        });

        return {
            passengers,
            contactDetails: {
                mobileNumber: mobileNumber.value.trim()
            }
        };
    }

    // ========================================
    // Restore Form Data
    // ========================================

    function setData(data = {}) {
        passengerList.replaceChildren();
        nextPassengerId = 1;
        clearMessage();

        const passengers = Array.isArray(data.passengers)
            ? data.passengers.slice(0, MAX_PASSENGERS)
            : [];

        if (passengers.length > 0) {
            passengers.forEach(passenger => addPassenger(passenger));
        } else {
            addPassenger();
        }

        // Support both the current and older record structures.
        const contact = data.contactDetails || {};

        mobileNumber.value =
            String(contact.mobileNumber ?? data.mobileNumber ?? "")
                .replace(/^\+?91[\s-]?/, "")
                .replace(/\D/g, "")
                .slice(0, 10);

        renumberPassengers();
        requestAnimationFrame(notifyContentHeight);
    }

    // ========================================
    // Add Passenger Button
    // ========================================

    addPassengerBtn.addEventListener("click", () => {
        addPassenger();
    });

    // ========================================
    // Dashboard Integration API
    // ========================================

    window.PassengerDetailsForm = {
        getData() {
            if (!form.reportValidity()) {
                return null;
            }

            return collectFormData();
        },

        setData(data = {}) {
            setData(data);
        }
    };

    // ========================================
    // Initialize
    // ========================================

    addPassenger();

    window.addEventListener("load", notifyContentHeight);
    window.addEventListener("resize", notifyContentHeight);

    if ("ResizeObserver" in window) {
        const passengerResizeObserver = new ResizeObserver(() => {
            notifyContentHeight();
        });

        passengerResizeObserver.observe(
            document.getElementById("passengerDetailsForm")
        );
    }
})();
