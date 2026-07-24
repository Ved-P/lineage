# Lineage

A small, pretty desktop app for building family trees — built with Rust, Tauri, and vanilla JavaScript.

Lineage shows your whole family tree on one screen (not just a single pedigree line), uses a pastel color scheme keyed to last names, and draws family connections using traditional bracket-style genealogy notation.

---

## For Users

### Installing

Download the latest installer from the [Releases](../../releases) page and run it. No other setup is required.

### Getting started

When you open Lineage, you can either:
- **New Family** — creates a brand-new tree, starting with one person.
- **Load Savefile** — opens an existing `.lng` file.

### The tree screen

Every person in the tree is drawn as a colored box, grouped into horizontal rows by generation. People with the same last name share the same box color. Married couples are drawn side by side (Parent 1 on the left, Parent 2 on the right), connected to their children below using bracket lines.

Each box shows a person's name and, when recorded, their life dates (for example `1920 – 1990`, or `b. 1920` / `d. 1990` when only one is known).

**Selecting a person:** click their box to open the details panel on the right. The panel shows their life dates and, when both years can be read, an approximate age. From there you can:
- **Edit Person** — change their names and birth/death dates.
- **Add Family (as parent)** — start a new family with this person as a parent.
- **Add Parents (as child)** — record this person's parents.
- **Change Last Name Color** — pick a different color for everyone with this last name.
- **Show Pedigree** — narrows the view to just this person, their spouse, their ancestors, and their descendants. Click **Exit Pedigree View** in the toolbar to return to the full tree.

**Adding a family:** click **+ Add Family** in the toolbar (or use one of the shortcuts above). Every new family must connect to someone already in the tree — you'll first search for or select that anchor person, choose their role (Parent 1, Parent 2, or Child), and then fill in the rest of the family, picking existing people or creating new ones as needed.

**Editing an existing family:** click directly on one of its connecting lines. From there you can fill in a missing parent, add another child, or change the family's line color.

**Reordering people:** turn on **Reorder Mode** in the toolbar, then drag a person's box and drop it next to where you want them within their row. Married couples always move and stay together automatically.

**Zooming:** use the **+ / −** buttons in the toolbar, or hold **Ctrl** and scroll your mouse wheel over the tree.

**Saving:** click **Save** in the toolbar. Trees are saved as `.lng` files (plain text, safe to back up or version-control). If you try to close a tree — or close the app entirely — with unsaved changes, you'll be prompted to save first.

**Printing / exporting to PDF:** click **Print / Export PDF** in the toolbar. This opens your system's native print dialog; choose **"Microsoft Print to PDF"** (or your OS's equivalent) as the destination to save a PDF instead of printing on paper. The tree is automatically scaled to fit the page width. Before printing, make sure **"Background graphics"** is enabled and **"Headers and footers"** is disabled in the print dialog's settings, so the tree's colors print correctly and no browser-added title/date is added to the page.

---

## For Developers: Building from Source

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (via `rustup`)
- [Node.js](https://nodejs.org/) (LTS)

### Project structure

```
lineage/
├── src/                    # Frontend (vanilla JS, no bundler)
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── main.js         # App wiring: screens, modals, event handlers
│       ├── model.js        # Data model + person-placement algorithm
│       ├── layout.js        # Box/line geometry for rendering
│       ├── render.js        # SVG drawing + drag-to-reorder
│       ├── persistence.js   # .lng save/load (de)serialization
│       └── fileio.js        # Tauri dialog/fs wrappers
└── src-tauri/               # Rust/Tauri shell
    ├── src/main.rs
    ├── Cargo.toml
    ├── tauri.conf.json
    └── capabilities/default.json
```

All application logic (data model, layout, rendering, file format) lives in the frontend JavaScript. The Rust side is intentionally minimal — it just registers the native dialog and filesystem plugins that the frontend calls directly via `window.__TAURI__`.

### Running in development

From the project root:

```bash
npm install
npm run tauri dev
```

This launches the app with hot-reloading of the frontend.

### Running the tests

The pure logic in `src/js/model.js` and `src/js/persistence.js` is covered by tests using Node's built-in test runner:

```bash
npm test
```

### Building a release installer locally

```bash
npm run tauri build
```

The installer (`.msi`/`.exe` on Windows) will be output under `src-tauri/target/release/bundle/`.

### Save file format (`.lng`)

`.lng` files are UTF-8 JSON containing:
- `persons` — every person's names, birth/death dates, and generation number
- `families` — parent/child relationships and any manual line-color override
- `generation_order` — the left-to-right ordering of people within each generation row
- `last_name_colors` — the color assigned to each last name

This format is stable and safe to inspect, diff, or edit by hand if needed.

### Publishing a new release

Releases are built and published automatically via GitHub Actions (see `.github/workflows/release.yml`):

1. Bump `"version"` in `src-tauri/tauri.conf.json`.
2. Commit, then tag and push: `git tag app-v<version> && git push origin app-v<version>`.
3. The workflow builds the Windows installer and creates a **draft** GitHub Release with it attached.
4. Review the draft release, then publish it manually from the Releases tab.
