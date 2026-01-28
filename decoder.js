/**
 * ASP.NET ViewState Decoder
 * Decodes Base64-encoded ViewState strings into readable structures
 * Supports complex ViewState with embedded .NET serialized objects
 */

class ViewStateDecoder {
    constructor() {
        this.position = 0;
        this.data = null;
        this.stats = {
            pairs: 0,
            triplets: 0,
            arrays: 0,
            strings: 0,
            integers: 0,
            booleans: 0,
            objects: 0
        };
        this.stringTable = [];
        this.typeTable = [];
    }

    /**
     * Main decode function - entry point
     * @param {string} viewStateString - Base64 encoded ViewState
     * @returns {object} Decoded ViewState structure
     */
    decode(viewStateString) {
        // Reset state
        this.position = 0;
        this.stringTable = [];
        this.typeTable = [];
        this.stats = {
            pairs: 0,
            triplets: 0,
            arrays: 0,
            strings: 0,
            integers: 0,
            booleans: 0,
            objects: 0
        };

        // Clean the input
        let cleanedInput = viewStateString.trim();

        // Handle URL encoding
        if (cleanedInput.includes('%')) {
            try {
                cleanedInput = decodeURIComponent(cleanedInput);
            } catch (e) {
                // Keep original if decode fails
            }
        }

        try {
            // Decode Base64
            const binaryString = atob(cleanedInput);
            this.data = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                this.data[i] = binaryString.charCodeAt(i);
            }

            // Parse the ViewState
            const result = this.parseViewState();

            return {
                success: true,
                data: result,
                stats: this.stats,
                rawSize: this.data.length
            };
        } catch (error) {
            // Fallback: extract readable content
            return this.fallbackDecode(cleanedInput, error);
        }
    }

    /**
     * Fallback decoder - extracts readable strings and structured data
     */
    fallbackDecode(input, originalError) {
        try {
            const binaryString = atob(input);
            this.data = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                this.data[i] = binaryString.charCodeAt(i);
            }

            // Extract all readable content
            const extracted = this.extractAllContent(binaryString);

            return {
                success: true,
                data: extracted,
                stats: this.stats,
                rawSize: this.data.length,
                note: 'Parsed using content extraction mode'
            };
        } catch (e) {
            return {
                success: false,
                error: 'Unable to decode ViewState: ' + originalError.message,
                suggestion: 'Make sure the input is a valid Base64-encoded ASP.NET ViewState string'
            };
        }
    }

    /**
     * Extract all meaningful content from binary data
     */
    extractAllContent(binaryString) {
        const result = {
            type: 'ViewState',
            format: 'LosFormatter',
            content: {}
        };

        // Look for embedded XML
        const xmlMatches = this.extractXmlContent(binaryString);
        if (xmlMatches.length > 0) {
            result.content.xmlSchemas = xmlMatches;
        }

        // Look for .NET type information
        const typeInfo = this.extractTypeInfo(binaryString);
        if (typeInfo.length > 0) {
            result.content.dotNetTypes = typeInfo;
        }

        // Extract readable strings
        const strings = this.extractReadableStrings(binaryString);
        if (strings.length > 0) {
            result.content.strings = strings;
        }

        // Try to parse as structured ViewState
        this.position = 0;
        try {
            const structured = this.parseViewState();
            if (structured && Object.keys(structured).length > 0) {
                result.content.structure = structured;
            }
        } catch (e) {
            // Structure parsing failed, continue with extracted content
        }

        return result;
    }

    /**
     * Extract XML content (schemas, diffgrams)
     */
    extractXmlContent(binaryString) {
        const xmlParts = [];
        const xmlRegex = /<\?xml[^>]*\?>[\s\S]*?(?=<\?xml|$)|<xs:schema[\s\S]*?<\/xs:schema>|<diffgr:diffgram[\s\S]*?<\/diffgr:diffgram>/gi;

        // Find XML-like content
        let startIndex = 0;
        while (true) {
            const xmlStart = binaryString.indexOf('<?xml', startIndex);
            const schemaStart = binaryString.indexOf('<xs:schema', startIndex);
            const diffStart = binaryString.indexOf('<diffgr:', startIndex);

            let foundStart = -1;
            let type = '';

            if (xmlStart !== -1 && (schemaStart === -1 || xmlStart < schemaStart) && (diffStart === -1 || xmlStart < diffStart)) {
                foundStart = xmlStart;
                type = 'xml';
            } else if (schemaStart !== -1 && (diffStart === -1 || schemaStart < diffStart)) {
                foundStart = schemaStart;
                type = 'schema';
            } else if (diffStart !== -1) {
                foundStart = diffStart;
                type = 'diffgram';
            }

            if (foundStart === -1) break;

            // Find the end of this XML block
            let endTag = '';
            if (type === 'xml' || type === 'schema') {
                endTag = '</xs:schema>';
            } else {
                endTag = '</diffgr:diffgram>';
            }

            let endIndex = binaryString.indexOf(endTag, foundStart);
            if (endIndex === -1) {
                // Try to find any closing tag
                endIndex = Math.min(foundStart + 5000, binaryString.length);
            } else {
                endIndex += endTag.length;
            }

            const xmlContent = binaryString.substring(foundStart, endIndex);
            if (xmlContent.length > 20) {
                // Parse the XML to extract meaningful data
                const parsed = this.parseXmlSchema(xmlContent);
                xmlParts.push(parsed);
            }

            startIndex = endIndex;
        }

        return xmlParts;
    }

    /**
     * Parse XML schema to extract column/field definitions
     */
    parseXmlSchema(xmlContent) {
        const result = {
            type: 'DataTable Schema',
            tables: [],
            columns: []
        };

        // Extract table name
        const tableMatch = xmlContent.match(/element name="([^"]+)"/);
        if (tableMatch) {
            result.tableName = tableMatch[1];
        }

        // Extract column definitions
        const columnRegex = /element name="([^"]+)"[^>]*(?:type="([^"]+)")?/g;
        let match;
        while ((match = columnRegex.exec(xmlContent)) !== null) {
            if (match[1] !== result.tableName && !match[1].includes('DataSet')) {
                result.columns.push({
                    name: match[1],
                    type: match[2] || 'string'
                });
            }
        }

        // Check for diffgram data
        if (xmlContent.includes('<diffgr:diffgram')) {
            result.hasDiffgram = true;
        }

        return result;
    }

    /**
     * Extract .NET type information
     */
    extractTypeInfo(binaryString) {
        const types = [];

        // Common .NET type patterns
        const typePatterns = [
            /System\.Data\.DataTable/g,
            /System\.Data\.DataSet/g,
            /System\.Version/g,
            /System\.[A-Za-z.]+/g
        ];

        const seen = new Set();
        for (const pattern of typePatterns) {
            let match;
            while ((match = pattern.exec(binaryString)) !== null) {
                if (!seen.has(match[0])) {
                    seen.add(match[0]);
                    types.push(match[0]);
                }
            }
        }

        return types;
    }

    /**
     * Extract readable strings from binary data
     */
    extractReadableStrings(binaryString) {
        const strings = [];
        let current = '';

        for (let i = 0; i < binaryString.length; i++) {
            const charCode = binaryString.charCodeAt(i);
            // Printable ASCII range
            if (charCode >= 32 && charCode <= 126) {
                current += binaryString[i];
            } else {
                if (current.length >= 4 && !current.startsWith('<?xml') && !current.includes('<xs:')) {
                    // Filter out XML and common noise
                    if (!this.isNoiseString(current)) {
                        strings.push(current);
                    }
                }
                current = '';
            }
        }

        if (current.length >= 4 && !this.isNoiseString(current)) {
            strings.push(current);
        }

        // Deduplicate and limit
        const unique = [...new Set(strings)];
        return unique.slice(0, 200);
    }

    /**
     * Check if string is noise (common repeated patterns)
     */
    isNoiseString(str) {
        const noisePatterns = [
            /^[0-9]+$/,
            /^[A-F0-9]+$/i,
            /^(AA|==)+$/,
            /^[+\/=]+$/,
            /^ctl[0-9]+$/,
            /^ImageButton[0-9]+$/
        ];

        return noisePatterns.some(p => p.test(str));
    }

    /**
     * Parse ViewState binary format
     */
    parseViewState() {
        if (this.data.length === 0) {
            throw new Error('Empty ViewState data');
        }

        // Read format marker
        const marker = this.readByte();

        if (marker === 0xFF) {
            // LosFormatter with version
            const version = this.readByte();
            return this.parseObject();
        } else {
            // Reset and try as ObjectStateFormatter
            this.position = 0;
            return this.parseObject();
        }
    }

    /**
     * Read a single byte
     */
    readByte() {
        if (this.position >= this.data.length) {
            return 0;
        }
        return this.data[this.position++];
    }

    /**
     * Peek at next byte without advancing
     */
    peekByte() {
        if (this.position >= this.data.length) {
            return -1;
        }
        return this.data[this.position];
    }

    /**
     * Read a 7-bit encoded integer
     */
    read7BitEncodedInt() {
        let result = 0;
        let shift = 0;
        let byte;

        do {
            if (shift >= 35 || this.position >= this.data.length) {
                return result;
            }
            byte = this.readByte();
            result |= (byte & 0x7F) << shift;
            shift += 7;
        } while ((byte & 0x80) !== 0);

        return result;
    }

    /**
     * Read a length-prefixed string
     */
    readString() {
        const length = this.read7BitEncodedInt();
        if (length === 0 || length > 100000) return '';

        const available = Math.min(length, this.data.length - this.position);
        if (available <= 0) return '';

        const bytes = this.data.slice(this.position, this.position + available);
        this.position += available;

        try {
            this.stats.strings++;
            return new TextDecoder('utf-8').decode(bytes);
        } catch {
            return String.fromCharCode.apply(null, Array.from(bytes));
        }
    }

    /**
     * Read raw bytes
     */
    readBytes(count) {
        const available = Math.min(count, this.data.length - this.position);
        const bytes = this.data.slice(this.position, this.position + available);
        this.position += available;
        return bytes;
    }

    /**
     * Parse an object based on type marker
     */
    parseObject() {
        if (this.position >= this.data.length) {
            return null;
        }

        const typeMarker = this.readByte();

        switch (typeMarker) {
            case 0x01: // Int16
                return this.parseInt16();

            case 0x02: // Int32 (7-bit encoded)
                this.stats.integers++;
                return this.read7BitEncodedInt();

            case 0x03: // Byte
                this.stats.integers++;
                return this.readByte();

            case 0x04: // Char
                return String.fromCharCode(this.readByte());

            case 0x05: // String
                return this.readString();

            case 0x06: // DateTime
                return this.parseDateTime();

            case 0x07: // Double
                return this.parseDouble();

            case 0x08: // Float
                return this.parseFloat();

            case 0x09: // Color
                return this.parseColor();

            case 0x0A: // Empty
                return null;

            case 0x0B: // True
                this.stats.booleans++;
                return true;

            case 0x0C: // False  
                this.stats.booleans++;
                return false;

            case 0x0F: // Pair
                return this.parsePair();

            case 0x10: // Triplet
                return this.parseTriplet();

            case 0x14: // Array
            case 0x15: // StringArray
                return this.parseArray();

            case 0x16: // ArrayList
                return this.parseArrayList();

            case 0x17: // Hashtable
            case 0x18: // HybridDictionary
                return this.parseHashtable();

            case 0x19: // Type
                return this.parseType();

            case 0x1B: // Unit
                return this.parseUnit();

            case 0x1E: // Indexed string write
                const str = this.readString();
                this.stringTable.push(str);
                return str;

            case 0x1F: // Indexed string reference
                const idx = this.read7BitEncodedInt();
                return this.stringTable[idx] || `<StringRef:${idx}>`;

            case 0x28: // Sparse array
                return this.parseSparseArray();

            case 0x29: // Binary serialized object
            case 0x2A: // Binary serialized object
                return this.parseBinaryObject();

            case 0x32: // Typed array reference
                return this.parseTypedArray();

            case 0x3C: // Known type from table
                return this.parseKnownType();

            case 0x64: // Null constant
                return null;

            case 0x65: // Empty string constant
                return '';

            case 0x66: // Zero int constant
                this.stats.integers++;
                return 0;

            case 0x67: // Boolean true constant  
                this.stats.booleans++;
                return true;

            case 0x68: // Boolean false constant
                this.stats.booleans++;
                return false;

            default:
                // Try to recover by skipping unknown markers
                return this.tryRecoverParse(typeMarker);
        }
    }

    /**
     * Parse Int16
     */
    parseInt16() {
        this.stats.integers++;
        const b1 = this.readByte();
        const b2 = this.readByte();
        return (b2 << 8) | b1;
    }

    /**
     * Parse DateTime
     */
    parseDateTime() {
        const bytes = this.readBytes(8);
        if (bytes.length < 8) return '<DateTime>';

        try {
            let ticks = 0n;
            for (let i = 0; i < 8; i++) {
                ticks |= BigInt(bytes[i]) << BigInt(i * 8);
            }
            const epochDiff = 621355968000000000n;
            const jsTimestamp = Number((ticks - epochDiff) / 10000n);
            return new Date(jsTimestamp).toISOString();
        } catch {
            return '<DateTime>';
        }
    }

    /**
     * Parse Double
     */
    parseDouble() {
        const bytes = this.readBytes(8);
        if (bytes.length < 8) return 0;
        return new DataView(bytes.buffer).getFloat64(0, true);
    }

    /**
     * Parse Float
     */
    parseFloat() {
        const bytes = this.readBytes(4);
        if (bytes.length < 4) return 0;
        return new DataView(bytes.buffer).getFloat32(0, true);
    }

    /**
     * Parse Color
     */
    parseColor() {
        const argb = this.read7BitEncodedInt();
        const a = (argb >> 24) & 0xFF;
        const r = (argb >> 16) & 0xFF;
        const g = (argb >> 8) & 0xFF;
        const b = argb & 0xFF;
        return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`;
    }

    /**
     * Parse Pair
     */
    parsePair() {
        this.stats.pairs++;
        const first = this.parseObject();
        const second = this.parseObject();
        return {
            type: 'Pair',
            first,
            second
        };
    }

    /**
     * Parse Triplet
     */
    parseTriplet() {
        this.stats.triplets++;
        const first = this.parseObject();
        const second = this.parseObject();
        const third = this.parseObject();
        return {
            type: 'Triplet',
            first,
            second,
            third
        };
    }

    /**
     * Parse Array
     */
    parseArray() {
        this.stats.arrays++;
        const length = this.read7BitEncodedInt();
        if (length > 10000) return [];

        const array = [];
        for (let i = 0; i < length && this.position < this.data.length; i++) {
            array.push(this.parseObject());
        }
        return array;
    }

    /**
     * Parse ArrayList
     */
    parseArrayList() {
        this.stats.arrays++;
        const count = this.read7BitEncodedInt();
        if (count > 10000) return [];

        const list = [];
        for (let i = 0; i < count && this.position < this.data.length; i++) {
            list.push(this.parseObject());
        }
        return list;
    }

    /**
     * Parse Hashtable
     */
    parseHashtable() {
        const count = this.read7BitEncodedInt();
        if (count > 10000) return {};

        const result = {};
        for (let i = 0; i < count && this.position < this.data.length; i++) {
            const key = this.parseObject();
            const value = this.parseObject();
            result[String(key)] = value;
        }
        return result;
    }

    /**
     * Parse Type reference
     */
    parseType() {
        this.stats.objects++;
        const typeName = this.readString();
        this.typeTable.push(typeName);
        return { type: 'TypeRef', name: typeName };
    }

    /**
     * Parse Unit (CSS)
     */
    parseUnit() {
        const value = this.parseDouble();
        const unitType = this.read7BitEncodedInt();
        const units = ['', 'px', 'pt', '%', 'em', 'ex', 'mm', 'cm', 'in', 'pc'];
        return `${value}${units[unitType] || ''}`;
    }

    /**
     * Parse Sparse Array
     */
    parseSparseArray() {
        this.stats.arrays++;
        const length = this.read7BitEncodedInt();
        const count = this.read7BitEncodedInt();
        if (length > 10000) return [];

        const result = new Array(Math.min(length, 1000)).fill(null);
        for (let i = 0; i < count && this.position < this.data.length; i++) {
            const index = this.read7BitEncodedInt();
            const value = this.parseObject();
            if (index < result.length) {
                result[index] = value;
            }
        }
        return result;
    }

    /**
     * Parse Binary serialized object (BinaryFormatter)
     * These are complex .NET objects like DataTable
     */
    parseBinaryObject() {
        this.stats.objects++;
        const length = this.read7BitEncodedInt();

        if (length > this.data.length - this.position || length < 0) {
            return { type: 'BinaryObject', size: length };
        }

        const startPos = this.position;
        const bytes = this.readBytes(length);

        // Try to extract content from binary object
        const content = this.extractBinaryObjectContent(bytes);

        return {
            type: 'BinarySerializedObject',
            size: length,
            content
        };
    }

    /**
     * Extract content from binary serialized object
     */
    extractBinaryObjectContent(bytes) {
        const str = String.fromCharCode.apply(null, Array.from(bytes));
        const result = {};

        // Look for DataTable
        if (str.includes('System.Data.DataTable')) {
            result.objectType = 'DataTable';

            // Extract XML schema if present
            const schemaStart = str.indexOf('<?xml');
            const schemaEnd = str.indexOf('</xs:schema>');
            if (schemaStart !== -1 && schemaEnd !== -1) {
                const schemaXml = str.substring(schemaStart, schemaEnd + 12);
                result.schema = this.parseXmlSchema(schemaXml);
            }

            // Extract diffgram data
            const diffStart = str.indexOf('<diffgr:diffgram');
            const diffEnd = str.indexOf('</diffgr:diffgram>');
            if (diffStart !== -1 && diffEnd !== -1) {
                result.hasDiffgram = true;
            }
        }

        // Extract readable strings
        const strings = this.extractReadableStrings(str).filter(s => s.length > 3);
        if (strings.length > 0) {
            result.extractedStrings = strings.slice(0, 50);
        }

        return result;
    }

    /**
     * Parse Typed Array
     */
    parseTypedArray() {
        this.stats.arrays++;
        const typeIndex = this.read7BitEncodedInt();
        const length = this.read7BitEncodedInt();

        const array = [];
        for (let i = 0; i < length && this.position < this.data.length && i < 1000; i++) {
            array.push(this.parseObject());
        }
        return {
            type: 'TypedArray',
            typeIndex,
            items: array
        };
    }

    /**
     * Parse Known Type reference
     */
    parseKnownType() {
        const index = this.read7BitEncodedInt();
        return this.typeTable[index] || { type: 'KnownType', index };
    }

    /**
     * Try to recover parsing when encountering unknown marker
     */
    tryRecoverParse(marker) {
        // Check if this might be start of a string length
        if (marker > 0 && marker < 128) {
            this.position--;
            try {
                const possibleString = this.readString();
                if (possibleString && possibleString.length > 0 && /^[\x20-\x7E\s]+$/.test(possibleString)) {
                    return possibleString;
                }
            } catch {
                // Recovery failed
            }
        }

        return {
            type: 'Unknown',
            marker: `0x${marker.toString(16).padStart(2, '0')}`,
            position: this.position - 1
        };
    }

    /**
     * Get statistics
     */
    getStats() {
        return this.stats;
    }
}

// Export
window.ViewStateDecoder = ViewStateDecoder;
