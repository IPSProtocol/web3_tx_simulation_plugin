# Testing the Web3 Transaction Simulator

This document outlines two approaches for testing the Web3 Transaction Simulator: as a local website and as a Chrome extension.

## Method 1: Testing as a Local Website

This method is useful for rapid development and UI testing.

### Setup

1. Create a new directory called `test` in your project root
2. Create an `index.html` file in the test directory that simulates a Web3 environment

```html
<!DOCTYPE html>
<html>
<head>
    <title>Web3 Transaction Simulator Test</title>
</head>
<body>
    <h1>Web3 Transaction Simulator Test Page</h1>
    <button id="sendTransaction">Send Test Transaction</button>
    
    <div id="result" style="margin-top: 20px;"></div>

    <script>
        // Mock ethereum provider
        window.ethereum = {
            request: async ({ method, params }) => {
                if (method === 'eth_sendTransaction') {
                    console.log('Transaction params:', params);
                    return '0x123...'; // Mock transaction hash
                }
                return null;
            }
        };

        // Test transaction
        const testTransaction = {
            from: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
            to: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
            value: '0x1',
            data: '0x',
        };

        document.getElementById('sendTransaction').addEventListener('click', async () => {
            try {
                const result = await window.ethereum.request({
                    method: 'eth_sendTransaction',
                    params: [testTransaction]
                });
                document.getElementById('result').textContent = `Transaction Hash: ${result}`;
            } catch (error) {
                document.getElementById('result').textContent = `Error: ${error.message}`;
            }
        });
    </script>
</body>
</html>
```

### Running the Test Website

1. Install a local HTTP server (if you don't have one):
   ```bash
   npm install -g http-server
   ```

2. Navigate to your project directory and start the server:
   ```bash
   http-server ./test
   ```

3. Open your browser and navigate to `http://localhost:8080`

4. Click the "Send Test Transaction" button to simulate a transaction

## Method 2: Testing as a Chrome Extension

This method tests the actual extension functionality in Chrome.

### Local Development Setup

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" using the toggle in the top right
3. Click "Load unpacked" and select your extension directory
4. The extension should now appear in your Chrome toolbar

### Testing Steps

1. **Basic Extension Loading**
   - Click the extension icon in Chrome
   - Verify the popup opens with the correct UI
   - Check that the "Ready" status is displayed

2. **Integration Testing**
   - Visit a Web3-enabled website (e.g., Uniswap, OpenSea)
   - Initiate a transaction
   - Verify the extension intercepts the transaction
   - Check simulation results are displayed

3. **Manual Testing**
   - Click the "Simulate Transaction" button
   - Verify error handling when no transaction is available
   - Check the display of simulation results

### Debugging Tips

1. **Inspect Popup**
   - Right-click the extension icon
   - Click "Inspect popup"
   - Use Chrome DevTools to debug popup.js

2. **Background Script Debugging**
   - Go to `chrome://extensions/`
   - Find your extension
   - Click "service worker" under "Inspect views"
   - Use console for background.js debugging

3. **Content Script Debugging**
   - Open DevTools on any webpage
   - Check the "Console" tab
   - Filter by "Content Script" to see contentScript.js logs 