# Web3 Transaction Simulator Chrome Extension

A Chrome extension that intercepts and simulates Web3 transactions before they reach your wallet. This helps you understand the potential outcome and effects of a transaction before actually executing it.

## Features

- Intercepts Web3 transactions before they reach your wallet
- Simulates transaction outcomes
- Displays gas estimates and success probability
- Shows potential effects and security considerations
- Modern, clean UI for viewing simulation results

## Installation

1. Clone this repository or download the source code
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the directory containing the extension files

## Usage

1. The extension will automatically intercept any Web3 transactions on websites you visit
2. When a transaction is detected, the extension icon will become active
3. Click the extension icon to view the simulation results
4. Review the transaction details, gas estimates, and potential effects
5. Based on the simulation results, decide whether to proceed with the transaction

## Development

### File Structure

- `manifest.json` - Extension configuration and permissions
- `popup.html` - Extension popup UI
- `popup.js` - Popup interaction logic
- `contentScript.js` - Web3 provider interceptor
- `background.js` - Background service worker for simulation
- `images/` - Extension icons

### Customizing the Simulation Engine

The current implementation uses a mock simulation engine. To connect to your actual simulation engine:

1. Modify the `simulateTransaction` function in `background.js`
2. Replace the mock API call with your actual simulation engine API endpoint
3. Update the response handling to match your API's response format

## Security Considerations

- The extension only intercepts transaction requests and does not modify them
- No private keys or sensitive data are accessed or stored
- All simulation results are stored locally in the extension's storage
- The extension operates in an isolated environment

## Contributing

Feel free to submit issues and enhancement requests! 