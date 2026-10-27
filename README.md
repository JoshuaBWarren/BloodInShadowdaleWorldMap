# Blood in Shadowdale — interactive campaign map

A read-only GitHub Pages player map plus a local DM editor that **writes directly to `locations.json`**. No npm dependencies or database. Requires Node.js 18+.

## DM editing (VS Code)

1. Open this folder in VS Code and open **Terminal → New Terminal**.
2. Run `npm run dev`. (Install Node.js first if `npm` is not recognized.)
3. Open **http://127.0.0.1:4173/editor** in your browser. This URL is the **DM editor**. Do not use the VS Code **Go Live** button for editing; Live Server cannot save files.
4. Choose **+ Add location**, click a map location, type its number, title, description, and optional image URL, then **Save location**. Edits are immediately written to `locations.json` in your project folder. Edit/delete also save.
5. Open **http://127.0.0.1:4173/** to preview exactly what players see, without editing controls.
6. In VS Code Source Control, commit and push `locations.json` to GitHub. Your GitHub Pages site reads the file on the next reload/deployment.

The public player site never saves changes. The local editor listens **only on 127.0.0.1**, and requests to the saving endpoint must come from the local editor's origin. GitHub Pages does not run the Node server.

## Publishing

Commit the **contents** of this folder to the root of the GitHub repo (`index.html` must be at the root). In GitHub Settings → Pages choose **Deploy from a branch**, branch `main`, directory `/ (root)`.

GitHub Pages serves only files. `index.html` displays `locations.json`; it has no DM controls. `tools/dev-server.js` is only for editing on your own computer.

## Notes

- Your entire 1447 × 1087 Shadowdale map and 60 numbered marker PNGs are bundled. Nothing needs to be uploaded separately.
- The website initially shows the full map without placed markers.
- Put extra location illustrations into `assets/` and enter relative URLs such as `assets/inn.jpg`, then commit those images too. External HTTPS images also work.
- `locations.json` is public campaign information; don't put DM secrets there.
- The editor's **Export locations** button creates a backup. **Import locations** overwrites and saves the JSON after confirmation.
- Browser refresh loads the latest saved locations. No browser localStorage is used.
