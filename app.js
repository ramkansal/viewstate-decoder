/**
 * ASP.NET ViewState Decoder - Main Application
 */

(function () {
    'use strict';

    // Initialize decoder and editor instances
    const decoder = new ViewStateDecoder();
    const editor = new ViewStateEditor();
    let decodedData = null;

    // DOM Elements
    const elements = {
        // Tabs
        tabs: document.querySelectorAll('.tab'),
        tabContents: document.querySelectorAll('.tab-content'),
        tabIndicator: document.querySelector('.tab-indicator'),

        // Decoder Tab
        viewstateInput: document.getElementById('viewstate-input'),
        outputContainer: document.getElementById('output-container'),
        outputStats: document.getElementById('output-stats'),
        pasteBtn: document.getElementById('paste-btn'),
        sampleBtn: document.getElementById('sample-btn'),
        clearInputBtn: document.getElementById('clear-input-btn'),
        decodeBtn: document.getElementById('decode-btn'),
        expandAllBtn: document.getElementById('expand-all-btn'),
        collapseAllBtn: document.getElementById('collapse-all-btn'),
        copyOutputBtn: document.getElementById('copy-output-btn'),
        downloadBtn: document.getElementById('download-btn'),

        // Editor Tab
        jsonEditor: document.getElementById('json-editor'),
        lineNumbers: document.getElementById('line-numbers'),
        validationStatus: document.getElementById('validation-status'),
        encodedOutput: document.getElementById('encoded-output'),
        formatJsonBtn: document.getElementById('format-json-btn'),
        validateJsonBtn: document.getElementById('validate-json-btn'),
        encodeBtn: document.getElementById('encode-btn'),
        copyEncodedBtn: document.getElementById('copy-encoded-btn'),
        clearEditorBtn: document.getElementById('clear-editor-btn'),

        // Toast
        toastContainer: document.getElementById('toast-container')
    };

    // Sample ViewState for testing
    const sampleViewState = '/wEPDwUKMTY4NzY1NDk4MQ9kFgICAw9kFgQCAQ8PFgIeBFRleHQFDkhlbGxvLCBXb3JsZCFkZAIDDxYCHgdWaXNpYmxlaGRkw/bVgS8vVUn8xrZU4gTKfzUDhEU=';

    /**
     * Initialize the application
     */
    function init() {
        setupTabs();
        setupDecoderEvents();
        setupEditorEvents();
        updateLineNumbers();
    }

    /**
     * Setup tab switching
     */
    function setupTabs() {
        const tabs = Array.from(elements.tabs);

        // Set initial indicator position
        updateTabIndicator(tabs[0]);

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetId = tab.dataset.tab + '-tab';

                // Update active states
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                elements.tabContents.forEach(content => {
                    content.classList.remove('active');
                    if (content.id === targetId) {
                        content.classList.add('active');
                    }
                });

                // Update indicator
                updateTabIndicator(tab);
            });
        });
    }

    /**
     * Update tab indicator position
     */
    function updateTabIndicator(activeTab) {
        const indicator = elements.tabIndicator;
        indicator.style.left = activeTab.offsetLeft + 'px';
        indicator.style.width = activeTab.offsetWidth + 'px';
    }

    /**
     * Setup decoder tab events
     */
    function setupDecoderEvents() {
        // Paste button
        elements.pasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                elements.viewstateInput.value = text;
                showToast('Pasted from clipboard', 'success');
            } catch (err) {
                showToast('Unable to access clipboard', 'error');
            }
        });

        // Sample button
        elements.sampleBtn.addEventListener('click', () => {
            elements.viewstateInput.value = sampleViewState;
            showToast('Sample ViewState loaded', 'info');
        });

        // Clear input button
        elements.clearInputBtn.addEventListener('click', () => {
            elements.viewstateInput.value = '';
            clearOutput();
            showToast('Cleared', 'info');
        });

        // Decode button
        elements.decodeBtn.addEventListener('click', decodeViewState);

        // Expand all button
        elements.expandAllBtn.addEventListener('click', () => {
            const toggles = elements.outputContainer.querySelectorAll('.tree-toggle');
            const children = elements.outputContainer.querySelectorAll('.tree-children');

            toggles.forEach(t => t.classList.add('expanded'));
            children.forEach(c => c.classList.add('expanded'));
        });

        // Collapse all button
        elements.collapseAllBtn.addEventListener('click', () => {
            const toggles = elements.outputContainer.querySelectorAll('.tree-toggle');
            const children = elements.outputContainer.querySelectorAll('.tree-children');

            toggles.forEach(t => t.classList.remove('expanded'));
            children.forEach(c => c.classList.remove('expanded'));
        });

        // Copy output button
        elements.copyOutputBtn.addEventListener('click', () => {
            if (!decodedData) {
                showToast('Nothing to copy', 'error');
                return;
            }

            const jsonText = JSON.stringify(decodedData.data, null, 2);
            navigator.clipboard.writeText(jsonText).then(() => {
                showToast('Copied to clipboard', 'success');
            }).catch(() => {
                showToast('Failed to copy', 'error');
            });
        });

        // Download button
        elements.downloadBtn.addEventListener('click', () => {
            if (!decodedData) {
                showToast('Nothing to download', 'error');
                return;
            }

            const jsonText = JSON.stringify(decodedData.data, null, 2);
            const blob = new Blob([jsonText], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'viewstate-decoded.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast('Downloaded viewstate-decoded.json', 'success');
        });

        // Allow Enter key to decode
        elements.viewstateInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                decodeViewState();
            }
        });
    }

    /**
     * Setup editor tab events
     */
    function setupEditorEvents() {
        // Update line numbers on input
        elements.jsonEditor.addEventListener('input', () => {
            updateLineNumbers();
        });

        elements.jsonEditor.addEventListener('scroll', () => {
            elements.lineNumbers.scrollTop = elements.jsonEditor.scrollTop;
        });

        // Format JSON button
        elements.formatJsonBtn.addEventListener('click', () => {
            const result = editor.formatJSON(elements.jsonEditor.value);
            if (result.success) {
                elements.jsonEditor.value = result.formatted;
                updateLineNumbers();
                showToast('JSON formatted', 'success');
            } else {
                showToast('Invalid JSON: ' + result.error, 'error');
            }
        });

        // Validate JSON button
        elements.validateJsonBtn.addEventListener('click', () => {
            const result = editor.validateJSON(elements.jsonEditor.value);
            if (result.valid) {
                elements.validationStatus.className = 'validation-status valid';
                elements.validationStatus.innerHTML = '✓ Valid JSON';
                showToast('JSON is valid', 'success');
            } else {
                elements.validationStatus.className = 'validation-status invalid';
                elements.validationStatus.innerHTML = `✗ Error at line ${result.line}: ${result.error}`;
                showToast('Invalid JSON', 'error');
            }
        });

        // Encode button
        elements.encodeBtn.addEventListener('click', () => {
            const jsonValue = elements.jsonEditor.value.trim();
            if (!jsonValue) {
                showToast('Please enter JSON to encode', 'error');
                return;
            }

            const parseResult = editor.fromJSON(jsonValue);
            if (!parseResult.success) {
                showToast('Invalid JSON: ' + parseResult.error, 'error');
                return;
            }

            const result = editor.encode();
            if (result.success) {
                elements.encodedOutput.value = result.encoded;
                showToast(`Encoded successfully (${result.size} bytes)`, 'success');
            } else {
                showToast(result.error, 'error');
            }
        });

        // Copy encoded button
        elements.copyEncodedBtn.addEventListener('click', () => {
            const encoded = elements.encodedOutput.value;
            if (!encoded) {
                showToast('Nothing to copy', 'error');
                return;
            }

            navigator.clipboard.writeText(encoded).then(() => {
                showToast('Copied to clipboard', 'success');
            }).catch(() => {
                showToast('Failed to copy', 'error');
            });
        });

        // Clear editor button
        elements.clearEditorBtn.addEventListener('click', () => {
            elements.jsonEditor.value = '';
            elements.encodedOutput.value = '';
            elements.validationStatus.className = 'validation-status';
            elements.validationStatus.innerHTML = '';
            updateLineNumbers();
            showToast('Cleared', 'info');
        });
    }

    /**
     * Decode ViewState
     */
    function decodeViewState() {
        const input = elements.viewstateInput.value.trim();

        if (!input) {
            showToast('Please enter a ViewState string', 'error');
            return;
        }

        // Show loading state
        elements.decodeBtn.disabled = true;
        elements.decodeBtn.innerHTML = `
            <svg class="spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2V6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M12 18V22" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
                <path d="M4.93 4.93L7.76 7.76" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.9"/>
                <path d="M16.24 16.24L19.07 19.07" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.2"/>
                <path d="M2 12H6" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
                <path d="M18 12H22" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
                <path d="M4.93 19.07L7.76 16.24" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
                <path d="M16.24 7.76L19.07 4.93" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
            </svg>
            Decoding...
        `;

        // Use setTimeout to allow UI to update
        setTimeout(() => {
            try {
                decodedData = decoder.decode(input);

                if (decodedData.success) {
                    renderDecodedOutput(decodedData);

                    // Update editor with decoded JSON
                    editor.setData(decodedData.data);
                    elements.jsonEditor.value = editor.toJSON();
                    updateLineNumbers();

                    showToast('ViewState decoded successfully', 'success');
                } else {
                    showError(decodedData.error, decodedData.suggestion);
                }
            } catch (error) {
                showError('Decoding failed: ' + error.message);
            }

            // Reset button
            elements.decodeBtn.disabled = false;
            elements.decodeBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5V19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M19 12L12 19L5 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Decode ViewState
            `;
        }, 100);
    }

    /**
     * Render decoded output as tree view
     */
    function renderDecodedOutput(result) {
        // Update stats
        const stats = result.stats;
        elements.outputStats.innerHTML = `
            ${result.rawSize} bytes | 
            ${stats.strings} strings | 
            ${stats.integers} integers | 
            ${stats.pairs} pairs | 
            ${stats.triplets} triplets | 
            ${stats.arrays} arrays
        `;

        // Render tree
        const treeHtml = buildTreeHtml(result.data, 'root');
        elements.outputContainer.innerHTML = `<div class="tree-view">${treeHtml}</div>`;

        // Add click handlers for expanding/collapsing
        elements.outputContainer.querySelectorAll('.tree-node-header').forEach(header => {
            header.addEventListener('click', (e) => {
                const node = header.parentElement;
                const toggle = header.querySelector('.tree-toggle');
                const children = node.querySelector('.tree-children');

                if (toggle && children) {
                    toggle.classList.toggle('expanded');
                    children.classList.toggle('expanded');
                }
            });
        });

        // Auto-expand first level
        const firstLevelToggles = elements.outputContainer.querySelectorAll('.tree-view > .tree-node > .tree-node-header .tree-toggle');
        const firstLevelChildren = elements.outputContainer.querySelectorAll('.tree-view > .tree-node > .tree-children');
        firstLevelToggles.forEach(t => t.classList.add('expanded'));
        firstLevelChildren.forEach(c => c.classList.add('expanded'));
    }

    /**
     * Build HTML for tree node
     */
    function buildTreeHtml(data, key, depth = 0) {
        if (data === null || data === undefined) {
            return `
                <div class="tree-node">
                    <div class="tree-node-header">
                        <span class="tree-key">${escapeHtml(key)}</span>
                        <span class="tree-colon">:</span>
                        <span class="tree-value null">null</span>
                    </div>
                </div>
            `;
        }

        if (typeof data === 'boolean') {
            return `
                <div class="tree-node">
                    <div class="tree-node-header">
                        <span class="tree-key">${escapeHtml(key)}</span>
                        <span class="tree-colon">:</span>
                        <span class="tree-value boolean">${data}</span>
                    </div>
                </div>
            `;
        }

        if (typeof data === 'number') {
            return `
                <div class="tree-node">
                    <div class="tree-node-header">
                        <span class="tree-key">${escapeHtml(key)}</span>
                        <span class="tree-colon">:</span>
                        <span class="tree-value number">${data}</span>
                    </div>
                </div>
            `;
        }

        if (typeof data === 'string') {
            const displayValue = data.length > 100 ? data.substring(0, 100) + '...' : data;
            return `
                <div class="tree-node">
                    <div class="tree-node-header">
                        <span class="tree-key">${escapeHtml(key)}</span>
                        <span class="tree-colon">:</span>
                        <span class="tree-value string">"${escapeHtml(displayValue)}"</span>
                        ${data.length > 100 ? `<span class="tree-type">(${data.length} chars)</span>` : ''}
                    </div>
                </div>
            `;
        }

        if (Array.isArray(data)) {
            if (data.length === 0) {
                return `
                    <div class="tree-node">
                        <div class="tree-node-header">
                            <span class="tree-key">${escapeHtml(key)}</span>
                            <span class="tree-colon">:</span>
                            <span class="tree-value">[]</span>
                            <span class="tree-type">Array (0)</span>
                        </div>
                    </div>
                `;
            }

            const childrenHtml = data.map((item, index) => buildTreeHtml(item, index, depth + 1)).join('');
            return `
                <div class="tree-node">
                    <div class="tree-node-header">
                        <span class="tree-toggle">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </span>
                        <span class="tree-key">${escapeHtml(key)}</span>
                        <span class="tree-type">Array (${data.length})</span>
                    </div>
                    <div class="tree-children">${childrenHtml}</div>
                </div>
            `;
        }

        if (typeof data === 'object') {
            const keys = Object.keys(data);
            if (keys.length === 0) {
                return `
                    <div class="tree-node">
                        <div class="tree-node-header">
                            <span class="tree-key">${escapeHtml(key)}</span>
                            <span class="tree-colon">:</span>
                            <span class="tree-value">{}</span>
                            <span class="tree-type">Object (0)</span>
                        </div>
                    </div>
                `;
            }

            // Check for Pair or Triplet
            let typeLabel = `Object (${keys.length})`;
            if (data.type === 'Pair') {
                typeLabel = 'Pair';
            } else if (data.type === 'Triplet') {
                typeLabel = 'Triplet';
            }

            const childrenHtml = keys.map(k => buildTreeHtml(data[k], k, depth + 1)).join('');
            return `
                <div class="tree-node">
                    <div class="tree-node-header">
                        <span class="tree-toggle">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </span>
                        <span class="tree-key">${escapeHtml(key)}</span>
                        <span class="tree-type">${typeLabel}</span>
                    </div>
                    <div class="tree-children">${childrenHtml}</div>
                </div>
            `;
        }

        return `
            <div class="tree-node">
                <div class="tree-node-header">
                    <span class="tree-key">${escapeHtml(key)}</span>
                    <span class="tree-colon">:</span>
                    <span class="tree-value">${escapeHtml(String(data))}</span>
                </div>
            </div>
        `;
    }

    /**
     * Show error in output container
     */
    function showError(message, suggestion = null) {
        elements.outputStats.innerHTML = '';
        elements.outputContainer.innerHTML = `
            <div class="output-placeholder" style="color: var(--error);">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                    <path d="M15 9L9 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <path d="M9 9L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <p>${escapeHtml(message)}</p>
                ${suggestion ? `<span>${escapeHtml(suggestion)}</span>` : ''}
            </div>
        `;
    }

    /**
     * Clear output container
     */
    function clearOutput() {
        decodedData = null;
        elements.outputStats.innerHTML = '';
        elements.outputContainer.innerHTML = `
            <div class="output-placeholder">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 8L3 12L7 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M17 8L21 12L17 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M14 4L10 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <p>Decoded ViewState will appear here</p>
                <span>Paste a ViewState string above and click "Decode ViewState"</span>
            </div>
        `;
    }

    /**
     * Update line numbers in editor
     */
    function updateLineNumbers() {
        const lines = elements.jsonEditor.value.split('\n').length;
        let html = '';
        for (let i = 1; i <= lines; i++) {
            html += i + '\n';
        }
        elements.lineNumbers.textContent = html;
    }

    /**
     * Escape HTML special characters
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Show toast notification
     */
    function showToast(message, type = 'info') {
        const icons = {
            success: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22 11.08V12C21.9988 14.1564 21.3005 16.2547 20.0093 17.9818C18.7182 19.709 16.9033 20.9725 14.8354 21.5839C12.7674 22.1953 10.5573 22.1219 8.53447 21.3746C6.51168 20.6273 4.78465 19.2461 3.61096 17.4371C2.43727 15.628 1.87979 13.4881 2.02168 11.3363C2.16356 9.18455 2.99721 7.13631 4.39828 5.49706C5.79935 3.85781 7.69279 2.71537 9.79619 2.24013C11.8996 1.7649 14.1003 1.98232 16.07 2.85999" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M22 4L12 14.01L9 11.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`,
            error: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                <path d="M15 9L9 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M9 9L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>`,
            info: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                <path d="M12 16V12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <circle cx="12" cy="8" r="1" fill="currentColor"/>
            </svg>`
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            ${icons[type]}
            <span class="toast-message">${escapeHtml(message)}</span>
            <button class="toast-close">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
                    <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        `;

        elements.toastContainer.appendChild(toast);

        // Close button
        toast.querySelector('.toast-close').addEventListener('click', () => {
            removeToast(toast);
        });

        // Auto-remove after 4 seconds
        setTimeout(() => {
            removeToast(toast);
        }, 4000);
    }

    /**
     * Remove toast with animation
     */
    function removeToast(toast) {
        toast.style.animation = 'slideOut 0.25s ease forwards';
        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
        }, 250);
    }

    // Add spinning animation for loading
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        .spin { animation: spin 1s linear infinite; }
    `;
    document.head.appendChild(style);

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
