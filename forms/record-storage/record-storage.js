
"use strict";

window.RecordStorage = (() => {
    const DB_NAME = "IRCTCRecordDatabase";
    const STORE_NAME = "fileHandles";
    const HANDLE_KEY = "bookingRecordsFile";
    const DB_VERSION = 1;

    function openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(
                DB_NAME,
                DB_VERSION
            );

            request.onupgradeneeded = () => {
                const db = request.result;

                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function getFileHandle() {
        const db = await openDatabase();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(
                STORE_NAME,
                "readonly"
            );

            const request = transaction
                .objectStore(STORE_NAME)
                .get(HANDLE_KEY);

            request.onsuccess = () => {
                const handle = request.result || null;
                db.close();
                resolve(handle);
            };

            request.onerror = () => {
                db.close();
                reject(request.error);
            };
        });
    }

    async function saveFileHandle(handle) {
        const db = await openDatabase();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(
                STORE_NAME,
                "readwrite"
            );

            transaction.objectStore(STORE_NAME).put(
                handle,
                HANDLE_KEY
            );

            transaction.oncomplete = () => {
                db.close();
                resolve();
            };

            transaction.onerror = () => {
                db.close();
                reject(transaction.error);
            };
        });
    }

    async function requestWritePermission(handle) {
        let permission = await handle.queryPermission({
            mode: "readwrite"
        });

        if (permission !== "granted") {
            permission = await handle.requestPermission({
                mode: "readwrite"
            });
        }

        if (permission !== "granted") {
            throw new Error(
                "JSON file write permission was not granted."
            );
        }
    }

    async function selectJsonFile(mode) {
        if (mode === "open") {
            const [handle] = await window.showOpenFilePicker({
                multiple: false,
                types: [{
                    description: "JSON file",
                    accept: {
                        "application/json": [".json"]
                    }
                }]
            });

            return handle;
        }

        return window.showSaveFilePicker({
            suggestedName: "bookingRecords.json",
            types: [{
                description: "JSON file",
                accept: {
                    "application/json": [".json"]
                }
            }]
        });
    }


    async function readRecords() {
        if (!window.showOpenFilePicker) {
            throw new Error(
                "This browser does not support JSON file loading."
            );
        }

        // File Picker ద్వారా JSON file ఎంచుకో.
        const [handle] = await window.showOpenFilePicker({
            multiple: false,
            types: [{
                description: "JSON file",
                accept: {
                    "application/json": [".json"]
                }
            }]
        });

        // తర్వాత Save/Load కోసం file handle‌ను గుర్తుంచుకో.
        cachedFileHandle = handle;
        await saveFileHandle(handle);

        const file = await handle.getFile();
        const json = JSON.parse(await file.text());

        // Single record, records array, రెండింటినీ support చేయాలి.
        let records;

        if (Array.isArray(json)) {
            records = json;
        } else if (Array.isArray(json.bookingRecords)) {
            records = json.bookingRecords;
        } else if (
            json &&
            typeof json === "object" &&
            typeof json.id === "string"
        ) {
            records = [json];
        } else {
            throw new Error(
                "Invalid JSON file. A record object or records array is required."
            );
        }

        if (
            records.some(record =>
                !record ||
                typeof record !== "object" ||
                typeof record.id !== "string"
            )
        ) {
            throw new Error(
                "Invalid JSON record. Every record must have a string ID."
            );
        }

        return records;
    }



    let cachedFileHandle = null;

    async function initialize() {
        cachedFileHandle = await getFileHandle();
    }

    function prepareForWrite() {
        if (cachedFileHandle) {
            return Promise.resolve(cachedFileHandle);
        }

        if (!window.showSaveFilePicker) {
            return Promise.reject(
                new Error(
                    "This browser does not support JSON file saving."
                )
            );
        }

        // File picker‌ను user click సమయంలోనే తెరవాలి.
        return window.showSaveFilePicker({
            suggestedName: "bookingRecords.json",
            types: [{
                description: "JSON file",
                accept: {
                    "application/json": [".json"]
                }
            }]
        }).then(async handle => {
            cachedFileHandle = handle;
            await saveFileHandle(handle);
            return handle;
        });
    }




    async function writeRecords(records) {
        if (!window.showSaveFilePicker) {
            throw new Error(
                "This browser does not support JSON file saving."
            );
        }

        let handle = cachedFileHandle;

        if (!handle) {
            handle = await getFileHandle();
            cachedFileHandle = handle;
        }

        if (!handle) {
            throw new Error(
                "JSON file is not selected. Please select the file first."
            );
        }

        await requestWritePermission(handle);

        const writable = await handle.createWritable();

        try {
            await writable.write(
                JSON.stringify(
                    { bookingRecords: records },
                    null,
                    2
                )
            );

            await writable.close();
        } catch (error) {
            try {
                await writable.abort();
            } catch {
                // Preserve the original error.
            }

            throw error;
        }
    }



    return {
        initialize,
        prepareForWrite,
        readRecords,
        writeRecords
    };
})();
