use super::{table_layout, Context, ExportPictures, Original, Value};
use std::{fmt::Write as _, fs::File, io::Write as _};
use typst_as_lib::TypstEngine;

const REGULAR: &[u8] =
    include_bytes!("../../../../../backend/src/main/resources/fonts/NotoSans-Regular.ttf");
const BOLD: &[u8] =
    include_bytes!("../../../../../backend/src/main/resources/fonts/NotoSans-Bold.ttf");
const ITALIC: &[u8] =
    include_bytes!("fonts/NotoSans-Italic.ttf");
const BOLD_ITALIC: &[u8] =
    include_bytes!("fonts/NotoSans-BoldItalic.ttf");

const MONO: &[u8] = include_bytes!("fonts/NotoSansMono-Regular.ttf");

const PREAMBLE: &str = r##"
#set page(paper: "a4", margin: 18mm, numbering: "1", number-align: right)
#set text(font: "Noto Sans", fallback: false, size: 10pt, fill: rgb("#172033"))
#set par(leading: 4.5pt, spacing: 8pt)
#show link: set text(fill: rgb("#1d4ed8"))
#show link: underline
#let vaultor-picture(path, fraction, max-width, alt, place) = layout(size => {
  let width = calc.min(size.width * fraction, max-width)
  align(place, image(path, width: width, alt: alt))
})
"##;

/// Only the application generates Typst syntax. All note data is quoted
/// and the resolver exposes only the verified assets for this export.
struct Layout<'a, 'activity> {
    faces: [ttf_parser::Face<'static>; 4],
    pictures: &'a ExportPictures,
    file_names: &'a std::collections::HashMap<&'a str, String>,
    issues: &'a mut Vec<String>,
    ctx: &'a Context<'activity>,
}

impl Layout<'_, '_> {
    fn warn(&mut self, warning: impl Into<String>) {
        if self.issues.len() < 100 {
            self.issues.push(warning.into());
        }
    }

    fn text(&self, value: &str) -> Result<String, String> {
        let mut encoded = String::new();
        for (index, line) in value
            .replace("\r\n", "\n")
            .replace('\t', "    ")
            .split('\n')
            .enumerate()
        {
            if index != 0 {
                encoded.push_str("#linebreak()");
            }
            for (i, ch) in line.chars().enumerate() {
                if i % 4096 == 0 {
                    self.ctx.check()?;
                }
                if ch.is_control() || self.faces.iter().any(|face| face.glyph_index(ch).is_none()) {
                    return Err(format!(
                        "The PDF font does not cover U+{:04X}. Choose Word or Markdown to keep the text.",
                        ch as u32
                    ));
                }
            }
            write!(encoded, "#text({})", quote(line)).unwrap();
        }
        Ok(encoded)
    }

    fn children(&mut self, nodes: &[Value]) -> Result<String, String> {
        let mut body = String::new();
        for node in nodes {
            body.push_str(&self.node(node)?);
            if body.len() > 32 * 1024 * 1024 {
                return Err("PDF layout source exceeds 32 MiB".into());
            }
        }
        Ok(body)
    }

    fn node(&mut self, node: &Value) -> Result<String, String> {
        self.ctx.check()?;
        let kind = node["type"].as_str().ok_or("Invalid editor node")?;
        let attr = &node["attrs"];
        let nodes = children(node);
        let mut body = match kind {
            "text" => self.text(node["text"].as_str().ok_or("Invalid text")?)?,
            "resourceLink" => {
                let label = attr["label"].as_str().unwrap_or("Resource");
                self.text(label)?
            }
            "hardBreak" => "#linebreak()".into(),
            "horizontalRule" => "#line(length: 100%, stroke: 0.6pt + luma(75%))\n\n".into(),
            "image" => self.image(attr)?,
            "table" => self.table(nodes)?,
            "doc" | "listItem" | "taskItem" => self.children(nodes)?,
            "paragraph" => format!("#par[{}]\n\n", self.children(nodes)?),
            "heading" => {
                let level = attr["level"].as_u64().unwrap_or(1).clamp(1, 6);
                let size = [22, 17, 14, 12, 11, 10][level as usize - 1];
                format!("#block(sticky: true, above: 10pt, below: 8pt)[#text(size: {size}pt, weight: \"bold\")[{}]]\n\n",
                    self.children(nodes)?)
            }
            "blockquote" => format!(
                "#block(stroke: (left: 2pt + luma(55%)), inset: (left: 10pt), width: 100%)[{}]\n\n",
                self.children(nodes)?
            ),
            "codeBlock" => {
                let text = nodes
                    .iter()
                    .filter_map(|n| n["text"].as_str())
                    .collect::<String>();
                let lines = self.text(&text)?;
                format!("#block(width: 100%, fill: luma(95%), inset: 8pt)[#text(size: 9pt)[{lines}]]\n\n")
            }
            "bulletList" | "orderedList" | "taskList" => self.list(kind, attr, nodes)?,
            _ => {
                self.warn(format!(
                    "Unsupported PDF block {kind}; retained its text and children"
                ));
                self.children(nodes)?
            }
        };
        for mark in node["marks"].as_array().into_iter().flatten() {
            body = match mark["type"].as_str() {
                Some("bold") => format!("#text(weight: \"bold\")[{body}]"),
                Some("italic") => format!("#text(style: \"italic\")[{body}]"),
                Some("underline") => format!("#underline[{body}]"),
                Some("strike") => format!("#strike[{body}]"),
                Some("highlight") => format!("#highlight(fill: rgb(\"#fff2a8\"))[{body}]"),
                Some("code") => format!("#text(font: (\"Noto Sans Mono\", \"Noto Sans\"), size: 0.92em, fill: rgb(\"#374151\"))[{body}]"),
                Some("link") => {
                    let href = mark["attrs"]["href"].as_str().unwrap_or("");
                    match url::Url::parse(href).ok().filter(|url| {
                        matches!(url.scheme(), "https" | "http")
                            && url.has_host()
                            && url.username().is_empty()
                            && url.password().is_none()
                    }) {
                        Some(url) => format!("#link({})[{body}]", quote(url.as_str())),
                        None => {
                            self.warn("Unsupported PDF hyperlink target; retained the link text");
                            body
                        }
                    }
                }
                _ => {
                    self.warn("Unsupported PDF mark; retained the text");
                    body
                }
            };
        }
        Ok(body)
    }

    fn image(&mut self, attr: &Value) -> Result<String, String> {
        let alt = attr["alt"]
            .as_str()
            .filter(|value| !value.is_empty())
            .unwrap_or("Image");
        let Some((id, asset)) = attr["resourceId"]
            .as_str()
            .and_then(|id| self.pictures.assets.get(id).map(|asset| (id, asset)))
        else {
            self.warn("PDF image unavailable or unsupported; retained its label");
            let label = self.text(alt)?;
            let caption = self.text(attr["caption"].as_str().unwrap_or(""))?;
            return Ok(format!("#par[{label}]\n\n#par[{caption}]\n\n"));
        };
        let percent = attr["width"].as_u64().unwrap_or(100).clamp(20, 100);
        let alignment = match attr["alignment"].as_str() {
            Some("left") => "left",
            Some("right") => "right",
            _ => "center",
        };
        let cap = 220.0 * f64::from(asset.width) / f64::from(asset.height);
        let file = quote(&self.file_names[id]);
        let mut image = format!(
            "#vaultor-picture({file}, {percent}%, {cap:.4}mm, {}, {alignment})\n\n",
            quote(alt)
        );
        if let Some(caption) = attr["caption"].as_str().filter(|c| !c.is_empty()) {
            write!(image, "#align({alignment})[{}]\n\n", self.text(caption)?).unwrap();
        }
        Ok(image)
    }

    fn list(&mut self, kind: &str, attr: &Value, nodes: &[Value]) -> Result<String, String> {
        let mut out = if kind == "orderedList" {
            format!(
                "#enum(start: {},\n",
                attr["start"].as_u64().unwrap_or(1).clamp(1, 1_000_000)
            )
        } else {
            "#list(\n".into()
        };
        for item in nodes {
            let task = if kind == "taskList" {
                if item["attrs"]["checked"] == true {
                    self.text("[x] ")?
                } else {
                    self.text("[ ] ")?
                }
            } else {
                String::new()
            };
            writeln!(out, "[{task}{}],", self.children(children(item))?).unwrap();
        }
        out.push_str(")\n\n");
        Ok(out)
    }

    fn table(&mut self, nodes: &[Value]) -> Result<String, String> {
        let grid = table_layout(nodes)?;
        let columns = grid
            .iter()
            .map(|row| row.iter().map(|cell| cell.width).sum())
            .max()
            .unwrap_or(0);
        if columns == 0 {
            return Err("PDF table has no cells".into());
        }
        let headers = grid
            .iter()
            .take_while(|row| {
                !row.is_empty()
                    && row.iter().all(|cell| {
                        cell.height == 1
                            && cell
                                .source
                                .is_some_and(|node| node["type"] == "tableHeader")
                    })
            })
            .count();
        let wide = columns > 8;
        if wide {
            self.warn("Tables wider than eight columns use row records in PDF");
        }
        let mut out = if wide {
            String::new()
        } else {
            format!(
                "#table(columns: ({0}1fr,), stroke: 0.6pt + rgb(\"#b8c1cd\"), inset: 5pt,\n",
                "1fr, ".repeat(columns - 1)
            )
        };
        for (y, row) in grid.iter().enumerate() {
            if wide {
                writeln!(out, "#par[#strong[Row {}]]", y + 1).unwrap();
            } else if y == 0 && headers != 0 {
                out.push_str("table.header(\n");
            }
            let mut x = 0;
            for cell in row {
                if let Some(node) = cell.source {
                    let body = self.children(children(node))?;
                    if wide {
                        writeln!(out, "#par[#strong[Column {}]]\n{body}", x + 1).unwrap();
                    } else {
                        let head = if node["type"] == "tableHeader" {
                            "fill: rgb(\"#edf1f6\"), "
                        } else {
                            ""
                        };
                        writeln!(
                            out,
                            "table.cell(x: {x}, y: {y}, colspan: {}, rowspan: {}, {head}[{body}]),",
                            cell.width, cell.height
                        )
                        .unwrap();
                    }
                }
                x += cell.width;
            }
            if !wide && y + 1 == headers {
                out.push_str("),\n");
            }
        }
        if !wide {
            out.push_str(")\n\n");
        }
        Ok(out)
    }
}

fn children(node: &Value) -> &[Value] {
    node["content"].as_array().map(Vec::as_slice).unwrap_or(&[])
}

fn quote(value: &str) -> String {
    serde_json::to_string(value).expect("strings are serializable")
}

pub(in crate::transfers) fn render(
    mut file: File,
    title: &str,
    content: &Value,
    issues: &mut Vec<String>,
    root: &str,
    originals: &[Original],
    ctx: &Context<'_>,
) -> Result<(), String> {
    let pictures = ExportPictures::load(root, content, originals, ctx, true)?;
    let fonts = [REGULAR, BOLD, ITALIC, BOLD_ITALIC];
    let faces = fonts.map(|font| ttf_parser::Face::parse(font, 0).expect("bundled Noto face"));
    let file_names = pictures
        .assets
        .iter()
        .enumerate()
        .map(|(index, (id, asset))| (id.as_str(), format!("picture-{index}.{}", asset.extension)))
        .collect::<std::collections::HashMap<_, _>>();
    let mut layout = Layout {
        file_names: &file_names,
        faces,
        pictures: &pictures,
        issues,
        ctx,
    };
    let title = layout.text(title)?;
    let content = layout.node(content)?;
    let source = format!("{PREAMBLE}\n#block(sticky: true, below: 14pt)[#text(22pt, weight: \"bold\")[{title}]]\n\n{content}");
    let assets: Vec<_> = pictures
        .assets
        .iter()
        .map(|(id, asset)| (file_names[id.as_str()].as_str(), asset.bytes.as_slice()))
        .collect();
    let engine = TypstEngine::builder()
        .main_file(("export.typ", source))
        .fonts(fonts.into_iter().chain([MONO]))
        .with_static_file_resolver(assets)
        .build();
    ctx.check()?;
    let doc = engine
        .compile()
        .output
        .map_err(|e| format!("PDF layout failed: {e}"))?;
    ctx.check()?;
    let bytes = typst_pdf::pdf(&doc, &Default::default())
        .map_err(|_| "PDF could not encode the laid-out document")?;
    ctx.check()?;
    file.write_all(&bytes).map_err(super::error)?;
    file.sync_all().map_err(super::error)
}
