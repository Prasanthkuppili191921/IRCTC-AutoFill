
"use strict";

(() => {
    const MAX_SUGGESTIONS = 10;
    const DEBOUNCE_MS = 300;
    const MIN_QUERY_LENGTH = 2;

    const input = document.getElementById("preferredTrainNumber");
    const status = document.getElementById("trainSearchStatus");
    const localList = document.getElementById("trainSuggestions");

    if (!input || !status || !localList) {
        console.error("Train Info autocomplete elements were not found.");
        return;
    }

    // Access the parent dashboard. The extension pages must be same-origin.
    let parentDocument;
    let trainFrame;

    try {
        if (window.parent === window) {
            throw new Error(
                "Train Selection must be loaded inside the dashboard iframe."
            );
        }

        parentDocument = window.parent.document;
        trainFrame = window.frameElement;

        if (!trainFrame) {
            throw new Error("Train Selection iframe was not found.");
        }
    } catch (error) {
        console.error(
            "Unable to initialize the Train Info dropdown overlay:",
            error
        );
        return;
    }

    /*
     * Install the autocomplete CSS in the parent document.
     * The dropdown must live outside the iframe to avoid iframe clipping.
     */
    if (!parentDocument.getElementById("trainAutocompleteParentStyles")) {
        const styleLink = parentDocument.createElement("link");

        styleLink.id = "trainAutocompleteParentStyles";
        styleLink.rel = "stylesheet";
        styleLink.href = chrome.runtime.getURL(
            "forms/train-autocomplete/train-autocomplete.css"
        );

        parentDocument.head.appendChild(styleLink);
    }

    // Create the visible dropdown in the dashboard document.
    const list = parentDocument.createElement("ul");

    list.id = "trainSuggestionsOverlay";
    list.className = "train-suggestions";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Matching trains");
    list.hidden = true;

    parentDocument.body.appendChild(list);

    // Remove the old dropdown that was inside the iframe.
    localList.remove();

    let trains = [];
    let trainsPromise = null;
    let activeIndex = -1;
    let matches = [];
    let debounceTimer = null;
    let requestNumber = 0;

    function normalize(value) {
        return String(value || "").trim().toUpperCase();
    }

    /*
     * Position the parent-document dropdown directly under the input.
     * Both rectangles are viewport-relative, so their coordinates can
     * be combined to calculate the input's position on the dashboard.
     */
    function positionDropdown() {
        if (list.hidden || !trainFrame.isConnected) {
            return;
        }

        const frameRect = trainFrame.getBoundingClientRect();
        const inputRect = input.getBoundingClientRect();

        const left = frameRect.left + inputRect.left;
        const top = frameRect.top + inputRect.bottom + 4;

        list.style.position = "fixed";
        list.style.left = `${left}px`;
        list.style.top = `${top}px`;
        list.style.width = `${inputRect.width}px`;
        list.style.zIndex = "2147483647";
    }

    function closeDropdown() {
        list.hidden = true;
        list.replaceChildren();

        activeIndex = -1;

        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
    }

    function showMessage(message) {
        list.replaceChildren();

        const item = parentDocument.createElement("li");
        item.className = "train-suggestion";
        item.textContent = message;
        item.style.cursor = "default";

        list.appendChild(item);
        list.hidden = false;

        input.setAttribute("aria-expanded", "true");
        input.removeAttribute("aria-activedescendant");

        positionDropdown();
    }

    // Load the local train index once and reuse it.
    async function loadTrains() {
        if (trains.length > 0) {
            return trains;
        }

        if (trainsPromise) {
            return trainsPromise;
        }

        trainsPromise = (async () => {
            const response = await fetch(
                chrome.runtime.getURL(
                    "forms/train-selection/train-index.json"
                ),
                {
                    method: "GET",
                    cache: "default"
                }
            );

            if (!response.ok) {
                throw new Error(
                    `Unable to load train index: HTTP ${response.status}`
                );
            }

            const data = await response.json();

            if (!Array.isArray(data)) {
                throw new Error("Unexpected train-index.json format.");
            }

            return data
                .filter(train =>
                    train &&
                    train.trainNumber != null &&
                    String(train.trainNumber).trim() !== "" &&
                    train.trainName != null &&
                    String(train.trainName).trim() !== ""
                )
                .map(train => ({
                    trainNumber: String(train.trainNumber).trim(),
                    trainName: String(train.trainName).trim(),

                    source: {
                        code: String(train.source?.code || "").trim(),
                        name: String(train.source?.name || "").trim()
                    },

                    destination: {
                        code: String(
                            train.destination?.code || ""
                        ).trim(),
                        name: String(
                            train.destination?.name || ""
                        ).trim()
                    }
                }));
        })()
            .then(data => {
                trains = data;
                return trains;
            })
            .catch(error => {
                trainsPromise = null;
                throw error;
            });

        return trainsPromise;
    }

    function selectTrain(train) {
        const trainName = String(train.trainName || "").toUpperCase();
        const trainNumber = String(train.trainNumber || "").toUpperCase();

        input.value = `${trainName} (${trainNumber})`;
        input.classList.add("has-selected-train");

        input.dataset.selectedTrainNumber = train.trainNumber;
        input.dataset.selectedTrainName = train.trainName;
        input.dataset.selectedSourceCode = train.source.code;
        input.dataset.selectedSourceName = train.source.name;
        input.dataset.selectedDestinationCode =
            train.destination.code;
        input.dataset.selectedDestinationName =
            train.destination.name;

        closeDropdown();
        status.textContent = "";

        input.dispatchEvent(
            new Event("change", { bubbles: true })
        );
    }

    function setActiveIndex(index) {
        const options = list.querySelectorAll('[role="option"]');

        if (!options.length) {
            activeIndex = -1;
            return;
        }

        activeIndex = (index + options.length) % options.length;

        options.forEach((option, optionIndex) => {
            const active = optionIndex === activeIndex;

            option.classList.toggle("active", active);
            option.setAttribute("aria-selected", String(active));

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
        list.replaceChildren();
        activeIndex = -1;

        if (!items.length) {
            showMessage("No matching trains found.");
            return;
        }

        items.forEach((train, index) => {
            const option = parentDocument.createElement("li");

            option.id = `train-option-${index}`;
            option.className = "train-suggestion";
            option.setAttribute("role", "option");
            option.setAttribute("aria-selected", "false");

            const nameLine = parentDocument.createElement("div");
            nameLine.className = "train-suggestion-name";
            nameLine.textContent =
                `${train.trainName} (${train.trainNumber})`;

            const routeLine = parentDocument.createElement("div");
            routeLine.className = "train-suggestion-route";

            const source =
                train.source.name ||
                train.source.code ||
                "Unknown";

            const destination =
                train.destination.name ||
                train.destination.code ||
                "Unknown";

            routeLine.textContent = `${source} → ${destination}`;

            option.append(nameLine, routeLine);

            // Keep the input from losing its selection before click.
            option.addEventListener("mousedown", event => {
                event.preventDefault();
            });

            option.addEventListener("click", () => {
                selectTrain(train);
            });

            option.addEventListener("mouseenter", () => {
                setActiveIndex(index);
            });

            option.addEventListener("mouseleave", () => {
                if (activeIndex === index) {
                    activeIndex = -1;
                    option.classList.remove("active");
                    option.setAttribute("aria-selected", "false");
                    input.removeAttribute("aria-activedescendant");
                }
            });

            list.appendChild(option);
        });

        list.hidden = false;
        input.setAttribute("aria-expanded", "true");

        positionDropdown();
    }

function searchTrains(query) {
    const value = normalize(query);

    if (!value) {
        matches = [];
        closeDropdown();
        return;
    }

    matches = trains.filter(train => {
        const trainNumber = normalize(train.trainNumber);
        const trainName = normalize(train.trainName);
        const combinedValue = `${ trainName } (${ trainNumber })`;

        return (
            trainNumber.includes(value) ||
            trainName.includes(value) ||
            combinedValue.includes(value)
        );
    });

    matches = matches.slice(0, MAX_SUGGESTIONS);

    renderSuggestions(matches);
}

    async function performSearch(query, currentRequest) {
        try {
            status.textContent = "Loading train data...";

            await loadTrains();

            // Ignore stale results if the input changed during loading.
            if (
                currentRequest !== requestNumber ||
                normalize(input.value) !== query
            ) {
                return;
            }

            searchTrains(query);
            status.textContent = "";
        } catch (error) {
            console.error("Train autocomplete error:", error);

            if (currentRequest === requestNumber) {
                closeDropdown();
                status.textContent = "Unable to load train data.";
            }
        }
    }

    input.setAttribute("autocomplete", "off");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", list.id);

    input.addEventListener("input", () => {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const upperValue = input.value.toUpperCase();

        if (input.value !== upperValue) {
            input.value = upperValue;

            if (start !== null && end !== null) {
                input.setSelectionRange(start, end);
            }
        }

        if (!input.dataset.isEditing) {
            input.classList.remove("has-selected-train");
        }

        // A changed value invalidates the previous selection.
        delete input.dataset.selectedTrainNumber;
        delete input.dataset.selectedTrainName;
        delete input.dataset.selectedSourceCode;
        delete input.dataset.selectedSourceName;
        delete input.dataset.selectedDestinationCode;
        delete input.dataset.selectedDestinationName;

        clearTimeout(debounceTimer);

        const query = normalize(input.value);
        const currentRequest = ++requestNumber;

        closeDropdown();

        if (query.length < MIN_QUERY_LENGTH) {
            status.textContent = "";
            return;
        }

        debounceTimer = setTimeout(() => {
            performSearch(query, currentRequest);
        }, DEBOUNCE_MS);
    });

    input.addEventListener("keydown", event => {
        if (event.key === "ArrowDown" && !list.hidden) {
            event.preventDefault();
            setActiveIndex(activeIndex + 1);
        } else if (event.key === "ArrowUp" && !list.hidden) {
            event.preventDefault();

            setActiveIndex(
                activeIndex < 0
                    ? list.querySelectorAll('[role="option"]').length - 1
                    : activeIndex - 1
            );
        } else if (
            event.key === "Enter" &&
            !list.hidden &&
            activeIndex >= 0 &&
            matches[activeIndex]
        ) {
            event.preventDefault();
            selectTrain(matches[activeIndex]);
        } else if (event.key === "Escape") {
            closeDropdown();
        }
    });

    /*
     * Do not close on the iframe input's blur event.
     * Clicking a suggestion happens in the parent document, so blur
     * would otherwise close the dropdown before the click is handled.
     */

    // Close when the user clicks elsewhere on the dashboard.
    parentDocument.addEventListener("pointerdown", event => {
        if (
            event.target === trainFrame ||
            list.contains(event.target)
        ) {
            return;
        }

        closeDropdown();
    });

    input.addEventListener("blur", () => {
        // Allow the dropdown option click to complete first.
        setTimeout(() => {
            if (!list.matches(":hover")) {
                closeDropdown();
            }
        }, 150);
    });

    // Keep the dropdown aligned while either document scrolls/resizes.
    window.addEventListener("scroll", positionDropdown, true);
    window.addEventListener("resize", positionDropdown);

    window.parent.addEventListener("scroll", positionDropdown, true);
    window.parent.addEventListener("resize", positionDropdown);

    // API consumed by train-selection.js and dashboard.js.
    window.IRCTCTrainAutocomplete = {
        read() {
            return {
                trainNumber:
                    input.dataset.selectedTrainNumber || "",

                trainName:
                    input.dataset.selectedTrainName || "",

                sourceCode:
                    input.dataset.selectedSourceCode || "",

                sourceName:
                    input.dataset.selectedSourceName || "",

                destinationCode:
                    input.dataset.selectedDestinationCode || "",

                destinationName:
                    input.dataset.selectedDestinationName || ""
            };
        },

        populate(value = {}) {
            input.value =
                value.trainNumber && value.trainName
                    ? `${value.trainName} (${value.trainNumber})`
                    : value.trainNumber || value.trainName || "";

            delete input.dataset.selectedTrainNumber;
            delete input.dataset.selectedTrainName;
            delete input.dataset.selectedSourceCode;
            delete input.dataset.selectedSourceName;
            delete input.dataset.selectedDestinationCode;
            delete input.dataset.selectedDestinationName;

            if (value.trainNumber) {
                input.dataset.selectedTrainNumber =
                    String(value.trainNumber);
            }

            if (value.trainName) {
                input.dataset.selectedTrainName =
                    String(value.trainName);
            }

            if (value.sourceCode) {
                input.dataset.selectedSourceCode =
                    String(value.sourceCode);
            }

            if (value.sourceName) {
                input.dataset.selectedSourceName =
                    String(value.sourceName);
            }

            if (value.destinationCode) {
                input.dataset.selectedDestinationCode =
                    String(value.destinationCode);
            }

            if (value.destinationName) {
                input.dataset.selectedDestinationName =
                    String(value.destinationName);
            }

            closeDropdown();
            status.textContent = "";
        }
    };
})();
