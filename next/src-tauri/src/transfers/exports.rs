use super::*;
use zip::{write::SimpleFileOptions, ZipWriter};

pub(super) fn markdown_zip(
    root: &str,
    dir: &Path,
    manifest: &Manifest,
    ctx: &mut Context,
) -> Result<Value, String> {
    let path = dir.join("Markdown with assets.zip");
    let mut zip = ZipWriter::new(
        OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&path)
            .map_err(error)?,
    );
    let mut names = HashMap::new();
    let files = manifest
        .originals
        .iter()
        .filter(|file| file.kind == "file")
        .map(|file| (file.id.as_str(), file))
        .collect::<HashMap<_, _>>();
    for resource in &manifest.resources {
        let name = match files.get(resource.id.as_str()) {
            Some(file) => format!("assets/{}-{}", resource.id, file.name),
            None => format!("{}-{}.md", resource.id, safe_name(&resource.title)),
        };
        names.insert(resource.id.as_str(), name);
    }
    let mut issues = Vec::new();
    for (index, resource) in manifest.resources.iter().enumerate() {
        ctx.check()?;
        zip.start_file(&names[resource.id.as_str()], SimpleFileOptions::default())
            .map_err(error)?;
        if let Some(original) = files.get(resource.id.as_str()) {
            let (bytes, hash) = copy_hash(
                plain_file(&original_path(Path::new(root), &original.id)?)?,
                &mut zip,
                MAX_FILE,
                |_| ctx.check(),
            )?;
            if bytes != original.bytes || hash != original.hash {
                return Err("Managed asset integrity mismatch".into());
            }
        } else {
            let body = render_document(&resource.content, true, &names, &mut issues)?;
            zip.write_all(body.as_bytes()).map_err(error)?;
        }
        ctx.progress(
            "Packaging Markdown and assets",
            index as u64 + 1,
            Some(manifest.resources.len() as u64),
            0,
            None,
        );
    }
    zip.finish().map_err(error)?.sync_all().map_err(error)?;
    Ok(json!({"bytes":fs::metadata(path).map_err(error)?.len(),"issues":issues}))
}

pub(super) fn graph(w: &Workspace, ids: &[String]) -> Result<Value, String> {
    let selected = ids.iter().collect::<HashSet<_>>();
    let mut nodes = Vec::new();
    let mut seen = HashSet::new();
    let mut query=w.db.prepare("SELECT r.title, CASE WHEN r.id LIKE 'linked:%' THEN 'linkedMarkdown' ELSE COALESCE(o.kind,'note') END FROM visible_resources r LEFT JOIN managed_originals o ON o.resource_id=r.id WHERE r.id=?1 AND NOT EXISTS(SELECT 1 FROM resource_state s WHERE s.resource_id=r.id AND s.trashed=1)").map_err(error)?;
    let mut edges=w.db.prepare("SELECT target_id,kind,occurrences FROM saved_reference_edges WHERE source_id=?1 ORDER BY 1,2 LIMIT 50001").map_err(error)?;
    let mut relationships = Vec::new();
    for id in ids {
        if !seen.insert(id) {
            continue;
        }
        let (title, kind): (String, String) = query
            .query_row([id], |r| Ok((r.get(0)?, r.get(1)?)))
            .optional()
            .map_err(error)?
            .ok_or("Selected resource is no longer available")?;
        nodes.push(json!({"id":id,"title":title,"kind":kind}));
        for row in edges
            .query_map([id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<i64>>(2)?,
                ))
            })
            .map_err(error)?
        {
            let (target, kind, occurrences) = row.map_err(error)?;
            relationships.push(json!({"source":id,"target":selected.contains(&target).then_some(target),"kind":kind,"occurrences":occurrences}));
            if relationships.len() > 50000 {
                return Err("Relationship export exceeds 50,000 edges".into());
            }
        }
    }
    Ok(
        json!({"format":"vaultor-next-relationships","version":1,"nodes":nodes,"relationships":relationships}),
    )
}

fn escape(value: &str) -> String {
    let mut result = String::new();
    for character in value.chars() {
        if matches!(
            character,
            '\\' | '*' | '_' | '[' | ']' | '<' | '>' | '\x60' | '|' | '~' | '#' | '!' | '+'
        ) {
            result.push('\\');
        }
        result.push(character);
    }
    result
}

fn escaped_url(value: &str) -> String {
    value
        .split('/')
        .map(|part| {
            percent_encoding::utf8_percent_encode(part, percent_encoding::NON_ALPHANUMERIC)
                .to_string()
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn code_delimiter(value: &str, minimum: usize) -> String {
    let longest = value
        .split(|c| c != '\x60')
        .map(str::len)
        .max()
        .unwrap_or(0);
    "\x60".repeat((longest + 1).max(minimum))
}

pub(super) fn render_document(
    node: &Value,
    markdown: bool,
    links: &HashMap<&str, String>,
    issues: &mut Vec<String>,
) -> Result<String, String> {
    let kind = node["type"].as_str().ok_or("Invalid editor node")?;
    let children = node["content"].as_array().map(Vec::as_slice).unwrap_or(&[]);
    let attrs = &node["attrs"];
    if kind == "text" {
        let raw = node["text"].as_str().unwrap_or("");
        if !markdown {
            return Ok(raw.into());
        }
        let mut text = escape(raw);
        if let Some(marks) = node["marks"].as_array() {
            for mark in marks {
                text = match mark["type"].as_str() {
                    Some("bold") => format!("**{text}**"),
                    Some("italic") => format!("*{text}*"),
                    Some("strike") => format!("~~{text}~~"),
                    Some("code") => {
                        let fence = code_delimiter(raw, 1);
                        if raw.contains('\x60') || raw.starts_with(' ') || raw.ends_with(' ') {
                            format!("{fence} {raw} {fence}")
                        } else {
                            format!("{fence}{raw}{fence}")
                        }
                    }
                    Some("underline") => format!("<u>{text}</u>"),
                    Some("link") => {
                        let href = mark["attrs"]["href"].as_str().unwrap_or("");
                        if !href.contains(['\r', '\n', '<', '>'])
                            && href.split_once(':').is_none_or(|(scheme, _)| {
                                matches!(scheme, "http" | "https" | "mailto")
                            })
                        {
                            format!("[{text}](<{href}>)")
                        } else {
                            text
                        }
                    }
                    _ => {
                        if issues.len() < 100 {
                            issues.push("An editor mark has no Markdown equivalent".into());
                        }
                        text
                    }
                }
            }
        }
        return Ok(text);
    }
    if matches!(kind, "resourceLink" | "image") {
        let image = kind == "image";
        let label = attrs[if image { "alt" } else { "label" }]
            .as_str()
            .filter(|s| !s.is_empty())
            .unwrap_or(if image { "Image" } else { "Resource" });
        let ending = if image { "\n\n" } else { "" };
        return Ok(
            match (
                markdown,
                attrs["resourceId"].as_str().and_then(|id| links.get(id)),
            ) {
                (true, Some(target)) => format!(
                    "{}[{}](<{}>){ending}",
                    if image { "!" } else { "" },
                    escape(label),
                    escaped_url(target)
                ),
                (true, None) => {
                    if issues.len() < 100 {
                        issues.push(format!(
                            "{label}: referenced resource is outside this export"
                        ));
                    }
                    format!("{} (resource unavailable){ending}", escape(label))
                }
                _ => format!("{label}{ending}"),
            },
        );
    }
    if kind == "codeBlock" {
        let raw = children
            .iter()
            .filter_map(|child| child["text"].as_str())
            .collect::<String>();
        let language = attrs["language"]
            .as_str()
            .filter(|value| {
                value
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '_' | '#'))
            })
            .unwrap_or("");
        let fence = code_delimiter(&raw, 3);
        return Ok(if markdown {
            format!("{fence}{language}\n{raw}\n{fence}\n\n")
        } else {
            format!("{raw}\n\n")
        });
    }
    let mut rendered = children
        .iter()
        .map(|child| render_document(child, markdown, links, issues))
        .collect::<Result<Vec<_>, _>>()?;
    let inner = rendered.concat();
    Ok(match kind {
        "doc" | "listItem" | "taskItem" => inner,
        "paragraph" => format!("{inner}\n\n"),
        "heading" => format!(
            "{}{inner}\n\n",
            if markdown {
                format!(
                    "{} ",
                    "#".repeat(attrs["level"].as_u64().unwrap_or(1).clamp(1, 6) as usize)
                )
            } else {
                String::new()
            }
        ),
        "horizontalRule" => "---\n\n".into(),
        "hardBreak" => {
            if markdown {
                "  \n".into()
            } else {
                "\n".into()
            }
        }
        "blockquote" if markdown => {
            inner
                .trim_end()
                .lines()
                .map(|line| format!("> {line}\n"))
                .collect::<String>()
                + "\n"
        }
        "blockquote" => inner,
        "orderedList" | "bulletList" | "taskList" => {
            let start = attrs["start"].as_u64().unwrap_or(1);
            for (index, item) in rendered.iter_mut().enumerate() {
                let prefix = match kind {
                    "orderedList" => format!("{}. ", start.saturating_add(index as u64)),
                    "taskList" => format!(
                        "- [{}] ",
                        if children[index]["attrs"]["checked"] == true {
                            "x"
                        } else {
                            " "
                        }
                    ),
                    _ => "- ".into(),
                };
                let indent = " ".repeat(prefix.len());
                *item = prefix + &item.trim_end().replace('\n', &format!("\n{indent}")) + "\n";
            }
            rendered.concat() + "\n"
        }
        "tableCell" | "tableHeader" => inner.trim().replace('\n', " "),
        "tableRow" => {
            if markdown {
                format!("| {} |\n", rendered.join(" | "))
            } else {
                format!("{}\n", rendered.join("\t"))
            }
        }
        "table" => {
            if markdown && !rendered.is_empty() {
                let columns = children
                    .first()
                    .and_then(|row| row["content"].as_array())
                    .map_or(1, Vec::len);
                rendered.insert(1, format!("| {} |\n", vec!["---"; columns].join(" | ")));
            }
            let mut body = rendered.concat() + "\n";
            if markdown {
                if let Some(source) = attrs["sourceResourceId"].as_str() {
                    if let Some(path) = links.get(source) {
                        body.push_str(&format!("[Table source](<{}>)\n\n", escaped_url(path)));
                    } else if issues.len() < 100 {
                        issues.push("A table source is outside this export".into());
                    }
                }
            }
            body
        }
        _ => return Err(format!("Unsupported editor node: {kind}")),
    })
}

const DOCX_TYPES: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#;
const DOCX_RELS: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#;

fn xml(value: &str) -> String {
    value
        .chars()
        .filter(|c| {
            matches!(c, '\t' | '\r' | '\n')
                || (!c.is_control() && *c != '\u{fffe}' && *c != '\u{ffff}')
        })
        .collect::<String>()
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn word_run(text: &str, style: &str) -> String {
    let lines = text
        .lines()
        .map(|line| format!("<w:t xml:space=\"preserve\">{}</w:t>", xml(line)))
        .collect::<Vec<_>>()
        .join("<w:br/>");
    format!("<w:r><w:rPr>{style}</w:rPr>{lines}</w:r>")
}

fn word_node(node: &Value, issues: &mut Vec<String>) -> Result<String, String> {
    let kind = node["type"].as_str().ok_or("Invalid editor node")?;
    let attrs = &node["attrs"];
    let children = node["content"].as_array().map(Vec::as_slice).unwrap_or(&[]);
    if kind == "text" {
        let mut style = String::new();
        if let Some(marks) = node["marks"].as_array() {
            for mark in marks {
                style.push_str(match mark["type"].as_str() {
                    Some("bold") => "<w:b/>",
                    Some("italic") => "<w:i/>",
                    Some("strike") => "<w:strike/>",
                    Some("underline") => "<w:u w:val=\"single\"/>",
                    Some("code") => "<w:rFonts w:ascii=\"Consolas\" w:hAnsi=\"Consolas\"/>",
                    Some("link") => "<w:u w:val=\"single\"/>",
                    _ => "",
                });
            }
        }
        let mut text = node["text"].as_str().unwrap_or("").to_string();
        if let Some(href) = node["marks"]
            .as_array()
            .and_then(|marks| marks.iter().find(|mark| mark["type"] == "link"))
            .and_then(|m| m["attrs"]["href"].as_str())
        {
            if href.starts_with("https://") || href.starts_with("http://") {
                text.push_str(&format!(" ({href})"));
            }
        }
        return Ok(word_run(&text, &style));
    }
    if matches!(kind, "resourceLink" | "image") {
        let image = kind == "image";
        let label = attrs[if image { "alt" } else { "label" }]
            .as_str()
            .filter(|label| !label.is_empty())
            .unwrap_or(if image { "Image" } else { "Resource" });
        if issues.len() < 100 {
            issues.push(format!("{label}: retained as text in Word export"));
        }
        let run = word_run(label, "<w:i/>");
        return Ok(if image {
            format!("<w:p>{run}</w:p>")
        } else {
            run
        });
    }
    let inner = children
        .iter()
        .map(|child| word_node(child, issues))
        .collect::<Result<Vec<_>, _>>()?
        .concat();
    Ok(match kind {
        "doc" | "listItem" | "taskItem" => inner,
        "paragraph" => format!("<w:p>{inner}</w:p>"),
        "heading" => {
            let level = attrs["level"].as_u64().unwrap_or(1).clamp(1, 6);
            let size = 38 - 4 * level;
            format!("<w:p><w:pPr><w:keepNext/><w:outlineLvl w:val=\"{}\"/><w:rPr><w:b/><w:sz w:val=\"{size}\"/></w:rPr></w:pPr>{inner}</w:p>",level-1)
        }
        "hardBreak" => "<w:r><w:br/></w:r>".into(),
        "horizontalRule" => {
            "<w:p><w:pPr><w:pBdr><w:bottom w:val=\"single\" w:sz=\"4\"/></w:pBdr></w:pPr></w:p>"
                .into()
        }
        "blockquote" => format!(
            "<w:p>{}</w:p>",
            word_run(
                &render_document(node, false, &HashMap::new(), issues)?,
                "<w:i/>"
            )
        ),
        "codeBlock" => format!(
            "<w:p>{}</w:p>",
            word_run(
                &children
                    .iter()
                    .filter_map(|child| child["text"].as_str())
                    .collect::<String>(),
                "<w:rFonts w:ascii=\"Consolas\" w:hAnsi=\"Consolas\"/>"
            )
        ),
        "orderedList" | "bulletList" | "taskList" => {
            let start = attrs["start"].as_u64().unwrap_or(1);
            let mut list = String::new();
            for (index, child) in children.iter().enumerate() {
                let prefix = match kind {
                    "orderedList" => format!("{}. ", start.saturating_add(index as u64)),
                    "taskList" => {
                        if child["attrs"]["checked"] == true {
                            "[x] ".into()
                        } else {
                            "[ ] ".into()
                        }
                    }
                    _ => "• ".into(),
                };
                let item = word_node(child, issues)?;
                if let Some(body) = item.strip_prefix("<w:p>") {
                    list.push_str("<w:p>");
                    list.push_str(&word_run(&prefix, ""));
                    list.push_str(body);
                } else {
                    list.push_str(&format!("<w:p>{}</w:p>{item}", word_run(&prefix, "")));
                }
            }
            list
        }
        "table" => {
            format!("<w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/></w:tblPr>{inner}</w:tbl>")
        }
        "tableRow" => format!("<w:tr>{inner}</w:tr>"),
        "tableCell" | "tableHeader" => format!(
            "<w:tc>{}</w:tc>",
            if inner.is_empty() {
                "<w:p/>".into()
            } else {
                inner
            }
        ),
        _ => return Err(format!("Unsupported Word node: {kind}")),
    })
}

pub(super) fn docx(file: File, content: &Value, issues: &mut Vec<String>) -> Result<(), String> {
    let body = word_node(content, issues)?;
    let document = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>"#
    );
    let mut output = ZipWriter::new(file);
    for (path, value) in [
        ("[Content_Types].xml", DOCX_TYPES),
        ("_rels/.rels", DOCX_RELS),
        ("word/document.xml", &document),
    ] {
        output
            .start_file(path, SimpleFileOptions::default())
            .map_err(error)?;
        output.write_all(value.as_bytes()).map_err(error)?;
    }
    output.finish().map_err(error)?.sync_all().map_err(error)
}

pub(super) fn pdf(
    mut file: File,
    title: &str,
    content: &Value,
    issues: &mut Vec<String>,
    ctx: &mut Context,
) -> Result<(), String> {
    use pdf_writer::{Content, Finish, Name, Pdf, Rect, Ref, Str};
    let text = render_document(content, false, &HashMap::new(), issues)?;
    let display = format!("{title}\n\n{}", text.trim_end()).replace('\t', "    ");
    let (encoded, _, unsupported) = encoding_rs::WINDOWS_1252.encode(&display);
    if unsupported
        || encoded
            .iter()
            .any(|&byte| byte < 32 && byte != b'\n' && byte != b'\r')
    {
        return Err("PDF text requires Western European characters. Choose Word or Markdown to keep the full text.".into());
    }
    if issues.len() < 100 {
        issues.push("PDF uses a text layout. Word and Markdown preserve more formatting.".into());
    }
    let mut lines = Vec::new();
    for line in encoded.split(|&byte| byte == b'\n') {
        let line = line.strip_suffix(b"\r").unwrap_or(line);
        if line.is_empty() {
            lines.push(line);
        }
        lines.extend(line.chunks(80));
    }
    let mut pdf = Pdf::new();
    let pages = Ref::new(2);
    let font = Ref::new(3);
    let face = Name(b"F1");
    pdf.catalog(Ref::new(1)).pages(pages);
    pdf.type1_font(font)
        .base_font(Name(b"Courier"))
        .encoding_predefined(Name(b"WinAnsiEncoding"));
    let count = lines.len().div_ceil(54) as i32;
    pdf.pages(pages)
        .kids((0..count).map(|i| Ref::new(4 + 2 * i)))
        .count(count);
    for (index, lines) in lines.chunks(54).enumerate() {
        ctx.check()?;
        let page = Ref::new(4 + 2 * index as i32);
        let stream = Ref::new(5 + 2 * index as i32);
        let mut entry = pdf.page(page);
        entry
            .parent(pages)
            .media_box(Rect::new(0.0, 0.0, 595.0, 842.0))
            .contents(stream);
        entry.resources().fonts().pair(face, font);
        entry.finish();
        let mut text = Content::new();
        text.begin_text()
            .set_font(face, 10.0)
            .set_leading(14.0)
            .next_line(52.0, 790.0);
        for &line in lines {
            text.show(Str(line)).next_line_using_leading();
        }
        text.end_text();
        pdf.stream(stream, &text.finish());
    }
    file.write_all(&pdf.finish()).map_err(error)?;
    file.sync_all().map_err(error)
}
