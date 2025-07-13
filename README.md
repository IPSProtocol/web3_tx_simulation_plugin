# Web3 Transaction Simulator Chrome Extension

A Chrome extension that intercepts and simulates Web3 transactions before they reach your wallet. This helps you understand the potential outcome and effects of a transaction before actually executing it.

## Sponsoring 

This project is supported by the [ETH Rangers Program](https://blog.ethereum.org/2024/12/02/ethrangers-public-goods) and [Ethereum Foundation Ecosystem Support Program (ESP)](https://esp.ethereum.foundation), under Grant #[FY25-1948, Q1-2025](https://blog.ethereum.org/2025/05/08/allocation-q1-25).

## Features

- Intercepts Web3 transactions before they reach your wallet
- Simulates transaction outcomes
- Displays gas estimates and success probability
- Shows potential effects and security considerations
- Modern, clean UI for viewing simulation results

## Getting Started 

Follow these instructions to set up the extension for development.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [npm](https://www.npmjs.com/)

### Installation and Building

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <repository-directory>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Build the extension:**
    ```bash
    npm run build
    ```
    This command compiles the TypeScript/React source and packages it into the `dist` directory. For development, you can use `npm start` to enable hot-reloading.

### Loading the Extension in Chrome

1.  Open Google Chrome and navigate to `chrome://extensions/`.
2.  Enable **"Developer mode"** using the toggle in the top-right corner.
3.  Click the **"Load unpacked"** button.
4.  Select the `dist` directory from this project.

The extension should now be loaded and active.

## Usage

1.  The extension will automatically intercept any Web3 transactions on websites you visit.
2.  When a transaction is detected, the extension icon will become active.
3.  Click the extension icon to view the simulation results.
4.  Review the transaction details, gas estimates, and potential effects.
5.  Based on the simulation results, decide whether to proceed with the transaction.

## Project Structure

-   `src/` - Contains all the source code for the extension.
    -   `background/index.ts` - The background service worker, responsible for handling simulation requests.
    -   `contentScript/index.tsx` - Injected into web pages to intercept `window.ethereum` transaction requests.
    -   `popup/` - The React application for the extension's popup UI.
    -   `services/` - Contains services for simulation and storage.
    -   `types/` - TypeScript type definitions.
-   `public/` - Static assets that are copied to the build directory.
    -   `manifest.json` - The extension's manifest file, defining permissions and capabilities.
    -   `index.html` - Base HTML file.
-   `dist/` - The compiled and packaged extension, generated after building. **This is the directory you load into Chrome.**

## Customizing the Simulation Engine

The current implementation uses a mock simulation engine. To connect to your actual simulation engine:

1.  Modify the `simulateTransaction` function in `src/background/index.ts`.
2.  Replace the mock implementation with your actual simulation engine API endpoint.
3.  Update the response handling to match your API's response format.

## Security Considerations

-   The extension only intercepts transaction requests and does not modify them.
-   No private keys or sensitive data are accessed or stored.
-   All simulation results are stored locally in the extension's storage.
-   The extension operates in an isolated environment.

## Contributing

Feel free to submit issues and enhancement requests!

---

## 📄 License
This project is licensed under the MIT License. See the [COPYING](COPYING) file for details.
