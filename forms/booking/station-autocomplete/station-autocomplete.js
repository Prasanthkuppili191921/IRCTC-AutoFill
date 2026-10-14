
"use strict";

(() => {
    const STATIONS_URL =
        "https://raw.githubusercontent.com/prasenjit-27/Indian-Railway-Data/main/stations.json";

    const MAX_SUGGESTIONS = 8;
    const DEBOUNCE_MS = 300;
    const MIN_QUERY_LENGTH = 2;

    const inputs = [
        document.getElementById("fromStation"),
        document.getElementById("toStation")
    ].filter(Boolean);

    let stations = [];
    let stationsPromise = null;

    function normalize(value) {
        return String(value || "").trim().toUpperCase();
    }

    // Download station data into memory only once per page.
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
                    name: normalize(item.name),
                    state: String(item.state || "").trim()
                }));

            return stations;
        })();

        try {
            return await stationsPromise;
        } catch (error) {
            stationsPromise = null;
            throw error;
        }
    }

    function createAutocomplete(input) {
        const container = input.parentElement;

        if (!container) {
            return;
        }

        // Preserve the existing textbox and layout.
        if (getComputedStyle(container).position === "static") {
            container.style.position = "relative";
        }

        const dropdown = document.createElement("div");
        dropdown.className = "station-autocomplete-list";
        dropdown.hidden = true;
        dropdown.setAttribute("role", "listbox");

        Object.assign(dropdown.style, {
            position: "absolute",
            top: "calc(100% + 4px)",
            left: "0",
            right: "0",
            maxHeight: "240px",
            overflowY: "auto",
            background: "#ffffff",
            color: "#173b78",
            border: "1px solid #c3ccd8",
            borderRadius: "5px",
            boxShadow: "0 6px 18px rgba(0,0,0,.15)",
            zIndex: "2147483647"
        });

        container.appendChild(dropdown);

        let debounceTimer = null;
        let requestNumber = 0;
        let activeIndex = -1;
        let matches = [];

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

            const item = document.createElement("div");
            item.textContent = message;

            Object.assign(item.style, {
                padding: "10px 12px",
                fontSize: "13px",
                color: "#64748b"
            });

            dropdown.appendChild(item);
            dropdown.hidden = false;
            input.setAttribute("aria-expanded", "true");
        }

        function selectStation(station) {
            // Compatible with booking.js getStationCode().
            input.value =
                `${station.name} - ${station.code}`;

            closeDropdown();

            input.dispatchEvent(
                new Event("change", { bubbles: true })
            );
        }

        function setActiveIndex(index) {
            if (!matches.length) {
                return;
            }

            activeIndex =
                (index + matches.length) % matches.length;

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
                    option.scrollIntoView({ block: "nearest" });

                    input.setAttribute(
                        "aria-activedescendant",
                        option.id
                    );
                }
            });
        }

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
                const option = document.createElement("button");

                option.type = "button";
                option.id = `${input.id}-station-option-${index}`;
                option.setAttribute("role", "option");
                option.setAttribute("aria-selected", "false");

                Object.assign(option.style, {
                    display: "block",
                    width: "100%",
                    padding: "6px 10px",
                    border: "0",
                    textAlign: "left",
                    backgroundColor: "#ffffff",
                    color: "#173b78",
                    cursor: "pointer",
                    fontSize: "13px",
                    lineHeight: "1.2",
                    transition: "background-color 0.15s ease"
                });

                const nameLine = document.createElement("div");

                nameLine.textContent =
                    `${station.name} - ${station.code}`;

                Object.assign(nameLine.style, {
                    fontWeight: "600",
                    fontSize: "13px"
                });

                option.appendChild(nameLine);

                if (station.state) {
                    const stateLine = document.createElement("div");
                    stateLine.className = "station-state";

                    stateLine.textContent = station.state.toUpperCase();

                    Object.assign(stateLine.style, {
                        marginTop: "2px",
                        fontSize: "11px",
                        fontWeight: "500",
                        lineHeight: "1.2",
                        color: "#64748b"
                    });

                    option.appendChild(stateLine);

                    option.title = `${station.name}, ${station.state}`;
                }

                option.addEventListener("mousedown", event => {
                    event.preventDefault();
                });

                // Mouse hover uses the same color as keyboard selection.
                option.addEventListener("mouseenter", () => {
                    setActiveIndex(index);
                });

                option.addEventListener("mouseleave", () => {
                    if (activeIndex === index) {
                        activeIndex = -1;
                        input.removeAttribute("aria-activedescendant");

                        option.style.backgroundColor = "#ffffff";
                        option.style.color = "#173b78";

                        const stateLine =
                            option.querySelector(".station-state");

                        if (stateLine) {
                            stateLine.style.color = "#64748b";
                        }

                        option.setAttribute("aria-selected", "false");
                    }
                });

                option.addEventListener("click", () => {
                    selectStation(station);
                });

                dropdown.appendChild(option);
            });

            dropdown.hidden = false;
            input.setAttribute("aria-expanded", "true");
        }

        async function search(query, currentRequest) {
            try {
                const allStations = await loadStations();

                // Ignore stale results if the input changed meanwhile.
                if (
                    currentRequest !== requestNumber ||
                    normalize(input.value) !== query
                ) {
                    return;
                }

                const results = allStations
                    .filter(station =>
                        station.code.startsWith(query) ||
                        station.name.includes(query)
                    )
                    .sort((a, b) => {
                        // Exact code match first.
                        if (a.code === query && b.code !== query) {
                            return -1;
                        }

                        if (b.code === query && a.code !== query) {
                            return 1;
                        }

                        // Then codes starting with the query.
                        const aCodeMatch = a.code.startsWith(query);
                        const bCodeMatch = b.code.startsWith(query);

                        if (aCodeMatch !== bCodeMatch) {
                            return aCodeMatch ? -1 : 1;
                        }

                        return a.name.localeCompare(b.name);
                    })
                    .slice(0, MAX_SUGGESTIONS);

                renderSuggestions(results);
            } catch (error) {
                console.error("Station autocomplete error:", error);

                if (currentRequest === requestNumber) {
                    showMessage(
                        "Unable to load stations. Check your internet connection."
                    );
                }
            }
        }

        input.setAttribute("autocomplete", "off");
        input.setAttribute("aria-autocomplete", "list");
        input.setAttribute("aria-expanded", "false");

        input.addEventListener("input", () => {
            const query = normalize(input.value);

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

        input.addEventListener("keydown", event => {
            if (dropdown.hidden) {
                return;
            }

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
                if (!container.contains(document.activeElement)) {
                    closeDropdown();
                }
            }, 150);
        });

        document.addEventListener("pointerdown", event => {
            if (!container.contains(event.target)) {
                closeDropdown();
            }
        });
    }

    inputs.forEach(createAutocomplete);
})();
