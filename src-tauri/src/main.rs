// Lineage — Tauri backend entry point.
//
// All family-tree logic (data model, insertion algorithm, layout, rendering)
// lives in the vanilla JS frontend under /src. This Rust side only wires up
// the native plugins the frontend needs: file-open/save dialogs and
// filesystem read/write for .lng save files.

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running the Lineage application");
}
