/**
 * ASP.NET ViewState Decoder
 * Decodes Base64-encoded ViewState strings into readable structures
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
            booleans: 0
        };
    }

    /**
     * Main decode function - entry point
     * @param {string} viewStateString - Base64 encoded ViewState
     * @returns {object} Decoded ViewState structure
     */
    decode(viewStateString) {
        // Reset state
        this.position = 0;
        this.stats = {
            pairs: 0,
            triplets: 0,
            arrays: 0,
            strings: 0,
            integers: 0,
            booleans: 0
        };

        // Clean the input
        let cleanedInput = viewStateString.trim();
        
        // Remove common prefixes if present
        if (cleanedInput.startsWith('/wE')) {
            // Typical ASP.NET ViewState signature
        }

        try {
            // Decode Base64
            const binaryString = atob(cleanedInput);
            this.data = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                this.data[i] = binaryString.charCodeAt(i);
            }

            // Check for ViewState signature (0xFF 0x01 for LosFormatter)
            const result = this.parseViewState();
            
            return {
                success: true,
                data: result,
                stats: this.stats,
                rawSize: this.data.length
            };
        } catch (error) {
            // Try alternate decoding methods
            return this.fallbackDecode(cleanedInput, error);
        }
    }

    /**
     * Fallback decoder for non-standard ViewState formats
     */
    fallbackDecode(input, originalError) {
        try {
            // Try URL-decoded Base64
            const urlDecoded = decodeURIComponent(input);
            const binaryString = atob(urlDecoded);
            this.data = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                this.data[i] = binaryString.charCodeAt(i);
            }
            this.position = 0;
            
            const result = this.parseViewState();
            return {
                success: true,
                data: result,
                stats: this.stats,
                rawSize: this.data.length
            };
        } catch (e) {
            // Try to extract readable content
            try {
                const binaryString = atob(input);
                const readableContent = this.extractReadableStrings(binaryString);
                
                return {
                    success: true,
                    data: {
                        type: 'Raw Content',
                        value: readableContent,
                        note: 'Unable to parse ViewState structure, showing readable content'
                    },
                    stats: this.stats,
                    rawSize: binaryString.length
                };
            } catch (finalError) {
                return {
                    success: false,
                    error: 'Unable to decode ViewState: ' + originalError.message,
                    suggestion: 'Make sure the input is a valid Base64-encoded ASP.NET ViewState string'
                };
            }
        }
    }

    /**
     * Extract readable strings from binary data
     */
    extractReadableStrings(binaryString) {
        const strings = [];
        let current = '';
        
        for (let i = 0; i < binaryString.length; i++) {
            const charCode = binaryString.charCodeAt(i);
            if (charCode >= 32 && charCode <= 126) {
                current += binaryString[i];
            } else {
                if (current.length >= 3) {
                    strings.push(current);
                }
                current = '';
            }
        }
        if (current.length >= 3) {
            strings.push(current);
        }
        
        return strings;
    }

    /**
     * Parse ViewState binary format
     */
    parseViewState() {
        if (this.data.length === 0) {
            throw new Error('Empty ViewState data');
        }

        // Read first byte - format marker
        const marker = this.readByte();
        
        // Common ViewState markers
        // 0xFF = LosFormatter
        // 0x1F = Compressed
        // Other = ObjectStateFormatter
        
        if (marker === 0xFF) {
            // LosFormatter - read version byte
            const version = this.readByte();
            return this.parseObject();
        } else {
            // Reset and treat as ObjectStateFormatter
            this.position = 0;
            return this.parseObject();
        }
    }

    /**
     * Read a single byte
     */
    readByte() {
        if (this.position >= this.data.length) {
            throw new Error('Unexpected end of data');
        }
        return this.data[this.position++];
    }

    /**
     * Peek at next byte without advancing position
     */
    peekByte() {
        if (this.position >= this.data.length) {
            return -1;
        }
        return this.data[this.position];
    }

    /**
     * Read a 7-bit encoded integer (variable length)
     */
    read7BitEncodedInt() {
        let result = 0;
        let shift = 0;
        let byte;
        
        do {
            if (shift >= 35) {
                throw new Error('Invalid 7-bit encoded integer');
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
        if (length === 0) return '';
        
        if (this.position + length > this.data.length) {
            // Return what we can
            const available = this.data.length - this.position;
            const bytes = this.data.slice(this.position, this.position + available);
            this.position = this.data.length;
            return new TextDecoder('utf-8').decode(bytes);
        }
        
        const bytes = this.data.slice(this.position, this.position + length);
        this.position += length;
        
        try {
            return new TextDecoder('utf-8').decode(bytes);
        } catch {
            // Fallback to ASCII
            return String.fromCharCode.apply(null, bytes);
        }
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
            // Type tokens used in ObjectStateFormatter
            case 0x01: // Int16
                return this.parseInt16();
                
            case 0x02: // Int32
                this.stats.integers++;
                return this.read7BitEncodedInt();
                
            case 0x03: // Byte
                this.stats.integers++;
                return this.readByte();
                
            case 0x04: // Char
                return String.fromCharCode(this.readByte());
                
            case 0x05: // String
            case 0x1E: // Indexed String
                this.stats.strings++;
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
            case 0x64: // Null
            case 0x65: // Empty string
                return null;
                
            case 0x0B: // True
            case 0x66: // Boolean True
                this.stats.booleans++;
                return true;
                
            case 0x0C: // False
            case 0x67: // Boolean False
                this.stats.booleans++;
                return false;
                
            case 0x0F: // Pair
            case 0x68: // Pair marker
                return this.parsePair();
                
            case 0x10: // Triplet
            case 0x69: // Triplet marker
                return this.parseTriplet();
                
            case 0x14: // Array
            case 0x15: // StringArray
            case 0x16: // ArrayList
            case 0x6A: // Array marker
                return this.parseArray();
                
            case 0x17: // Hashtable
            case 0x18: // HybridDictionary
                return this.parseHashtable();
                
            case 0x1B: // Unit
                return this.parseUnit();
                
            case 0x1F: // IndexedString (reference)
                const index = this.read7BitEncodedInt();
                return `<StringRef:${index}>`;
                
            case 0x28: // Sparse Array
                return this.parseSparseArray();
                
            default:
                // Try to read as a generic structure
                return this.parseGenericStructure(typeMarker);
        }
    }

    /**
     * Parse 16-bit integer
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
        // Read 8 bytes for ticks
        let ticks = 0n;
        for (let i = 0; i < 8; i++) {
            ticks |= BigInt(this.readByte()) << BigInt(i * 8);
        }
        
        // Convert .NET ticks to JavaScript Date
        const ticksPerMillisecond = 10000n;
        const epochDifference = 621355968000000000n;
        const jsTimestamp = Number((ticks - epochDifference) / ticksPerMillisecond);
        
        try {
            return new Date(jsTimestamp).toISOString();
        } catch {
            return `<DateTime: ${ticks}>`;
        }
    }

    /**
     * Parse Double
     */
    parseDouble() {
        const bytes = new Uint8Array(8);
        for (let i = 0; i < 8; i++) {
            bytes[i] = this.readByte();
        }
        return new DataView(bytes.buffer).getFloat64(0, true);
    }

    /**
     * Parse Float
     */
    parseFloat() {
        const bytes = new Uint8Array(4);
        for (let i = 0; i < 4; i++) {
            bytes[i] = this.readByte();
        }
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
        return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
    }

    /**
     * Parse Pair (two objects)
     */
    parsePair() {
        this.stats.pairs++;
        return {
            type: 'Pair',
            first: this.parseObject(),
            second: this.parseObject()
        };
    }

    /**
     * Parse Triplet (three objects)
     */
    parseTriplet() {
        this.stats.triplets++;
        return {
            type: 'Triplet',
            first: this.parseObject(),
            second: this.parseObject(),
            third: this.parseObject()
        };
    }

    /**
     * Parse Array
     */
    parseArray() {
        this.stats.arrays++;
        const length = this.read7BitEncodedInt();
        const array = [];
        
        for (let i = 0; i < length && this.position < this.data.length; i++) {
            array.push(this.parseObject());
        }
        
        return array;
    }

    /**
     * Parse Hashtable/Dictionary
     */
    parseHashtable() {
        const count = this.read7BitEncodedInt();
        const result = {};
        
        for (let i = 0; i < count && this.position < this.data.length; i++) {
            const key = this.parseObject();
            const value = this.parseObject();
            result[String(key)] = value;
        }
        
        return result;
    }

    /**
     * Parse Unit (CSS unit)
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
        const result = new Array(length).fill(null);
        
        for (let i = 0; i < count && this.position < this.data.length; i++) {
            const index = this.read7BitEncodedInt();
            const value = this.parseObject();
            if (index < length) {
                result[index] = value;
            }
        }
        
        return result;
    }

    /**
     * Parse generic structure when type is unknown
     */
    parseGenericStructure(marker) {
        // Try to interpret the marker as start of data
        this.position--; // Go back one byte
        
        // Attempt to read as string
        try {
            const length = this.read7BitEncodedInt();
            if (length > 0 && length < 10000 && this.position + length <= this.data.length) {
                const bytes = this.data.slice(this.position, this.position + length);
                this.position += length;
                const str = new TextDecoder('utf-8').decode(bytes);
                if (str && /^[\x20-\x7E\s]*$/.test(str)) {
                    this.stats.strings++;
                    return str;
                }
            }
        } catch {}
        
        // Return marker info
        return {
            type: 'Unknown',
            marker: `0x${marker.toString(16).padStart(2, '0')}`,
            position: this.position
        };
    }

    /**
     * Get statistics about the decoded ViewState
     */
    getStats() {
        return this.stats;
    }
}

// Export for use in other modules
window.ViewStateDecoder = ViewStateDecoder;
