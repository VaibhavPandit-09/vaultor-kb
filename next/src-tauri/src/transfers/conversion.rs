use super::{component, error, Input};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
};

const MAX_CONVERT: u64 = 256 * 1024;

pub(super) fn convertible(name: &str, bytes: u64) -> bool {
    bytes <= MAX_CONVERT
        && ["md", "markdown", "txt"].iter().any(|ext| {
            Path::new(name)
                .extension()
                .is_some_and(|value| value.eq_ignore_ascii_case(ext))
        })
}
pub(super) fn mode(input: &Input) -> &str {
    match input.decision.as_deref() {
        Some("original") => "original",
        Some("note") => "note",
        _ if convertible(&input.name, input.bytes) => "note",
        _ => "original",
    }
}
pub(super) fn image_input(input: &Input) -> bool {
    input.bytes <= 20 * 1024 * 1024
        && ["png", "jpg", "jpeg", "gif", "webp"].iter().any(|ext| {
            Path::new(&input.name)
                .extension()
                .is_some_and(|value| value.eq_ignore_ascii_case(ext))
        })
}

fn decode(bytes: Vec<u8>) -> Result<String, String> {
    if bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]) {
        let data = &bytes[2..];
        if data.len() % 2 != 0 {
            return Err("Invalid UTF-16 file".into());
        }
        let little = bytes[0] == 0xff;
        let units = data
            .chunks_exact(2)
            .map(|chunk| {
                let bytes = [chunk[0], chunk[1]];
                if little {
                    u16::from_le_bytes(bytes)
                } else {
                    u16::from_be_bytes(bytes)
                }
            })
            .collect::<Vec<_>>();
        String::from_utf16(&units).map_err(error)
    } else {
        String::from_utf8(bytes).map_err(|_| "Choose UTF-8 or BOM-marked UTF-16".into())
    }
}

/// Only resolves names in the reviewed batch. It never opens a filesystem path.
fn destination(origin: &str, url: &str) -> Option<String> {
    if url.is_empty() || url.len() > 4096 {
        return None;
    }
    let raw = url.split('#').next().unwrap_or("");
    let path = percent_encoding::percent_decode_str(raw)
        .decode_utf8()
        .ok()?;
    if path.is_empty() || path.starts_with(['\\', '/']) || path.contains([':', '\\', '?', '\0']) {
        return None;
    }
    let mut parts = origin.split('/').collect::<Vec<_>>();
    parts.pop();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            other => {
                component(other).ok()?;
                parts.push(other);
            }
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("/"))
    }
}

fn text_of(node: &Value) -> String {
    if let Some(text) = node["text"].as_str() {
        return text.into();
    }
    node["content"]
        .as_array()
        .map(|nodes| nodes.iter().map(text_of).collect())
        .unwrap_or_default()
}

fn project(
    node: Value,
    origin: &str,
    ids: &HashMap<String, String>,
    notes: &HashSet<String>,
    images: &HashSet<String>,
) -> Vec<Value> {
    let mut node = node;
    match node["type"].as_str() {
        Some("importImage") => {
            let href = node["attrs"]["href"].as_str().unwrap_or("");
            let alt = text_of(&node);
            if let Some(path) = destination(origin, href).filter(|path| images.contains(path)) {
                if let Some(id) = ids.get(&path) {
                    return vec![
                        json!({"type":"image","attrs":{"resourceId":id,"alt":alt,"width":100,"alignment":"center"}}),
                    ];
                }
            }
            return vec![json!({"type":"text","text":format!("[Image: {alt} ({href})]")})];
        }
        Some("text") => {
            let label = node["text"].as_str().unwrap_or("").to_string();
            if let Some(marks) = node["marks"].as_array_mut() {
                if let Some(index) = marks.iter().position(|mark| mark["type"] == "link") {
                    let href = marks[index]["attrs"]["href"].as_str().unwrap_or("");
                    if let Some(path) = destination(origin, href) {
                        if let Some(id) = ids.get(&path) {
                            return vec![
                                json!({"type":"resourceLink","attrs":{"resourceId":id,"label":label,"type":if notes.contains(&path){"note"}else{"file"}}}),
                            ];
                        }
                    }
                    if href.contains(':')
                        && !href.starts_with("https://")
                        && !href.starts_with("http://")
                    {
                        marks.remove(index);
                    }
                }
            }
            return vec![node];
        }
        _ => {}
    }
    if let Some(children) = node.get_mut("content").and_then(Value::as_array_mut) {
        let mapped = std::mem::take(children)
            .into_iter()
            .flat_map(|child| project(child, origin, ids, notes, images))
            .collect::<Vec<_>>();
        if (node["type"] == "paragraph" || node["type"] == "heading")
            && mapped.iter().any(|child| child["type"] == "image")
        {
            let mut output = Vec::new();
            let mut inline = Vec::new();
            for child in mapped {
                if child["type"] == "image" {
                    if !inline.is_empty() {
                        output.push(
                            json!({"type":"paragraph","content":std::mem::take(&mut inline)}),
                        );
                    }
                    output.push(child);
                } else {
                    inline.push(child);
                }
            }
            if !inline.is_empty() {
                output.push(json!({"type":"paragraph","content":inline}));
            }
            return output;
        }
        node["content"] = json!(mapped);
    }
    vec![node]
}

pub(super) fn convert(
    path: &Path,
    input: &Input,
    origin: &str,
    ids: &HashMap<String, String>,
    notes: &HashSet<String>,
    images: &HashSet<String>,
) -> Result<Value, String> {
    if !convertible(&input.name, input.bytes) {
        return Err("Conversion supports Markdown and text up to 256 KiB".into());
    }
    let text = decode(fs::read(path).map_err(error)?)?;
    let text = text.trim_start_matches('\u{feff}');
    if text.contains('\0') {
        return Err("Text contains NUL characters".into());
    }
    let text_only = input.name.to_ascii_lowercase().ends_with(".txt");
    let doc = if text_only {
        json!({"type":"doc","content":text.split('\n').map(|line|{
            let line=line.trim_end_matches('\r');
            if line.is_empty(){json!({"type":"paragraph"})}else{json!({"type":"paragraph","content":[{"type":"text","text":line}]})}
        }).collect::<Vec<_>>()})
    } else {
        let parsed = crate::linked::markdown::parse_import(text);
        if let Some(reason) = parsed.reason {
            return Err(reason);
        }
        let mut converted = project(parsed.document, origin, ids, notes, images)
            .pop()
            .ok_or("Invalid Markdown projection")?;
        if !parsed.frontmatter.is_empty() {
            converted["content"].as_array_mut().ok_or("Invalid document content")?.insert(0,
                json!({"type":"codeBlock","attrs":{"language":"yaml"},"content":[{"type":"text","text":parsed.frontmatter}]}));
        }
        converted
    };
    crate::editing::document(&doc)?;
    Ok(doc)
}
