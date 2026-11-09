//! Markdown is parsed in Rust; only verified source patches are publishable.
use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};
use serde_json::{json, Value};
use std::ops::Range;
pub struct Parsed {
    pub document: Value,
    pub ranges: Vec<Range<usize>>,
    pub frontmatter: String,
    pub reason: Option<String>,
}
struct Frame {
    node: Value,
    start: usize,
    head: bool,
}
fn content(v: &mut Value) -> &mut Vec<Value> {
    v["content"].as_array_mut().unwrap()
}
fn node(t: &str) -> Value {
    json!({"type":t,"content":[]})
}
fn push(stack: &mut [Frame], root: &mut Vec<Value>, v: Value) {
    if let Some(f) = stack.last_mut() {
        content(&mut f.node).push(v)
    } else {
        root.push(v)
    }
}
fn paragraphize(v: &mut Value) {
    let old = std::mem::take(content(v));
    let mut out = vec![];
    let mut inline = vec![];
    for n in old {
        if matches!(n["type"].as_str(), Some("text" | "hardBreak")) {
            inline.push(n)
        } else {
            if !inline.is_empty() {
                out.push(json!({"type":"paragraph","content":std::mem::take(&mut inline)}));
            }
            out.push(n)
        }
    }
    if !inline.is_empty() || out.is_empty() {
        out.push(json!({"type":"paragraph","content":inline}));
    }
    v["content"] = json!(out);
}
pub fn parse(source: &str) -> Parsed {
    let mut offset = if source.starts_with('\u{feff}') { 3 } else { 0 };
    let mut reason = if source.contains('\0') {
        Some("NUL-containing source is read-only".into())
    } else {
        None
    };
    if source[offset..].starts_with("---\n") || source[offset..].starts_with("---\r\n") {
        let mut end = None;
        let mut pos = offset;
        for (i, line) in source[offset..].split_inclusive('\n').enumerate() {
            pos += line.len();
            if i > 0 && matches!(line.trim_end_matches(['\r', '\n']), "---" | "...") {
                end = Some(pos);
                break;
            }
        }
        if let Some(end) = end {
            offset = end
        } else {
            reason = Some("Unclosed frontmatter; source view only".into());
        }
    }
    let mut stack: Vec<Frame> = vec![];
    let mut root = vec![];
    let mut ranges = vec![];
    let mut marks: Vec<Value> = vec![];
    let options = Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_GFM;
    for (event, range) in Parser::new_ext(&source[offset..], options).into_offset_iter() {
        let range = (range.start + offset)..(range.end + offset);
        if stack.len() > 64 || root.len() > 2000 {
            return Parsed {
                document: node("doc"),
                ranges: vec![],
                frontmatter: source[..offset].into(),
                reason: Some("Complex/deep source is read-only; use source view".into()),
            };
        }
        match event {
            Event::Start(tag) => {
                let mark = match &tag {
                    Tag::Emphasis => Some(json!({"type":"italic"})),
                    Tag::Strong => Some(json!({"type":"bold"})),
                    Tag::Strikethrough => Some(json!({"type":"strike"})),
                    Tag::Link {
                        dest_url, title, ..
                    } => Some(
                        json!({"type":"link","attrs":{"href":dest_url.as_ref(),"title":if title.is_empty(){Value::Null}else{json!(title.as_ref())}}}),
                    ),
                    _ => None,
                };
                if let Some(mark) = mark {
                    marks.push(mark);
                    continue;
                }
                let head = matches!(tag, Tag::TableHead);
                let mut n = match tag {
                    Tag::Paragraph => node("paragraph"),
                    Tag::Heading { level, .. } => {
                        json!({"type":"heading","attrs":{"level":level as u8},"content":[]})
                    }
                    Tag::BlockQuote(kind) => {
                        if kind.is_some() {
                            reason = Some("Extended block quotes are source-view only".into())
                        }
                        node("blockquote")
                    }
                    Tag::List(start) => {
                        if let Some(start) = start {
                            json!({"type":"orderedList","attrs":{"start":start},"content":[]})
                        } else {
                            node("bulletList")
                        }
                    }
                    Tag::Item => node("listItem"),
                    Tag::CodeBlock(kind) => {
                        let language = match kind {
                            CodeBlockKind::Indented => None,
                            CodeBlockKind::Fenced(info) => {
                                if info.split_whitespace().count() > 1 {
                                    reason = Some(
                                        "Extended code-fence attributes are source-view only"
                                            .into(),
                                    )
                                }
                                if info.is_empty() {
                                    None
                                } else {
                                    Some(info.to_string())
                                }
                            }
                        };
                        json!({"type":"codeBlock","attrs":{"language":language},"content":[]})
                    }
                    Tag::Table(align) => {
                        if align.iter().any(|a| *a != pulldown_cmark::Alignment::None) {
                            reason = Some("Aligned tables are source-view only".into())
                        }
                        node("table")
                    }
                    Tag::TableHead | Tag::TableRow => node("tableRow"),
                    Tag::TableCell => node(if stack.last().is_some_and(|f| f.head) {
                        "tableHeader"
                    } else {
                        "tableCell"
                    }),
                    _ => {
                        reason = Some(
                            "Unsupported Markdown extension, image or HTML; source view only"
                                .into(),
                        );
                        node("unsupported")
                    }
                };
                // A parser's code text carries no formatting marks.
                if n["type"] == "codeBlock" {
                    n["content"] = json!([]);
                }
                stack.push(Frame {
                    node: n,
                    start: range.start,
                    head,
                });
            }
            Event::End(tag) => {
                if matches!(
                    tag,
                    TagEnd::Emphasis | TagEnd::Strong | TagEnd::Strikethrough | TagEnd::Link
                ) {
                    marks.pop();
                    continue;
                }
                if let Some(mut f) = stack.pop() {
                    let t = f.node["type"].as_str().unwrap().to_string();
                    if matches!(
                        t.as_str(),
                        "listItem" | "taskItem" | "tableCell" | "tableHeader"
                    ) {
                        paragraphize(&mut f.node)
                    }
                    if t == "bulletList" {
                        let c = f.node["content"].as_array().unwrap();
                        if c.iter().any(|n| n["type"] == "taskItem") {
                            if c.iter().any(|n| n["type"] != "taskItem") {
                                reason =
                                    Some("Mixed task/ordinary lists are source-view only".into())
                            }
                            f.node["type"] = json!("taskList");
                        }
                    }
                    if stack.is_empty() {
                        ranges.push(f.start..range.end)
                    }
                    push(&mut stack, &mut root, f.node);
                }
            }
            Event::Text(ref t) | Event::Code(ref t) => {
                let mut n = json!({"type":"text","text":t.as_ref()});
                let mut m = marks.clone();
                if matches!(event, Event::Code(_)) {
                    m.push(json!({"type":"code"}));
                }
                if !m.is_empty() {
                    n["marks"] = json!(m)
                }
                push(&mut stack, &mut root, n);
            }
            Event::SoftBreak => push(&mut stack, &mut root, json!({"type":"text","text":"\n"})),
            Event::HardBreak => push(&mut stack, &mut root, json!({"type":"hardBreak"})),
            Event::Rule => {
                push(&mut stack, &mut root, json!({"type":"horizontalRule"}));
                if stack.is_empty() {
                    ranges.push(range)
                }
            }
            Event::TaskListMarker(checked) => {
                if let Some(f) = stack
                    .iter_mut()
                    .rev()
                    .find(|f| f.node["type"] == "listItem")
                {
                    f.node["type"] = json!("taskItem");
                    f.node["attrs"] = json!({"checked":checked});
                }
            }
            _ => {
                reason =
                    Some("Unsupported Markdown extension, image or HTML; source view only".into())
            }
        }
    }
    if root.is_empty() {
        root.push(node("paragraph"));
        ranges.push(offset..source.len());
    }
    let document = normalize(&json!({"type":"doc","content":root})).unwrap_or_else(|_| node("doc"));
    Parsed {
        document,
        ranges,
        frontmatter: source[..offset].into(),
        reason,
    }
}
/// Reject unknown semantic content rather than losing it during Markdown serialization.
pub fn normalize(v: &Value) -> Result<Value, String> {
    let t = v["type"].as_str().ok_or("Missing node type")?;
    let mut out = json!({"type":t});
    if let Some(attrs) = v["attrs"].as_object() {
        let allowed: &[&str] = match t {
            "heading" => &["level"],
            "orderedList" => &["start"],
            "taskItem" => &["checked"],
            "codeBlock" => &["language"],
            "tableCell" | "tableHeader" => &["rowspan", "colspan", "colwidth"],
            _ => &[],
        };
        for (k, value) in attrs {
            if !allowed.contains(&k.as_str()) && !value.is_null() {
                return Err(format!("Attribute {k} cannot be preserved in Markdown"));
            }
        }
    }

    match t {
        "doc" | "paragraph" | "blockquote" | "bulletList" | "listItem" | "taskList" | "table"
        | "tableRow" => {}
        "heading" => {
            out["attrs"] = json!({"level":v["attrs"]["level"].as_u64().filter(|n|(1..=6).contains(n)).ok_or("Unsupported heading")?})
        }
        "orderedList" => out["attrs"] = json!({"start":v["attrs"]["start"].as_u64().unwrap_or(1)}),
        "taskItem" => {
            out["attrs"] = json!({"checked":v["attrs"]["checked"].as_bool().unwrap_or(false)})
        }
        "codeBlock" => out["attrs"] = json!({"language":v["attrs"]["language"].as_str()}),
        "tableCell" | "tableHeader" => {
            for a in ["rowspan", "colspan"] {
                if v["attrs"][a].as_u64().is_some_and(|n| n != 1) {
                    return Err("Merged tables cannot be represented in Markdown".into());
                }
            }
            if v["attrs"]["colwidth"].is_array() {
                return Err("Column sizing cannot be represented in Markdown".into());
            }
        }
        "text" => {
            out["text"] = json!(v["text"].as_str().ok_or("Invalid text")?);
            if let Some(m) = v["marks"].as_array() {
                let mut marks = vec![];
                for mark in m {
                    let k = mark["type"].as_str().unwrap_or("");
                    marks.push(match k{"bold"|"italic"|"strike"|"code"=>json!({"type":k}),"link"=>json!({"type":"link","attrs":{"href":mark["attrs"]["href"].as_str().ok_or("Missing link target")?,"title":mark["attrs"]["title"].as_str()}}),_=>return Err(format!("{k} formatting is not supported by linked Markdown Save"))});
                }
                marks.sort_by_key(|m| m["type"].as_str().unwrap_or("").to_string());
                if !marks.is_empty() {
                    out["marks"] = json!(marks);
                }
            }
            return Ok(out);
        }
        "hardBreak" | "horizontalRule" => return Ok(out),
        _ => return Err(format!("Unsupported node: {t}")),
    }
    let mut children: Vec<Value> = vec![];
    for c in v["content"].as_array().unwrap_or(&vec![]) {
        let n = normalize(c)?;
        if n["type"] == "text" && n["text"] == "" {
            continue;
        }
        if n["type"] == "text"
            && children
                .last()
                .is_some_and(|last| last["type"] == "text" && last.get("marks") == n.get("marks"))
        {
            let last = children.last_mut().unwrap();
            last["text"] = json!(format!(
                "{}{}",
                last["text"].as_str().unwrap(),
                n["text"].as_str().unwrap()
            ));
        } else {
            children.push(n)
        }
    }
    out["content"] = json!(children);
    Ok(out)
}
fn escape(s: &str) -> String {
    s.chars()
        .flat_map(|c| {
            if "\\`*_[]<>|".contains(c) {
                vec!['\\', c]
            } else {
                vec![c]
            }
        })
        .collect()
}
fn inline(v: &Value) -> Result<String, String> {
    if v["type"] == "hardBreak" {
        return Ok("  \n".into());
    }
    if v["type"] != "text" {
        return Err("Unsupported inline content".into());
    }
    let text = v["text"].as_str().unwrap_or("");
    let mut out = escape(text);
    if let Some(m) = v["marks"].as_array() {
        for mark in m {
            out = match mark["type"].as_str().unwrap_or("") {
                "code" => {
                    let fence =
                        "`".repeat(text.split(|c| c != '`').map(str::len).max().unwrap_or(0) + 1);
                    format!("{fence} {text} {fence}")
                }
                "bold" => format!("**{out}**"),
                "italic" => format!("*{out}*"),
                "strike" => format!("~~{out}~~"),
                "link" => {
                    let href = mark["attrs"]["href"].as_str().unwrap_or("");
                    if href.contains(['\n', '\r', '<', '>']) {
                        return Err("Unsupported link target".into());
                    }
                    let title = mark["attrs"]["title"]
                        .as_str()
                        .map(|t| format!(" \"{}\"", t.replace('"', "\\\"")))
                        .unwrap_or_default();
                    format!("[{out}](<{href}>{title})")
                }
                _ => return Err("Unsupported inline formatting".into()),
            }
        }
    }
    Ok(out)
}
fn serialize(v: &Value) -> Result<String, String> {
    let c = v["content"].as_array().cloned().unwrap_or_default();
    Ok(match v["type"].as_str().unwrap_or("") {
        "paragraph" => c
            .iter()
            .map(inline)
            .collect::<Result<Vec<_>, _>>()?
            .join(""),
        "heading" => format!(
            "{} {}",
            "#".repeat(v["attrs"]["level"].as_u64().unwrap_or(1) as usize),
            c.iter()
                .map(inline)
                .collect::<Result<Vec<_>, _>>()?
                .join("")
        ),
        "horizontalRule" => "---".into(),
        "blockquote" => c
            .iter()
            .map(serialize)
            .collect::<Result<Vec<_>, _>>()?
            .join("\n\n")
            .lines()
            .map(|l| format!("> {l}"))
            .collect::<Vec<_>>()
            .join("\n"),
        "codeBlock" => {
            let text = c
                .iter()
                .map(|n| n["text"].as_str().unwrap_or(""))
                .collect::<String>();
            let fence =
                "`".repeat(3.max(text.split(|c| c != '`').map(str::len).max().unwrap_or(0) + 1));
            format!(
                "{fence}{}\n{}{fence}",
                v["attrs"]["language"].as_str().unwrap_or(""),
                if text.ends_with('\n') {
                    text
                } else {
                    format!("{text}\n")
                }
            )
        }
        "bulletList" | "orderedList" | "taskList" => {
            let mut lines = vec![];
            for (i, item) in c.iter().enumerate() {
                let prefix = match v["type"].as_str().unwrap() {
                    "orderedList" => {
                        format!("{}. ", v["attrs"]["start"].as_u64().unwrap_or(1) + i as u64)
                    }
                    "taskList" => format!(
                        "- [{}] ",
                        if item["attrs"]["checked"] == true {
                            "x"
                        } else {
                            " "
                        }
                    ),
                    _ => "- ".into(),
                };
                let body = item["content"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(serialize)
                    .collect::<Result<Vec<_>, _>>()?
                    .join("\n\n");
                let mut pieces = body.lines();
                lines.push(format!("{prefix}{}", pieces.next().unwrap_or("")));
                for line in pieces {
                    lines.push(format!("{}{line}", " ".repeat(prefix.len())));
                }
            }
            lines.join("\n")
        }
        "table" => {
            let mut lines = vec![];
            for (i, row) in c.iter().enumerate() {
                let cells = row["content"].as_array().unwrap();
                let mut texts = vec![];
                for cell in cells {
                    let blocks = cell["content"].as_array().unwrap();
                    if blocks.len() != 1 || blocks[0]["type"] != "paragraph" {
                        return Err("Only single-paragraph table cells support Save".into());
                    }
                    let t = serialize(&blocks[0])?;
                    if t.contains('\n') {
                        return Err("Multiline cells are read-only".into());
                    }
                    texts.push(t);
                }
                lines.push(format!("| {} |", texts.join(" | ")));
                if i == 0 {
                    lines.push(format!("| {} |", vec!["---"; cells.len()].join(" | ")));
                }
            }
            lines.join("\n")
        }
        _ => return Err("Unsupported structural edit".into()),
    })
}
fn text_change(a: &Value, b: &Value, change: &mut Option<(String, String, bool)>) -> bool {
    if a == b {
        return true;
    }
    if a["type"] == "text" && b["type"] == "text" && a.get("marks") == b.get("marks") {
        if change.is_some() {
            return false;
        }
        *change = Some((
            a["text"].as_str().unwrap().into(),
            b["text"].as_str().unwrap().into(),
            false,
        ));
        return true;
    }
    let mut aa = a.clone();
    let mut bb = b.clone();
    aa.as_object_mut().unwrap().remove("content");
    bb.as_object_mut().unwrap().remove("content");
    if aa != bb {
        return false;
    }
    let ac = a["content"].as_array();
    let bc = b["content"].as_array();
    match (ac, bc) {
        (Some(ac), Some(bc)) if ac.len() == bc.len() => {
            for (a, b) in ac.iter().zip(bc) {
                if !text_change(a, b, change) {
                    return false;
                }
            }
            if a["type"] == "codeBlock" {
                if let Some(c) = change {
                    c.2 = true
                }
            }
            true
        }
        _ => false,
    }
}
fn difference(a: &str, b: &str) -> (usize, usize, usize) {
    let prefix = a
        .chars()
        .zip(b.chars())
        .take_while(|(a, b)| a == b)
        .map(|(c, _)| c.len_utf8())
        .sum::<usize>();
    let suffix = a[prefix..]
        .chars()
        .rev()
        .zip(b[prefix..].chars().rev())
        .take_while(|(a, b)| a == b)
        .map(|(c, _)| c.len_utf8())
        .sum::<usize>();
    (prefix, a.len() - suffix, b.len() - suffix)
}
fn source_style(raw: &str, node: &Value, canonical: String) -> String {
    if node["type"] == "bulletList" || node["type"] == "taskList" {
        let marker = raw
            .trim_start()
            .chars()
            .next()
            .filter(|c| "*+-".contains(*c))
            .unwrap_or('-');
        return canonical
            .lines()
            .map(|line| {
                let trimmed = line.trim_start();
                if trimmed.starts_with("- ") {
                    let indent = line.len() - trimmed.len();
                    format!("{}{marker}{}", &line[..indent], &trimmed[1..])
                } else {
                    line.into()
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
    }
    canonical
}
fn canonical_fragment(raw: &str, old: &Value, new: &Value) -> Option<String> {
    let a = source_style(raw, old, serialize(old).ok()?);
    let b = source_style(raw, new, serialize(new).ok()?);
    let (p, end, new_end) = difference(&a, &b);
    let before = &a[p..end];
    let after = &b[p..new_end];
    if !before.is_empty() {
        let positions = raw.match_indices(before).take(17).collect::<Vec<_>>();
        if positions.len() == 1 {
            let at = positions[0].0;
            return Some(format!(
                "{}{}{}",
                &raw[..at],
                after,
                &raw[at + before.len()..]
            ));
        }
    } else {
        for count in (1..=16).rev() {
            let left = a[..p]
                .chars()
                .rev()
                .take(count)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<String>();
            let right = a[end..].chars().take(count).collect::<String>();
            let positions = raw
                .char_indices()
                .map(|(i, _)| i)
                .chain(Some(raw.len()))
                .filter(|i| raw[..*i].ends_with(&left) && raw[*i..].starts_with(&right))
                .take(2)
                .collect::<Vec<_>>();
            if positions.len() == 1 {
                let i = positions[0];
                return Some(format!("{}{}{}", &raw[..i], after, &raw[i..]));
            }
        }
    }
    None
}
pub fn patch(source: &str, proposed: &Value) -> Result<String, String> {
    let parsed = parse(source);
    if let Some(reason) = parsed.reason {
        return Err(reason);
    }
    let wanted = normalize(proposed)?;
    if wanted == parsed.document {
        return Ok(source.into());
    }
    if source.len() > 256 * 1024 {
        return Err("Documents over 256 KiB are source-view only".into());
    }
    let old = parsed.document["content"].as_array().unwrap();
    let new = wanted["content"].as_array().ok_or("Invalid document")?;
    let mut out = source.to_string();
    let mut patches = vec![];
    if old.len() == new.len() {
        for (i, (a, b)) in old.iter().zip(new).enumerate() {
            if a == b {
                continue;
            }
            let r = parsed.ranges[i].clone();
            let raw = &source[r.clone()];
            let mut change = None;
            let mut replaced = None;
            if text_change(a, b, &mut change) {
                if let Some((before, after, code)) = change {
                    if !before.is_empty() && raw.match_indices(&before).count() == 1 {
                        let position = raw.find(&before).unwrap();
                        let (p, end, new_end) = difference(&before, &after);
                        let replacement = if code {
                            after[p..new_end].to_string()
                        } else {
                            escape(&after[p..new_end])
                        };
                        let candidate = format!(
                            "{}{}{}",
                            &raw[..position + p],
                            replacement,
                            &raw[position + end..]
                        );
                        let mut attempt = source.to_string();
                        attempt.replace_range(r.clone(), &candidate);
                        let p = parse(&attempt);
                        let mut expectation = parsed.document.clone();
                        expectation["content"][i] = b.clone();
                        if p.reason.is_none() && p.document == expectation {
                            replaced = Some(candidate);
                        }
                    }
                }
            }
            if replaced.is_none() {
                if let Some(candidate) = canonical_fragment(raw, a, b) {
                    let mut attempt = source.to_string();
                    attempt.replace_range(r.clone(), &candidate);
                    let parsed_attempt = parse(&attempt);
                    let mut expectation = parsed.document.clone();
                    expectation["content"][i] = b.clone();
                    if parsed_attempt.reason.is_none() && parsed_attempt.document == expectation {
                        replaced = Some(candidate);
                    }
                }
            }
            let replacement = if let Some(s) = replaced {
                s
            } else {
                if raw.contains("][") || raw.contains("]:") {
                    return Err("This edit would rewrite reference-link syntax; make a smaller edit. Draft retained.".into());
                }
                if a["type"] == "codeBlock" || a["type"] == "table" {
                    return Err("This code/table edit cannot preserve source syntax; use smaller edits. Draft retained.".into());
                }
                let serialized = serialize(b)?;
                let ending = if raw.ends_with("\r\n") {
                    "\r\n"
                } else if raw.ends_with('\n') {
                    "\n"
                } else {
                    ""
                };
                format!(
                    "{}{ending}",
                    if raw.contains("\r\n") {
                        serialized.replace('\n', "\r\n")
                    } else {
                        serialized
                    }
                )
            };
            patches.push((r, replacement));
        }
    } else {
        let prefix = old.iter().zip(new).take_while(|(a, b)| a == b).count();
        let suffix = old[prefix..]
            .iter()
            .rev()
            .zip(new[prefix..].iter().rev())
            .take_while(|(a, b)| a == b)
            .count();
        let old_end = old.len() - suffix;
        let new_end = new.len() - suffix;
        if old[prefix..old_end]
            .iter()
            .any(|a| new[prefix..new_end].contains(a))
        {
            return Err(
                "This structural change spans unchanged blocks; split it into smaller Saves".into(),
            );
        }
        for i in prefix..old_end.saturating_sub(1) {
            if !source[parsed.ranges[i].end..parsed.ranges[i + 1].start]
                .trim()
                .is_empty()
            {
                return Err(
                    "Structural edit spans protected source between blocks; make smaller edits"
                        .into(),
                );
            }
        }
        let start = if prefix < old.len() {
            parsed.ranges[prefix].start
        } else {
            source.len()
        };
        let end = if old_end > prefix {
            parsed.ranges[old_end - 1].end
        } else {
            start
        };
        let eol = if source.contains("\r\n") {
            "\r\n"
        } else {
            "\n"
        };
        let body = new[prefix..new_end]
            .iter()
            .map(serialize)
            .collect::<Result<Vec<_>, _>>()?
            .join("\n\n")
            .replace('\n', eol);
        let prefix_sep = if start == source.len() && !source.ends_with(&format!("{eol}{eol}")) {
            format!("{eol}{eol}")
        } else {
            String::new()
        };
        patches.push((start..end, format!("{prefix_sep}{body}{eol}{eol}")));
    }
    for (range, text) in patches.into_iter().rev() {
        out.replace_range(range, &text)
    }
    let checked = parse(&out);
    if checked.reason.is_some() || checked.document != wanted {
        return Err(
            "Edit cannot be represented faithfully; draft retained. Undo or make a smaller edit."
                .into(),
        );
    }
    Ok(out)
}
