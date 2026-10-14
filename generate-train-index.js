
"use strict";

const fs = require("node:fs/promises");

const SOURCE_URL =
    "https://raw.githubusercontent.com/prasenjit-27/Indian-Railway-Data/main/trains.json";

const OUTPUT_FILE =
    "forms/train-selection/train-index.json";

async function generateTrainIndex() {
    console.log("Fetching source train data...");

    const response = await fetch(SOURCE_URL);

    if (!response.ok) {
        throw new Error(
            `Failed to fetch trains: HTTP ${response.status}`
        );
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
        throw new Error("Unexpected trains.json format.");
    }

    const index = data
        .filter(train =>
            train.trainNumber &&
            train.trainName
        )
        .map(train => ({
            trainNumber: String(train.trainNumber).trim(),
            trainName: String(train.trainName).trim(),
            source: {
                code: train.source?.code || "",
                name: train.source?.name || ""
            },
            destination: {
                code: train.destination?.code || "",
                name: train.destination?.name || ""
            }
        }));

    await fs.writeFile(
        OUTPUT_FILE,
        JSON.stringify(index),
        "utf8"
    );

    console.log(`Indexed ${index.length} trains.`);
    console.log(`Created: ${OUTPUT_FILE}`);
}

generateTrainIndex().catch(error => {
    console.error("Train index generation failed:", error);
    process.exitCode = 1;
});
