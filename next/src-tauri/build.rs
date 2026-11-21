fn main() {
    #[cfg(feature = "desktop")]
    tauri_build::build();
    print_browser_assets();
}

fn print_browser_assets() {
    use std::{env, fs, path::PathBuf};
    let root = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap())
        .join("../../frontend/dist-next-browser");
    println!("cargo:rerun-if-changed={}", root.display());
    let mut files = vec![("browser.html".to_owned(), root.join("browser.html"))];
    if let Ok(assets) = fs::read_dir(root.join("assets")) {
        for entry in assets.flatten().filter(|e| e.path().is_file()) {
            files.push((
                format!("assets/{}", entry.file_name().to_string_lossy()),
                entry.path(),
            ));
        }
    }
    let mut source =
        String::from("fn embedded(name: &str) -> Option<&'static [u8]> { match name {\n");
    for (name, path) in files {
        if path.is_file() {
            source.push_str(&format!(
                "{name:?} => Some(include_bytes!({:?})),\n",
                path.to_string_lossy()
            ));
        }
    }
    source.push_str("_ => None }}\n");
    fs::write(
        PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("browser_assets.rs"),
        source,
    )
    .unwrap();
}
