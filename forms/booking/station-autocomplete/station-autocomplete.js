
"use strict";

(() => {
    const STATIONS_URL =
        "https://raw.githubusercontent.com/prasenjit-27/Indian-Railway-Data/main/stations.json";

    const MAX_SUGGESTIONS = 8;
    const DEBOUNCE_MS = 300;
    const MIN_QUERY_LENGTH = 2;
    const DROPDOWN_MIN_WIDTH = 200;
    const DROPDOWN_MAX_HEIGHT = 240;

    const inputs = [
        document.getElementById("fromStation"),
        document.getElementById("toStation")
    ].filter(Boolean);

    const displayByInputId = {
        fromStation: document.getElementById("fromStationSelectedName"),
        toStation: document.getElementById("toStationSelectedName")
    };

    let stations = [];
    let stationsPromise = null;

    // Parent dashboard integration for dropdown overlays.
    let parentDocument = document;
    let bookingFrame = null;

    try {
        if (window.parent !== window) {
            parentDocument = window.parent.document;
            bookingFrame = window.frameElement;
        }
    } catch (error) {
        console.warn(
            "Station dropdown will use the current document.",
            error
        );
    }

    // --------------------------------------------------
    // Common helpers
    // --------------------------------------------------

    function normalize(value) {
        return String(value || "").trim().toUpperCase();
    }

    function getDisplayElement(input) {
        return displayByInputId[input.id] || null;
    }

    function clearSelectedStationDisplay(input) {
        const display = getDisplayElement(input);

        if (display) {
            display.textContent = "";
            display.title = "";
        }
    }

    function showSelectedStationDisplay(input, station) {
        const display = getDisplayElement(input);

        if (!display) return;

        display.textContent = `${station.name} - ${station.code}`;
        display.title = `${station.name} - ${station.code}`;
    }

    function findStationByCode(code) {
        const normalizedCode = normalize(code);

        if (!normalizedCode) return null;

        return stations.find(
            station => normalize(station.code) === normalizedCode
        ) || null;
    }

    // --------------------------------------------------
    // Parent dashboard scrollbar styles
    // --------------------------------------------------

    function installStationScrollbarStyles() {
        if (
            parentDocument.getElementById(
                "irctcStationScrollbarStyles"
            )
        ) {
            return;
        }

        const style = parentDocument.createElement("style");
        style.id = "irctcStationScrollbarStyles";

        style.textContent = `
            .station-autocomplete-list {
                overflow-y: scroll !important;
                overflow-x: hidden !important;
                scrollbar-width: thin !important;
                scrollbar-color: #64748b #e2e8f0 !important;
            }

            .station-autocomplete-list::-webkit-scrollbar {
                width: 8px !important;
                height: 8px !important;
                -webkit-appearance: none;
            }

            .station-autocomplete-list::-webkit-scrollbar-track {
                background: #e2e8f0 !important;
                border-radius: 8px;
            }

            .station-autocomplete-list::-webkit-scrollbar-thumb {
                background: #64748b !important;
                border: 1px solid #e2e8f0 !important;
                border-radius: 8px !important;
            }

            .station-autocomplete-list::-webkit-scrollbar-thumb:hover {
                background: #475569 !important;
            }

            .station-autocomplete-list [role="option"] {
                white-space: normal !important;
                overflow-wrap: anywhere;
                box-sizing: border-box;
            }

            .station-autocomplete-list [role="option"] > div:first-child {
                white-space: normal !important;
                overflow-wrap: anywhere;
                font-weight: 600 !important;
            }

            .station-autocomplete-list [role="option"] .station-state {
                white-space: normal !important;
            }
        `;

        parentDocument.head.appendChild(style);
    }

    // --------------------------------------------------
    // Load station data
    // --------------------------------------------------

    async function loadStations() {
        if (stations.length) {
            return stations;
        }

        if (stationsPromise) {
            return stationsPromise;
        }

        stationsPromise = (async () => {
            const response = await fetch(STATIONS_URL, {
                method: "GET",
                cache: "default"
            });

            if (!response.ok) {
                throw new Error(
                    `Unable to load station data: HTTP ${response.status}`
                );
            }

            const data = await response.json();

            if (!Array.isArray(data)) {
                throw new Error("Unexpected stations.json format.");
            }

            stations = data
                .filter(item => item && item.code && item.name)
                .map(item => ({
                    code: normalize(item.code),
                    name: normalize(item.name).replace(
                        /\s+JN\.?$/,
                        " JN."
                    ),
                    state: String(item.state || "").trim()
                }));

            // Resolve station names for existing/saved station codes.
            inputs.forEach(input => {
                const station = findStationByCode(input.value);

                if (station) {
                    showSelectedStationDisplay(input, station);
                }
            });

            return stations;
        })();

        try {
            return await stationsPromise;
        } catch (error) {
            stationsPromise = null;
            throw error;
        }
    }

    // --------------------------------------------------
    // Station autocomplete
    // --------------------------------------------------

    function createAutocomplete(input) {
        const container = input.parentElement;

        if (!container) return;

        if (getComputedStyle(container).position === "static") {
            container.style.position = "relative";
        }

        // Create the dropdown in the dashboard document so it can
        // appear outside the booking iframe without being clipped.
        const dropdown = parentDocument.createElement("div");

        dropdown.className = "station-autocomplete-list";
        dropdown.hidden = true;
        dropdown.setAttribute("role", "listbox");

        Object.assign(dropdown.style, {
            position: "fixed",
            top: "0",
            left: "0",
            width: `${DROPDOWN_MIN_WIDTH}px`,
            maxHeight: `${DROPDOWN_MAX_HEIGHT}px`,
            overflowY: "scroll",
            overflowX: "hidden",
            scrollbarWidth: "thin",
            scrollbarColor: "#64748b #e2e8f0",
            background: "#ffffff",
            color: "#173b78",
            border: "1px solid #c3ccd8",
            borderRadius: "5px",
            boxShadow: "0 6px 18px rgba(0,0,0,.15)",
            zIndex: "2147483647",
            padding: "0",
            margin: "0",
            boxSizing: "border-box",
            fontFamily: "Arial, Helvetica, sans-serif"
        });

        installStationScrollbarStyles();
        parentDocument.body.appendChild(dropdown);

        // --------------------------------------------------
        // Position dropdown relative to its textbox
        // --------------------------------------------------






        function positionDropdown() {
            if (dropdown.hidden) return;

            const container = input.closest(".input-with-icon");
            if (!container) return;

            const containerRect = container.getBoundingClientRect();

            // Convert textbox coordinates to dashboard coordinates.
            let left = containerRect.left;
            let anchorTop = containerRect.top;
            let anchorBottom = containerRect.bottom;

            if (bookingFrame && parentDocument !== document) {
                const frameRect = bookingFrame.getBoundingClientRect();

                left = frameRect.left + containerRect.left;
                anchorTop = frameRect.top + containerRect.top;
                anchorBottom = frameRect.top + containerRect.bottom;
            }

            const viewportWidth =
                parentDocument.documentElement.clientWidth;

            const viewportHeight =
                parentDocument.documentElement.clientHeight;

            const gap = 4;
            const dropdownWidth = containerRect.width;

            // Keep dropdown aligned with the textbox.
            left = Math.max(
                0,
                Math.min(left, viewportWidth - dropdownWidth)
            );

            // Calculate available space around the textbox.
            const spaceBelow = Math.max(
                0,
                viewportHeight - anchorBottom - gap
            );

            const spaceAbove = Math.max(
                0,
                anchorTop - gap
            );

            const naturalHeight = Math.min(
                dropdown.scrollHeight,
                DROPDOWN_MAX_HEIGHT
            );

            // Prefer below when it fits; otherwise use the side with more space.
            const openAbove =
                spaceBelow < naturalHeight &&
                spaceAbove > spaceBelow;

            const availableSpace = openAbove ? spaceAbove : spaceBelow;

            const maxHeight = Math.min(
                DROPDOWN_MAX_HEIGHT,
                availableSpace
            );

            const top = openAbove
                ? anchorTop - maxHeight - gap
                : anchorBottom + gap;

            dropdown.style.position = "fixed";
            dropdown.style.left = `${left}px`;
            dropdown.style.top = `${Math.max(0, top)}px`;
            dropdown.style.width = `${dropdownWidth}px`;
            dropdown.style.maxHeight = `${maxHeight}px`;
        }






        let debounceTimer = null;
        let requestNumber = 0;
        let activeIndex = -1;
        let matches = [];

        // --------------------------------------------------
        // Dropdown controls
        // --------------------------------------------------

        function closeDropdown() {
            dropdown.hidden = true;
            dropdown.replaceChildren();

            matches = [];
            activeIndex = -1;

            input.setAttribute("aria-expanded", "false");
            input.removeAttribute("aria-activedescendant");
        }

        function showMessage(message) {
            dropdown.replaceChildren();

            const item = parentDocument.createElement("div");
            item.textContent = message;

            Object.assign(item.style, {
                padding: "10px 12px",
                fontSize: "13px",
                lineHeight: "1.3",
                color: "#64748b",
                background: "#ffffff",
                boxSizing: "border-box"
            });

            dropdown.appendChild(item);
            dropdown.hidden = false;

            input.setAttribute("aria-expanded", "true");
            positionDropdown();
        }

        function selectStation(station) {
            // Keep the code in the textbox for existing AutoFill logic.
            input.value = station.code;

            showSelectedStationDisplay(input, station);
            closeDropdown();

            input.dispatchEvent(
                new Event("change", { bubbles: true })
            );
        }

        // --------------------------------------------------
        // Keyboard navigation
        // --------------------------------------------------

        function setActiveIndex(index) {
            if (!matches.length) return;

            activeIndex = (index + matches.length) % matches.length;

            const options = dropdown.querySelectorAll(
                '[role="option"]'
            );

            options.forEach((option, optionIndex) => {
                const active = optionIndex === activeIndex;

                option.style.backgroundColor =
                    active ? "#2864e8" : "#ffffff";

                option.style.color =
                    active ? "#ffffff" : "#173b78";

                const stateLine =
                    option.querySelector(".station-state");

                if (stateLine) {
                    stateLine.style.color =
                        active ? "#ffffff" : "#64748b";
                }

                option.setAttribute(
                    "aria-selected",
                    String(active)
                );

                if (active) {
                    option.scrollIntoView({
                        block: "nearest"
                    });

                    input.setAttribute(
                        "aria-activedescendant",
                        option.id
                    );
                }
            });
        }

        // --------------------------------------------------
        // Render station suggestions
        // --------------------------------------------------

        function renderSuggestions(items) {
            dropdown.replaceChildren();

            matches = items;
            activeIndex = -1;

            if (!items.length) {
                showMessage("No matching stations found.");
                matches = [];
                return;
            }

            items.forEach((station, index) => {
                const option = parentDocument.createElement("button");

                option.type = "button";
                option.id =
                    `${input.id}-station-option-${index}`;

                option.setAttribute("role", "option");
                option.setAttribute("aria-selected", "false");


                Object.assign(option.style, {
                    display: "block",
                    width: "100%",
                    padding: "6px 10px",
                    margin: "0",
                    border: "0",
                    borderRadius: "0",
                    textAlign: "left",
                    backgroundColor: "#ffffff",
                    color: "#173b78",
                    cursor: "pointer",
                    fontFamily: "Arial, Helvetica, sans-serif",
                    fontSize: "13px",
                    lineHeight: "1.2",
                    transition: "background-color 0.15s ease",
                    whiteSpace: "normal",
                    overflowWrap: "anywhere",
                    boxSizing: "border-box",
                    height: "auto",
                    minHeight: "0"
                });


                const nameLine =
                    parentDocument.createElement("div");

                nameLine.textContent =
                    `${station.name} - ${station.code}`;

                Object.assign(nameLine.style, {
                    fontWeight: "600",
                    fontSize: "13px",
                    lineHeight: "1.2",
                    whiteSpace: "normal",
                    overflowWrap: "anywhere"
                });

                option.appendChild(nameLine);

                if (station.state) {
                    const stateLine =
                        parentDocument.createElement("div");

                    stateLine.className = "station-state";
                    stateLine.textContent =
                        station.state.toUpperCase();

                    Object.assign(stateLine.style, {
                        marginTop: "2px",
                        fontSize: "11px",
                        fontWeight: "500",
                        lineHeight: "1.2",
                        color: "#64748b",
                        whiteSpace: "normal"
                    });

                    option.appendChild(stateLine);
                    option.title =
                        `${station.name}, ${station.state}`;
                }

                option.addEventListener("mousedown", event => {
                    // Keep focus on the input until selection is made.
                    event.preventDefault();
                });

                option.addEventListener("mouseenter", () => {
                    setActiveIndex(index);
                });

                option.addEventListener("mouseleave", () => {
                    if (activeIndex === index) {
                        activeIndex = -1;

                        input.removeAttribute(
                            "aria-activedescendant"
                        );

                        option.style.backgroundColor = "#ffffff";
                        option.style.color = "#173b78";

                        const stateLine =
                            option.querySelector(".station-state");

                        if (stateLine) {
                            stateLine.style.color = "#64748b";
                        }

                        option.setAttribute(
                            "aria-selected",
                            "false"
                        );
                    }
                });

                option.addEventListener("click", () => {
                    selectStation(station);
                });

                dropdown.appendChild(option);
            });

            dropdown.hidden = false;

            input.setAttribute("aria-expanded", "true");
            positionDropdown();
        }

        // --------------------------------------------------
        // Search stations
        // --------------------------------------------------

        async function search(query, currentRequest) {
            try {
                const allStations = await loadStations();

                if (
                    currentRequest !== requestNumber ||
                    normalize(input.value) !== query
                ) {
                    return;
                }

                const queryParts = query.match(
                    /^(.*?)\s*-\s*([A-Z0-9]{1,5})(?:\s*\([^)]*\))?$/
                );

                const stationNameQuery = queryParts
                    ? normalize(queryParts[1])
                    : query;

                const stationCodeQuery = queryParts
                    ? normalize(queryParts[2])
                    : query;

                const results = allStations
                    .filter(station => {
                        const code = normalize(station.code);
                        const name = normalize(station.name);
                        const display = `${name} - ${code}`;

                        return (
                            code.startsWith(query) ||
                            name.includes(query) ||
                            display.includes(query) ||
                            (
                                queryParts &&
                                name.includes(stationNameQuery) &&
                                code.startsWith(stationCodeQuery)
                            )
                        );
                    })
                    .sort((a, b) => {
                        const aCode = normalize(a.code);
                        const bCode = normalize(b.code);
                        const aName = normalize(a.name);
                        const bName = normalize(b.name);

                        const aDisplay = `${aName} - ${aCode}`;
                        const bDisplay = `${bName} - ${bCode}`;

                        if (
                            aDisplay === query &&
                            bDisplay !== query
                        ) {
                            return -1;
                        }

                        if (
                            bDisplay === query &&
                            aDisplay !== query
                        ) {
                            return 1;
                        }

                        if (aCode === query && bCode !== query) {
                            return -1;
                        }

                        if (bCode === query && aCode !== query) {
                            return 1;
                        }

                        const aCodeMatch =
                            aCode.startsWith(stationCodeQuery);

                        const bCodeMatch =
                            bCode.startsWith(stationCodeQuery);

                        if (aCodeMatch !== bCodeMatch) {
                            return aCodeMatch ? -1 : 1;
                        }

                        const aNameMatch =
                            aName.startsWith(stationNameQuery);

                        const bNameMatch =
                            bName.startsWith(stationNameQuery);

                        if (aNameMatch !== bNameMatch) {
                            return aNameMatch ? -1 : 1;
                        }

                        return aName.localeCompare(bName);
                    })
                    .slice(0, MAX_SUGGESTIONS);

                renderSuggestions(results);
            } catch (error) {
                console.error(
                    "Station autocomplete error:",
                    error
                );

                if (currentRequest === requestNumber) {
                    showMessage(
                        "Unable to load stations. Check your internet connection."
                    );
                }
            }
        }

        // --------------------------------------------------
        // Input events
        // --------------------------------------------------

        input.setAttribute("autocomplete", "off");
        input.setAttribute("aria-autocomplete", "list");
        input.setAttribute("aria-expanded", "false");

        input.addEventListener("input", () => {
            const query = normalize(input.value);

            // Clear the old label when the user edits the station.
            clearSelectedStationDisplay(input);

            clearTimeout(debounceTimer);
            requestNumber++;

            if (query.length < MIN_QUERY_LENGTH) {
                closeDropdown();
                return;
            }

            const currentRequest = requestNumber;

            debounceTimer = setTimeout(() => {
                search(query, currentRequest);
            }, DEBOUNCE_MS);
        });

        input.addEventListener("change", async () => {
            try {
                const allStations = await loadStations();

                const station = allStations.find(
                    item => item.code === normalize(input.value)
                );

                if (station) {
                    showSelectedStationDisplay(input, station);
                }
            } catch (error) {
                console.warn(
                    "Could not resolve selected station name.",
                    error
                );
            }
        });

        input.addEventListener("keydown", event => {
            if (dropdown.hidden) return;

            if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex(activeIndex + 1);
            } else if (event.key === "ArrowUp") {
                event.preventDefault();

                setActiveIndex(
                    activeIndex < 0
                        ? matches.length - 1
                        : activeIndex - 1
                );
            } else if (
                event.key === "Enter" &&
                activeIndex >= 0 &&
                matches[activeIndex]
            ) {
                event.preventDefault();
                selectStation(matches[activeIndex]);
            } else if (event.key === "Escape") {
                closeDropdown();
            }
        });

        input.addEventListener("blur", () => {
            window.setTimeout(() => {
                if (
                    !container.contains(document.activeElement) &&
                    !dropdown.contains(parentDocument.activeElement)
                ) {
                    closeDropdown();
                }
            }, 150);
        });

        // Clicking elsewhere in the booking iframe closes the list.
        document.addEventListener("pointerdown", event => {
            if (
                !container.contains(event.target) &&
                !dropdown.contains(event.target)
            ) {
                closeDropdown();
            }
        });

        // Clicking elsewhere on the dashboard closes the list.
        parentDocument.addEventListener("pointerdown", event => {
            if (dropdown.contains(event.target)) return;

            // Clicks inside the booking iframe are handled above.
            if (event.target === bookingFrame) return;

            closeDropdown();
        });

        // Keep the overlay aligned during scrolling and resizing.
        window.addEventListener(
            "scroll",
            positionDropdown,
            true
        );

        window.addEventListener(
            "resize",
            positionDropdown
        );

        if (window.parent !== window) {
            window.parent.addEventListener(
                "scroll",
                positionDropdown,
                true
            );

            window.parent.addEventListener(
                "resize",
                positionDropdown
            );
        }
    }

    // --------------------------------------------------
    // Initialize
    // --------------------------------------------------

    inputs.forEach(createAutocomplete);

    // Load station data so prefilled/saved codes show their names.
    loadStations().catch(error => {
        console.warn(
            "Initial station-name lookup failed:",
            error
        );
    });
})();
