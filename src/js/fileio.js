// Wraps the Tauri v2 dialog + fs plugin APIs, exposed on window.__TAURI__
// because tauri.conf.json sets app.withGlobalTauri = true. This lets a plain
// vanilla-JS frontend call native dialogs/file I/O with no bundler and no
// npm-installed API imports required at runtime.

function tauri() {
  return window.__TAURI__ || null;
}

export function isTauri() {
  return !!tauri();
}

export async function pickSavePath(defaultName) {
  const t = tauri();
  if (!t) return null;
  return await t.dialog.save({
    defaultPath: defaultName || "family.lng",
    filters: [{ name: "Lineage Save File", extensions: ["lng"] }],
  });
}

export async function pickOpenPath() {
  const t = tauri();
  if (!t) return null;
  return await t.dialog.open({
    multiple: false,
    filters: [{ name: "Lineage Save File", extensions: ["lng"] }],
  });
}

export async function writeTextFile(path, contents) {
  const t = tauri();
  if (!t) throw new Error("Not running inside Tauri");
  await t.fs.writeTextFile(path, contents);
}

export async function readTextFile(path) {
  const t = tauri();
  if (!t) throw new Error("Not running inside Tauri");
  return await t.fs.readTextFile(path);
}

// Intercepts the native window close button. If `isDirty()` returns true,
// `onCloseRequested` is invoked instead of letting the window close, so the
// app can show the save/discard/cancel dialog.
export async function guardWindowClose({ isDirty, onCloseRequested }) {
  const t = tauri();
  if (!t) return;
  const win = t.window.getCurrentWindow();
  await win.onCloseRequested(async (event) => {
    if (isDirty()) {
      event.preventDefault();
      onCloseRequested();
    }
  });
}

export async function forceCloseWindow() {
  const t = tauri();
  if (!t) return;
  await t.window.getCurrentWindow().destroy();
}
