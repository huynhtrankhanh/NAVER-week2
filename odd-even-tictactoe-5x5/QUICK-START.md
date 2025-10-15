# Quick Start Guide - Single-Serve JS

## For End Users (Using the Pre-built File)

### Option 1: Download from GitHub Actions

1. Go to the [Actions tab](https://github.com/huynhtrankhanh/NAVER-week2/actions/workflows/build-single-serve.yml)
2. Click on the latest successful workflow run
3. Download the `single-serve-js` artifact
4. Extract `single-serve.js` from the zip file
5. Install dependencies:
   ```bash
   npm install express@^4.19.2 ws@^8.18.0
   ```
6. Run the server:
   ```bash
   node single-serve.js
   ```
7. Open `http://localhost:3001` in your browser

### Option 2: Build It Yourself

1. Clone the repository:
   ```bash
   git clone https://github.com/huynhtrankhanh/NAVER-week2.git
   cd NAVER-week2/odd-even-tictactoe-5x5
   ```

2. Install all dependencies:
   ```bash
   npm install
   npm run install-all
   ```

3. Build the single-serve file:
   ```bash
   npm run build-single-serve
   ```

4. Run it:
   ```bash
   node single-serve.js
   ```

## For Developers

### Understanding the Build Process

The build process consists of these steps:

1. **Client Build** (`npm --prefix client run build`)
   - Vite builds the React app into `client/dist/`
   - Outputs optimized HTML, CSS, and JS files

2. **Asset Embedding** (in `build-single-serve.js`)
   - Reads the built files
   - Base64-encodes them to avoid escaping issues
   - Replaces placeholders in `bundle-entry.js`

3. **Server Bundling** (esbuild)
   - Bundles the server code with embedded assets
   - Keeps Node.js built-ins and npm packages as external
   - Outputs `single-serve.js`

### Modifying the Build

To customize the build process:

- **Change bundle size optimization**: Edit `build-single-serve.js` and adjust esbuild options
- **Add more embedded files**: Modify `bundle-entry.js` to include additional placeholders
- **Change dependencies**: Update `package.json` and ensure the workflow installs them

### Testing

```bash
# Build and test locally
npm run build-single-serve
PORT=3001 node single-serve.js

# In another terminal
curl http://localhost:3001/health  # Should return {"ok":true}
```

## Troubleshooting

### "Cannot find module 'express'"
Install dependencies: `npm install express@^4.19.2 ws@^8.18.0`

### "Port already in use"
Set a different port: `PORT=8080 node single-serve.js`

### "Error: Dynamic require of ... is not supported"
This means esbuild bundled something incorrectly. Check that you're using the correct versions of express (4.x) and ws (8.x).

### Large bundle size
The bundle should be around 220KB. If it's much larger (>2MB), check that esbuild is using `packages: 'external'` to keep npm packages external.

## GitHub Action Details

The workflow (`.github/workflows/build-single-serve.yml`) runs on:
- Push to `main` or `master` branch
- Pull requests
- Only when files in `odd-even-tictactoe-5x5/` change

It produces an artifact named `single-serve-js` that's retained for 90 days.

## What's Inside the Single-Serve File?

The `single-serve.js` file contains:
- All server logic (Express routes, WebSocket handlers, game logic)
- Embedded frontend assets (HTML, CSS, JS) as base64 strings
- Bundled npm package code (not for express/ws, they remain external)
- ~220KB of code in a single executable JavaScript file

When run, it:
1. Decodes the base64 assets back to strings
2. Serves the HTML at `/`
3. Serves CSS and JS from `/assets/*`
4. Handles WebSocket connections at `/ws`
5. Provides a health check at `/health`

Everything a user needs to run the game is in one file!
