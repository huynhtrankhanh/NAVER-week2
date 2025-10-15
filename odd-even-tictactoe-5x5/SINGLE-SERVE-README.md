# Single-Serve JS File

This directory contains a bundling script that creates a single JavaScript file containing both the frontend and backend for the Odd/Even Tic-Tac-Toe game.

## What is the Single-Serve JS File?

The `single-serve.js` file is a standalone server file that:
- Contains all the server logic
- Has the built frontend assets (HTML, CSS, JS) embedded as base64-encoded strings
- Serves both the frontend and backend from a single Node.js process
- Requires only `express` and `ws` npm packages as external dependencies

## How to Build

```bash
npm run build-single-serve
```

This will:
1. Build the client application using Vite
2. Read the built HTML, CSS, and JS files
3. Embed them into the server code
4. Bundle everything using esbuild
5. Create `single-serve.js` in this directory

## How to Use

After building:

```bash
# Install required dependencies
npm install express@^4.19.2 ws@^8.18.0

# Run the single-serve file
node single-serve.js

# Or with custom port
PORT=8080 node single-serve.js
```

The server will start on port 3001 (or the specified PORT) and serve the complete application.

## Automated Builds

The GitHub Action workflow `.github/workflows/build-single-serve.yml` automatically builds the single-serve file whenever code changes are pushed to the repository. The generated file is available as an artifact in the workflow run.

## Technical Details

### Bundling Process

1. **Client Build**: Vite builds the React application into optimized HTML, CSS, and JS files
2. **Asset Embedding**: The built files are base64-encoded and embedded into the server code
3. **Server Bundling**: esbuild bundles the server code with embedded assets
4. **Output**: A single executable JavaScript file is created

### Dependencies

The single-serve file depends on:
- Node.js built-in modules (http, path, url, fs, etc.)
- `express@^4.19.2` - Web framework
- `ws@^8.18.0` - WebSocket library

These dependencies must be installed via npm for the single-serve file to run.

### File Structure

```
bundle-entry.js        - Template server file with placeholders for embedded assets
build-single-serve.js  - Build script that creates the single-serve file
single-serve.js        - Generated single-serve file (not committed to git)
```

## Notes

- The `single-serve.js` file is not committed to version control (it's in `.gitignore`)
- The file is regenerated on each build to include the latest changes
- The bundle size is approximately 220KB
- The file includes the complete application and can be distributed standalone (with the npm dependencies)
