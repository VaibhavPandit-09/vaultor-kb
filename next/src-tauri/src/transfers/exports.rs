use super::*;
use std::collections::BTreeMap;
use zip::{write::SimpleFileOptions, ZipWriter};

struct TableCell<'a> {
    source: Option<&'a Value>,
    width: usize,
    height: usize,
}

fn table_layout(rows: &[Value]) -> Result<Vec<Vec<TableCell<'_>>>, String> {
    let mut active = BTreeMap::<usize, (usize, usize)>::new();
    let mut result = Vec::with_capacity(rows.len());
    for (index, row) in rows.iter().enumerate() {
        let nodes = row["content"].as_array().ok_or("Table row has no cells")?;
        if row["type"] != "tableRow" {
            return Err("Invalid table row".into());
        }
        let mut cells = Vec::new();
        let mut column = 0;
        for node in nodes {
            while let Some(&(width, _)) = active.get(&column) {
                cells.push(TableCell { source: None, width, height: 1 });
                column += width;
            }
            if !matches!(node["type"].as_str(), Some("tableCell" | "tableHeader")) {
                return Err("Invalid table cell".into());
            }
            let span = |key: &str| {
                let value = &node["attrs"][key];
                if value.is_null() { return Ok(1); }
                value.as_u64().filter(|value| (1..=500).contains(value)).map(|value| value as usize)
                    .ok_or("Invalid table span")
            };
            let width = span("colspan")?;
            let height = span("rowspan")?;
            if column + width > 500 || index + height > rows.len()
                || active.range(column..column+width).next().is_some()
            {
                return Err("Table spans overlap or exceed the table".into());
            }
            if height > 1 {
                active.insert(column, (width, index + height));
            }
            cells.push(TableCell { source: Some(node), width, height });
            column += width;
        }
        while let Some(&(width, _)) = active.get(&column) {
            cells.push(TableCell { source: None, width, height: 1 });
            column += width;
        }
        if active.range(column..).next().is_some() {
            return Err("Table has a gap before a vertical merge".into());
        }
        active.retain(|_, (_, end)| *end > index + 1);
        result.push(cells);
    }
    Ok(result)
}

fn markdown_table(
    rows: &[Vec<TableCell<'_>>],
    links: &HashMap<&str, String>,
    issues: &mut Vec<String>,
) -> Result<String, String> {
    use pulldown_cmark::{html, Event, Options, Parser};
    let mut table = String::from("<table>\n");
    for row in rows {
        table.push_str("<tr>\n");
        for cell in row {
            let Some(node) = cell.source else { continue };
            let tag = if node["type"] == "tableHeader" { "th" } else { "td" };
            let align = match node["attrs"]["textAlign"].as_str() {
                Some("left") => " align=\"left\"",
                Some("right") => " align=\"right\"",
                Some("center") => " align=\"center\"",
                _ => "",
            };
            let mut markdown = String::new();
            for child in node["content"].as_array().into_iter().flatten() {
                markdown.push_str(&render_document(child, true, links, issues)?);
            }
            let events = Parser::new_ext(&markdown, Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS)
                .map(|event| match event {
                    Event::InlineHtml(ref raw) if matches!(raw.as_ref(), "<u>" | "</u>") => event,
                    Event::Html(raw) | Event::InlineHtml(raw) => Event::Text(raw),
                    _ => event,
                });
            let mut body = String::new();
            html::push_html(&mut body, events);
            table.push_str(&format!(
                "<{tag} colspan=\"{}\" rowspan=\"{}\"{align}>{}</{tag}>\n",
                cell.width, cell.height, body.trim().replace('\n', "&#10;")
            ));
        }
        table.push_str("</tr>\n");
    }
    table.push_str("</table>\n\n");
    Ok(table)
}

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
    if !manifest.reviews.is_empty() {
        zip.start_file("reviews.json",SimpleFileOptions::default()).map_err(error)?;
        serde_json::to_writer(&mut zip,&manifest.reviews).map_err(error)?;
    }
    zip.finish().map_err(error)?.sync_all().map_err(error)?;
    Ok(json!({"bytes":fs::metadata(path).map_err(error)?.len(),"issues":issues,"reviews":manifest.reviews.len()}))
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
    if kind == "table" && markdown {
        let layout = table_layout(children)?;
        if layout.iter().flatten().any(|cell| cell.width > 1 || cell.height > 1) {
            let mut body = markdown_table(&layout, links, issues)?;
            table_source(&mut body, attrs, links, issues);
            return Ok(body);
        }
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
                table_source(&mut body, attrs, links, issues);
            }
            body
        }
        _ => return Err(format!("Unsupported editor node: {kind}")),
    })
}

fn table_source(body: &mut String, attrs: &Value, links: &HashMap<&str, String>, issues: &mut Vec<String>) {
    if let Some(source) = attrs["sourceResourceId"].as_str() {
        if let Some(path) = links.get(source) {
            body.push_str(&format!("[Table source](<{}>)\n\n", escaped_url(path)));
        } else if issues.len() < 100 {
            issues.push("A table source is outside this export".into());
        }
    }
}

const DOCX_TYPES: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="jpg" ContentType="image/jpeg"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
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
        .split('\n')
        .map(|line| line.trim_end_matches('\r').split('\t')
            .map(|text|format!("<w:t xml:space=\"preserve\">{}</w:t>", xml(text)))
            .collect::<Vec<_>>().join("<w:tab/>"))
        .collect::<Vec<_>>()
        .join("<w:br/>");
    format!("<w:r><w:rPr>{style}</w:rPr>{lines}</w:r>")
}

fn image_dependencies<'a>(node: &'a Value, ids: &mut HashSet<&'a str>) {
    if node["type"] == "image" {
        if let Some(id) = node["attrs"]["resourceId"].as_str() {
            ids.insert(id);
        }
    }
    for child in node["content"].as_array().into_iter().flatten() {
        image_dependencies(child, ids);
    }
}

pub(super) fn word_inventory(workspace: &Workspace, manifest: &mut Manifest) -> Result<(), String> {
    let mut ids = HashSet::new();
    for note in &manifest.resources {
        image_dependencies(&note.content, &mut ids);
    }
    let mut query = workspace.db.prepare(
        "SELECT o.name,o.hash,o.bytes,o.provenance FROM managed_originals o
         WHERE o.resource_id=?1 AND o.kind='file' AND NOT EXISTS(
             SELECT 1 FROM resource_state s WHERE s.resource_id=o.resource_id AND s.trashed=1)",
    ).map_err(error)?;
    let present: HashSet<_> = manifest.originals.iter().map(|original| original.id.clone()).collect();
    for id in ids {
        if present.contains(id) {
            continue;
        }
        if let Some(original) = query.query_row([id], |row| Ok(Original {
            id: id.into(), name: row.get(0)?, hash: row.get(1)?, bytes: row.get(2)?,
            kind: "file".into(), provenance: row.get(3)?,
        })).optional().map_err(error)? {
            manifest.originals.push(original);
        }
    }
    Ok(())
}

struct ExportImage {
    bytes: Vec<u8>,
    extension: &'static str,
    width: u32,
    height: u32,
}

#[derive(Default)]
struct ExportPictures {
    assets: BTreeMap<String, ExportImage>,
    placements: usize,
}

impl ExportPictures {
    fn load(root: &str, content: &Value, originals: &[Original], ctx: &Context, pdf: bool) -> Result<Self, String> {
        let mut ids = HashSet::new();
        image_dependencies(content, &mut ids);
        let mut pictures = Self::default();
        let mut total = 0;
        let mut decoded_pixels = 0;
        for original in originals.iter().filter(|file| file.kind == "file" && ids.contains(file.id.as_str())) {
            ctx.check()?;
            if original.bytes > 20 * 1024 * 1024 || total + original.bytes > 60 * 1024 * 1024 {
                continue;
            }
            let path = original_path(Path::new(root), &original.id)?;
            let mut bytes = Vec::new();
            let (size, hash) = copy_hash(plain_file(&path)?, &mut bytes, original.bytes, |_| ctx.check())?;
            if size != original.bytes || hash != original.hash {
                return Err("Export image bytes failed integrity verification".into());
            }
            let Some((mime, width, height)) = crate::media::image_type(&bytes) else { continue };
            let pixels = u64::from(width) * u64::from(height);
            if pixels == 0 || pixels > 40_000_000 {
                continue;
            }
            let extension = match mime {
                "image/png" => "png",
                "image/jpeg" => "jpg",
                "image/gif" | "image/webp" if pdf => {
                    let format = if mime == "image/gif" { image::ImageFormat::Gif } else { image::ImageFormat::WebP };
                    let decoded = image::load_from_memory_with_format(&bytes, format).map_err(error)?;
                    let mut output = std::io::Cursor::new(Vec::new());
                    decoded.write_to(&mut output, image::ImageFormat::Png).map_err(error)?;
                    bytes = output.into_inner();
                    "png"
                }
                _ => continue,
            };
            if pdf && (decoded_pixels + pixels > 80_000_000 || total + bytes.len() as u64 > 60 * 1024 * 1024) {
                return Err("PDF images exceed the export layout budget".into());
            }
            decoded_pixels += pixels;
            total += bytes.len() as u64;
            pictures.assets.insert(original.id.clone(), ExportImage { bytes, extension, width, height });
        }
        Ok(pictures)
    }

    fn placement(&mut self, attrs: &Value, label: &str) -> Option<String> {
        let id = attrs["resourceId"].as_str()?;
        let image = self.assets.get(id)?;
        self.placements += 1;
        let placement = self.placements;
        let width_percent = attrs["width"].as_u64().unwrap_or(100).clamp(1, 100) as f64;
        let scale = (560.0 * width_percent / 100.0 / f64::from(image.width))
            .min(720.0 / f64::from(image.height)).min(1.0);
        let cx = (f64::from(image.width) * scale * 9525.0).round() as u64;
        let cy = (f64::from(image.height) * scale * 9525.0).round() as u64;
        let alignment = match attrs["alignment"].as_str() {
            Some("right") => "right",
            Some("center") => "center",
            _ => "left",
        };
        let alt = xml(label).replace('"', "&quot;");
        let mut drawing = format!(r#"<w:p><w:pPr><w:jc w:val="{alignment}"/></w:pPr><w:r><w:drawing><wp:inline>
<wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="{placement}" name="Image {placement}" descr="{alt}"/>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>
<pic:nvPicPr><pic:cNvPr id="{placement}" name="Image {placement}"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="image-{id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"#);
        if let Some(caption) = attrs["caption"].as_str().filter(|value| !value.is_empty()) {
            drawing.push_str(&format!("<w:p><w:pPr><w:jc w:val=\"{alignment}\"/></w:pPr>{}</w:p>", word_run(caption, "")));
        }
        Some(drawing)
    }
}

fn word_node(node: &Value, issues: &mut Vec<String>, links: &mut Vec<String>, pictures: &mut ExportPictures, references: &HashSet<String>) -> Result<String, String> {
    let kind = node["type"].as_str().ok_or("Invalid editor node")?;
    let attrs = &node["attrs"];
    let children = node["content"].as_array().map(Vec::as_slice).unwrap_or(&[]);
    if kind == "table" {
        let layout = table_layout(children)?;
        let columns = layout.iter().map(|row| row.iter().map(|cell| cell.width).sum()).max().unwrap_or(0);
        if columns == 0 {
            return Err("Word table has no cells".into());
        }
        let column_width = 9026 / columns;
        let borders = ["top", "left", "bottom", "right", "insideH", "insideV"]
            .map(|side| format!(r#"<w:{side} w:val="single" w:sz="4" w:color="B8C1CD"/>"#)).concat();
        let grid = format!(r#"<w:gridCol w:w="{column_width}"/>"#).repeat(columns);
        let mut table = format!(r#"<w:tbl><w:tblPr><w:tblW w:w="9026" w:type="dxa"/><w:tblBorders>{borders}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>{grid}</w:tblGrid>"#);
        for row in layout {
            table.push_str("<w:tr>");
            if !row.is_empty() && row.iter().all(|cell| cell.source.is_some_and(|node| node["type"] == "tableHeader") && cell.height == 1) {
                table.push_str("<w:trPr><w:tblHeader/></w:trPr>");
            }
            for cell in row {
                let (merge, body) = if let Some(node) = cell.source {
                    let rendered = word_node_children(node, issues, links, pictures, references)?;
                    (if cell.height > 1 { "<w:vMerge w:val=\"restart\"/>" } else { "" }, rendered)
                } else {
                    ("<w:vMerge/>", String::new())
                };
                let body = if body.is_empty() { "<w:p/>" } else { &body };
                let fill = if cell.source.is_some_and(|node| node["type"] == "tableHeader") {
                    r#"<w:shd w:val="clear" w:fill="EDF1F6"/>"#
                } else { "" };
                table.push_str(&format!(r#"<w:tc><w:tcPr><w:tcW w:w="{}" w:type="dxa"/><w:gridSpan w:val="{}"/>{merge}{fill}</w:tcPr>{body}</w:tc>"#, column_width * cell.width, cell.width));
            }
            table.push_str("</w:tr>");
        }
        table.push_str("</w:tbl>");
        return Ok(table);
    }
    if kind == "text" {
        let mut style = String::new();
        if let Some(marks) = node["marks"].as_array() {
            for mark in marks {
                style.push_str(match mark["type"].as_str() {
                    Some("bold") => "<w:b/>",
                    Some("italic") => "<w:i/>",
                    Some("strike") => "<w:strike/>",
                    Some("underline") => "<w:u w:val=\"single\"/>",
                    Some("highlight") => "<w:highlight w:val=\"yellow\"/>",
                    Some("code") => "<w:rFonts w:ascii=\"Consolas\" w:hAnsi=\"Consolas\"/>",
                    Some("link") => "<w:u w:val=\"single\"/>",
                    _ => "",
                });
            }
        }
        let run = word_run(node["text"].as_str().unwrap_or(""), &style);
        let link = node["marks"]
            .as_array()
            .and_then(|marks| marks.iter().find(|mark| mark["type"] == "link"))
            .and_then(|m| m["attrs"]["href"].as_str())
            .and_then(|value|url::Url::parse(value).ok())
            .filter(|url|matches!(url.scheme(),"http"|"https")&&url.username().is_empty()
                &&url.password().is_none()&&url.host_str().is_some());
        if let Some(href)=link
        {
            links.push(href.into());
            return Ok(format!("<w:hyperlink r:id=\"link{}\">{run}</w:hyperlink>",links.len()));
        }
        return Ok(run);
    }
    if matches!(kind, "resourceLink" | "image") {
        let image = kind == "image";
        let label = attrs[if image { "alt" } else { "label" }]
            .as_str()
            .filter(|label| !label.is_empty())
            .unwrap_or(if image { "Image" } else { "Resource" });
        if image {
            if let Some(drawing) = pictures.placement(attrs, label) {
                return Ok(drawing);
            }
        }
        let missing = !image && !attrs["resourceId"].as_str().is_some_and(|id| references.contains(id));
        if (image || missing) && issues.len() < 100 {
            issues.push(format!("{label}: retained as text in Word export"));
        }
        let run = if missing { word_run(&format!("{label} (unavailable)"), "") } else { word_run(label, "") };
        return Ok(if image {
            format!("<w:p>{run}</w:p>")
        } else {
            run
        });
    }
    let inner = if matches!(kind,"blockquote"|"codeBlock"|"orderedList"|"bulletList"|"taskList") {
        String::new()
    } else {
        word_node_children(node, issues, links, pictures, references)?
    };
    Ok(match kind {
        "doc" | "listItem" | "taskItem" => inner,
        "paragraph" => format!("<w:p>{inner}</w:p>"),
        "heading" => {
            let level = attrs["level"].as_u64().unwrap_or(1).clamp(1, 6);
            format!(r#"<w:p><w:pPr><w:pStyle w:val="Heading{level}"/></w:pPr>{inner}</w:p>"#)
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
                let item = word_node(child, issues, links, pictures, references)?;
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
        _ => return Err(format!("Unsupported Word node: {kind}")),
    })
}

fn word_node_children(node: &Value, issues: &mut Vec<String>, links: &mut Vec<String>, pictures: &mut ExportPictures, references: &HashSet<String>) -> Result<String, String> {
    node["content"].as_array().into_iter().flatten()
        .map(|child| word_node(child, issues, links, pictures, references))
        .collect::<Result<Vec<_>, _>>().map(|children| children.concat())
}

#[cfg(test)]
#[test]
fn mixed_table_merges_keep_continuations_and_escape_rich_cells() {
    let cell = |text: &str, width, height| json!({
        "type":"tableCell",
        "attrs":{"colspan":width,"rowspan":height},
        "content":[{"type":"paragraph","content":[{"type":"text","text":text,"marks":[{"type":"bold"}]}]}]
    });
    let first = cell("First <safe>", 2, 2);
    let table = json!({"type":"table","content":[
        {"type":"tableRow","content":[first,cell("Across",1,1)]},
        {"type":"tableRow","content":[cell("Below",1,1)]}
    ]});
    let markdown = render_document(&table, true, &HashMap::new(), &mut vec![]).unwrap();
    assert!(markdown.contains("colspan=\"2\" rowspan=\"2\""));
    assert!(markdown.contains("<strong>First &lt;safe&gt;</strong>"));
    assert_eq!(markdown.matches("<td ").count(), 3);
    let word = word_node(&table, &mut vec![], &mut vec![], &mut ExportPictures::default(), &HashSet::new()).unwrap();
    assert!(word.contains("<w:gridSpan w:val=\"2\"/><w:vMerge w:val=\"restart\"/>"));
    assert!(word.contains("<w:gridSpan w:val=\"2\"/><w:vMerge/>"));
    assert!(word.contains("<w:gridCol w:w=\"3008\"/>"));
    assert!(word.find("<w:vMerge/>").unwrap() < word.find("Below").unwrap());
    let mut invalid = table;
    invalid["content"][0]["content"][0]["attrs"]["rowspan"] = json!(3);
    assert!(render_document(&invalid, true, &HashMap::new(), &mut vec![]).is_err());
}

pub(super) fn docx(file: File, title: &str, content: &Value, issues: &mut Vec<String>, root: &str, originals: &[Original], references: &HashSet<String>, ctx: &Context) -> Result<(), String> {
    let mut links=Vec::new();
    let mut pictures = ExportPictures::load(root, content, originals, ctx, false)?;
    let body = word_node(content, issues,&mut links,&mut pictures, references)?;
    let title = word_run(title, "<w:b/><w:sz w:val=\"44\"/>");
    let mut styles = String::from(r#"<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">"#);
    for (index, size) in [36, 32, 28, 24, 22, 20].into_iter().enumerate() {
        let level = index + 1;
        styles.push_str(&format!(r#"<w:style w:type="paragraph" w:styleId="Heading{level}"><w:name w:val="heading {level}"/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80"/><w:outlineLvl w:val="{index}"/></w:pPr><w:rPr><w:b/><w:sz w:val="{size}"/></w:rPr></w:style>"#));
    }
    styles.push_str("</w:styles>");
    let document = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body><w:p><w:pPr><w:keepNext/></w:pPr>{title}</w:p>{body}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>"#
    );
    let mut output = ZipWriter::new(file);
    for (path, value) in [
        ("[Content_Types].xml", DOCX_TYPES),
        ("_rels/.rels", DOCX_RELS),
        ("word/document.xml", &document),
        ("word/styles.xml", &styles),
    ] {
        output
            .start_file(path, SimpleFileOptions::default())
            .map_err(error)?;
        output.write_all(value.as_bytes()).map_err(error)?;
    }
    {
        let mut relations=String::from(r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>"#);
        for (index,href) in links.iter().enumerate() {
            let target=xml(href).replace('"',"&quot;");
            relations.push_str(&format!(r#"<Relationship Id="link{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="{target}" TargetMode="External"/>"#,index+1));
        }
        for (id, image) in pictures.assets {
            ctx.check()?;
            let path = format!("media/{id}.{}", image.extension);
            relations.push_str(&format!(r#"<Relationship Id="image-{id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="{path}"/>"#));
            output.start_file(format!("word/{path}"), SimpleFileOptions::default()).map_err(error)?;
            output.write_all(&image.bytes).map_err(error)?;
        }
        relations.push_str("</Relationships>");
        output.start_file("word/_rels/document.xml.rels",SimpleFileOptions::default()).map_err(error)?;
        output.write_all(relations.as_bytes()).map_err(error)?;
    }
    output.finish().map_err(error)?.sync_all().map_err(error)
}

mod pdf;
pub(super) use pdf::render as pdf;
