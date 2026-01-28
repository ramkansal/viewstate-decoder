# ASP.NET ViewState Decoder

A web tool for decoding and editing ASP.NET ViewState strings.

## Usage

Open `index.html` in your browser.

## Features

**Decoder Tab**
- Decode Base64 ViewState to readable format
- Tree view with expand/collapse
- Copy decoded output
- Download as JSON
- Load sample data for testing

**Editor Tab**
- JSON editor with line numbers
- Format and validate JSON
- Encode JSON back to ViewState
- Copy encoded output

## Files

```
index.html   - Main page
styles.css   - Styles
decoder.js   - ViewState parser
editor.js    - JSON editor logic
app.js       - UI and event handling
```

## ViewState Format

ASP.NET ViewState is a Base64 encoded string that stores page state between postbacks. This tool parses the binary format and displays the contents as a tree structure.

Supported types:
- Strings
- Integers (byte, int16, int32)
- Booleans
- Arrays
- Pairs and Triplets
- Hashtables
- DateTime
- Colors
- Units

## Browser Support

Works in Chrome, Firefox, Edge, and Safari.

## License

MIT
