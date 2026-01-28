/**
 * ASP.NET ViewState Editor
 * Allows editing decoded ViewState and re-encoding
 */

class ViewStateEditor {
    constructor() {
        this.currentData = null;
        this.stringTable = [];
    }

    /**
     * Set the decoded data for editing
     */
    setData(data) {
        this.currentData = data;
    }

    /**
     * Get the current data as formatted JSON
     */
    toJSON() {
        if (!this.currentData) return '';
        return JSON.stringify(this.currentData, null, 2);
    }

    /**
     * Parse JSON and update current data
     */
    fromJSON(jsonString) {
        try {
            this.currentData = JSON.parse(jsonString);
            return { success: true, data: this.currentData };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Validate JSON structure
     */
    validateJSON(jsonString) {
        try {
            JSON.parse(jsonString);
            return { valid: true };
        } catch (error) {
            // Extract line and column from error message if possible
            const match = error.message.match(/position (\d+)/);
            const position = match ? parseInt(match[1]) : null;

            let line = 1;
            let column = 1;

            if (position !== null) {
                const lines = jsonString.substring(0, position).split('\n');
                line = lines.length;
                column = lines[lines.length - 1].length + 1;
            }

            return {
                valid: false,
                error: error.message,
                line: line,
                column: column
            };
        }
    }

    /**
     * Format JSON with proper indentation
     */
    formatJSON(jsonString) {
        try {
            const parsed = JSON.parse(jsonString);
            return {
                success: true,
                formatted: JSON.stringify(parsed, null, 2)
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Encode data back to ViewState format
     * Note: This creates a simplified Base64 representation
     */
    encode() {
        if (!this.currentData) {
            return { success: false, error: 'No data to encode' };
        }

        try {
            this.stringTable = [];
            const serialized = this.serializeObject(this.currentData);

            // Add ViewState header (LosFormatter signature)
            const header = new Uint8Array([0xFF, 0x01]);
            const combined = new Uint8Array(header.length + serialized.length);
            combined.set(header);
            combined.set(serialized, header.length);

            // Convert to Base64
            let binary = '';
            for (let i = 0; i < combined.length; i++) {
                binary += String.fromCharCode(combined[i]);
            }
            const base64 = btoa(binary);

            return {
                success: true,
                encoded: base64,
                size: combined.length
            };
        } catch (error) {
            return {
                success: false,
                error: 'Encoding failed: ' + error.message
            };
        }
    }

    /**
     * Serialize an object to bytes
     */
    serializeObject(obj) {
        if (obj === null || obj === undefined) {
            return new Uint8Array([0x64]); // Null marker
        }

        if (typeof obj === 'boolean') {
            return new Uint8Array([obj ? 0x66 : 0x67]);
        }

        if (typeof obj === 'number') {
            if (Number.isInteger(obj) && obj >= 0 && obj <= 255) {
                return new Uint8Array([0x03, obj]); // Byte
            } else if (Number.isInteger(obj)) {
                return this.serializeInt32(obj);
            } else {
                return this.serializeDouble(obj);
            }
        }

        if (typeof obj === 'string') {
            return this.serializeString(obj);
        }

        if (Array.isArray(obj)) {
            return this.serializeArray(obj);
        }

        if (typeof obj === 'object') {
            // Check for Pair
            if (obj.type === 'Pair') {
                return this.serializePair(obj);
            }
            // Check for Triplet
            if (obj.type === 'Triplet') {
                return this.serializeTriplet(obj);
            }
            // Regular object - serialize as Hashtable
            return this.serializeHashtable(obj);
        }

        // Fallback - convert to string
        return this.serializeString(String(obj));
    }

    /**
     * Serialize 32-bit integer
     */
    serializeInt32(value) {
        const result = [0x02]; // Int32 marker
        result.push(...this.encode7BitInt(value));
        return new Uint8Array(result);
    }

    /**
     * Encode integer as 7-bit
     */
    encode7BitInt(value) {
        const bytes = [];
        while (value >= 128) {
            bytes.push((value & 0x7F) | 0x80);
            value >>>= 7;
        }
        bytes.push(value);
        return bytes;
    }

    /**
     * Serialize double
     */
    serializeDouble(value) {
        const bytes = new Uint8Array(9);
        bytes[0] = 0x07; // Double marker
        const view = new DataView(bytes.buffer);
        view.setFloat64(1, value, true);
        return bytes;
    }

    /**
     * Serialize string
     */
    serializeString(str) {
        const encoder = new TextEncoder();
        const strBytes = encoder.encode(str);
        const lengthBytes = this.encode7BitInt(strBytes.length);

        const result = new Uint8Array(1 + lengthBytes.length + strBytes.length);
        result[0] = 0x05; // String marker
        result.set(lengthBytes, 1);
        result.set(strBytes, 1 + lengthBytes.length);

        return result;
    }

    /**
     * Serialize array
     */
    serializeArray(arr) {
        const parts = [];
        parts.push(0x6A); // Array marker
        parts.push(...this.encode7BitInt(arr.length));

        for (const item of arr) {
            const serialized = this.serializeObject(item);
            for (let i = 0; i < serialized.length; i++) {
                parts.push(serialized[i]);
            }
        }

        return new Uint8Array(parts);
    }

    /**
     * Serialize Pair
     */
    serializePair(pair) {
        const parts = [];
        parts.push(0x68); // Pair marker

        const first = this.serializeObject(pair.first);
        const second = this.serializeObject(pair.second);

        for (let i = 0; i < first.length; i++) parts.push(first[i]);
        for (let i = 0; i < second.length; i++) parts.push(second[i]);

        return new Uint8Array(parts);
    }

    /**
     * Serialize Triplet
     */
    serializeTriplet(triplet) {
        const parts = [];
        parts.push(0x69); // Triplet marker

        const first = this.serializeObject(triplet.first);
        const second = this.serializeObject(triplet.second);
        const third = this.serializeObject(triplet.third);

        for (let i = 0; i < first.length; i++) parts.push(first[i]);
        for (let i = 0; i < second.length; i++) parts.push(second[i]);
        for (let i = 0; i < third.length; i++) parts.push(third[i]);

        return new Uint8Array(parts);
    }

    /**
     * Serialize Hashtable/Dictionary
     */
    serializeHashtable(obj) {
        const keys = Object.keys(obj).filter(k => k !== 'type');
        const parts = [];
        parts.push(0x17); // Hashtable marker
        parts.push(...this.encode7BitInt(keys.length));

        for (const key of keys) {
            const keyBytes = this.serializeString(key);
            const valBytes = this.serializeObject(obj[key]);

            for (let i = 0; i < keyBytes.length; i++) parts.push(keyBytes[i]);
            for (let i = 0; i < valBytes.length; i++) parts.push(valBytes[i]);
        }

        return new Uint8Array(parts);
    }
}

// Export for use in other modules
window.ViewStateEditor = ViewStateEditor;
