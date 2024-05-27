"use strict";
var EPKLib;
(function (EPKLib) {
    let PassedResourceType;
    (function (PassedResourceType) {
        PassedResourceType["URL"] = "URL";
        PassedResourceType["DATA"] = "DATA";
    })(PassedResourceType || (PassedResourceType = {}));
    function getParentUrl(path) {
        const currentUrl = window.location.href;
        let url;
        if (path.includes('://')) {
            url = new URL(path);
        }
        else {
            url = new URL(path, currentUrl);
        }
        const segments = url.pathname.split('/');
        segments.pop();
        url.pathname = segments.join('/');
        return url;
    }
    EPKLib.getParentUrl = getParentUrl;
    function isAbsoluteUrl(url) {
        return /^(https?:)?\/\//i.test(url) || /^[^/]+\//.test(url);
    }
    EPKLib.isAbsoluteUrl = isAbsoluteUrl;
    function joinUrls(baseUrl, pathSegment) {
        const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
        const joinedUrl = new URL(pathSegment, base).toString();
        return joinedUrl;
    }
    EPKLib.joinUrls = joinUrls;
    function stringifyBlob(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result;
                resolve(result);
            };
            reader.onerror = () => {
                reject(reader.error);
            };
            reader.readAsText(blob);
        });
    }
    EPKLib.stringifyBlob = stringifyBlob;
    async function compileLargeEPK(filename, file, segmentMaxSize, sha256Hash) {
        const output = {
            directoryFile: undefined,
            files: [],
        }, rawMeta = {
            filename,
            segments: [],
            hash: sha256Hash
        };
        const view = new Uint8Array(file), chunkCount = Math.ceil(file.byteLength / segmentMaxSize);
        for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
            const begin = chunkIndex * segmentMaxSize, end = Math.min(begin + segmentMaxSize, view.byteLength), chunk = view.slice(begin, end), outFileName = `${filename.replace(/[^\x00-\x7F]/g, "")}.${chunkIndex}.seg`;
            output.files.push({
                filename: outFileName,
                data: chunk,
            });
            rawMeta.segments.push(outFileName);
        }
        output.directoryFile = JSON.stringify(rawMeta);
        return output;
    }
    EPKLib.compileLargeEPK = compileLargeEPK;
    class LargeEPK {
        constructor(resource, resourceType) {
            this.partial = true;
            if (resourceType == PassedResourceType.URL) {
                if (resource instanceof Blob) {
                    throw new TypeError(`Resource of type Blob is not allowed when resourceType is set to URL.`);
                }
                this.url = resource;
            }
            else if (resourceType == PassedResourceType.DATA) {
                if (resource instanceof URL) {
                    throw new TypeError(`Resource of type URL is not allowed when resourceType is set to DATA.`);
                }
                else if (resource instanceof Blob || typeof resource == "string") {
                    this.rawData = resource;
                }
            }
            else {
                throw new TypeError("resourceType must be one of the following values: DATA, URL.");
            }
        }
        async fetchMetadata() {
            if (!this.partial) {
                throw new Error("Metadata has already been fetched - you can't call fetchMeta() twice!");
            }
            if (this.url != null) {
                this.rawData = await (await fetch(this.url)).text();
            }
            if (this.rawData instanceof Blob) {
                this.rawData = await stringifyBlob(this.rawData);
            }
            const metadata = JSON.parse(this.rawData);
            if (metadata.filename == null || typeof metadata.filename != "string") {
                throw new TypeError("metadata.filename must be a string!");
            }
            if (metadata.segments == null ||
                metadata.segments instanceof Array == false) {
                throw new TypeError("metadata.segments must be an non-empty string array!");
            }
            else {
                if (metadata.segments.length == 0) {
                    throw new TypeError("metadata.segments cannot be empty!");
                }
                for (const segment of metadata.segments) {
                    if (typeof segment != "string") {
                        throw new TypeError(`metadata.segments[${metadata.segments.indexOf(segment)}] must be a string!`);
                    }
                }
            }
            if (metadata.hash == null || typeof metadata.hash != "string") {
                throw new TypeError("metadata.hash must be a string!");
            }
            this.hash = metadata.hash;
            this.filename = metadata.filename;
            this.segments = metadata.segments.map((segment) => new LargeEPKSegment(isAbsoluteUrl(segment) ? segment : this.url != null ? segment.startsWith('/') ? new URL(segment, window.location.href) : joinUrls(getParentUrl(this.url instanceof URL ? this.url.toString() : this.url).toString(), segment) : segment));
            return this;
        }
        fetch() {
            if (this.segments === null) {
                throw new TypeError("Segments not initialized");
            }
            const eventTarget = new EventTarget();
            const promiseMeta = {};
            const ret = {
                percent: 0,
                progressCallback: eventTarget,
                promise: new Promise((res, rej) => {
                    promiseMeta.res = res;
                    promiseMeta.rej = rej;
                })
            };
            let loaded = 0;
            const total = this.segments.length;
            this.segments.forEach((segment) => {
                const { promise: segmentPromise, eventTarget: segmentEventTarget } = segment.fetchSegment();
                // Listen for "progress" events from each segment
                segmentEventTarget.addEventListener("progress", (event) => {
                    const progressEvent = new Event("progress");
                    const overallPercent = (loaded + (this.segments.filter(seg => seg.data == null).reduce((pv, cv) => pv + (cv.progress / 100), 0))) * (100 / this.segments.length);
                    progressEvent.overallPercent = overallPercent;
                    eventTarget.dispatchEvent(progressEvent);
                });
                segmentPromise.then(() => {
                    loaded++;
                    if (loaded === total) {
                        promiseMeta.res(this);
                    }
                }).catch(err => {
                    promiseMeta.rej(err);
                });
            });
            return ret;
        }
        getComplete() {
            let buffer = null;
            for (const segment of this.segments) {
                if (segment.data != null) {
                    if (!buffer) {
                        buffer = segment.data;
                    }
                    else {
                        const oldBuffer = buffer, newBuffer = segment.data;
                        const tmp = new Uint8Array(oldBuffer.byteLength + newBuffer.byteLength);
                        tmp.set(new Uint8Array(oldBuffer), 0);
                        tmp.set(new Uint8Array(newBuffer), oldBuffer.byteLength);
                        buffer = tmp.buffer;
                    }
                }
                else {
                    throw new Error("One or more LargeEPKSegment(s) haven't been fetched yet. Did you fall fetch() beforehand?");
                }
            }
            return buffer;
        }
        disposeFetchedSegments() {
            if (this.segments == null) {
                throw new Error("Segments are null!");
            }
            this.segments.forEach(segment => segment.dispose());
            return this;
        }
    }
    EPKLib.LargeEPK = LargeEPK;
    class LargeEPKSegment {
        constructor(url) {
            this.url = url;
            this.progress = 0;
        }
        dispose() {
            this.data = undefined;
            return this;
        }
        fetchSegment() {
            if (this.data != null) {
                throw new TypeError("Cannot call fetchSegment() twice!");
            }
            const eventTarget = new EventTarget();
            const ret = {
                promise: undefined,
                percent: 100, // Finished
                eventTarget,
            };
            const promise = new Promise(async (res) => {
                const response = await fetch(this.url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
                }
                const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
                let loaded = 0;
                if (response.body == null) {
                    throw new Error("response.body is null! This shouldn't happen!");
                }
                const reader = response.body.getReader();
                let data = [];
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    if (value instanceof Blob) {
                        const arrayBuffer = await new Response(value).arrayBuffer();
                        data.push(new Uint8Array(arrayBuffer));
                    }
                    else {
                        data.push(value);
                    }
                    loaded += value.length;
                    const percent = (loaded / contentLength) * 100;
                    // Dispatch a "progress" event with the percentage
                    const progressEvent = new Event("progress");
                    ;
                    progressEvent.percent = percent;
                    ret.percent = percent;
                    this.progress = percent;
                    eventTarget.dispatchEvent(progressEvent);
                }
                let totalLength = 0;
                data.forEach((arr) => {
                    totalLength += arr.byteLength;
                });
                const concatenatedArray = new Uint8Array(totalLength);
                let offset = 0;
                data.forEach((arr) => {
                    concatenatedArray.set(arr, offset);
                    offset += arr.length;
                });
                this.data = concatenatedArray;
                res(this);
            });
            ret.promise = Promise.resolve(promise);
            return ret;
        }
    }
    EPKLib.LargeEPKSegment = LargeEPKSegment;
})(EPKLib || (EPKLib = {}));
