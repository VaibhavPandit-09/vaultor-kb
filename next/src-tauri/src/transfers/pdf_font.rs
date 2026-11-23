use super::{error, Context, HashMap};
use pdf_writer::{
    types::{CidFontType, FontFlags, SystemInfo, UnicodeCmap},
    Finish, Name, Pdf, Rect, Ref, Str,
};

const FONT: &[u8] =
    include_bytes!("../../../../backend/src/main/resources/fonts/NotoSans-Regular.ttf");
const LICENSE: &str = include_str!("../../../../backend/src/main/resources/fonts/OFL.txt");

pub(super) fn encode(
    pdf: &mut Pdf,
    font: Ref,
    display: &str,
    ctx: &Context,
) -> Result<Vec<Vec<u8>>, String> {
    let face = ttf_parser::Face::parse(FONT, 0).map_err(error)?;
    let system = SystemInfo {
        registry: Str(b"Adobe"),
        ordering: Str(b"Identity"),
        supplement: 0,
    };
    let mut cmap = UnicodeCmap::<u16>::new(Name(b"VaultorText"), system);
    let mut map = vec![0, 0];
    let mut widths = Vec::new();
    let mut codes: HashMap<char, (u16, f32)> = HashMap::new();
    let mut lines = Vec::new();
    let units = 1000.0 / f32::from(face.units_per_em());
    for line in display.split('\n') {
        ctx.check()?;
        let mut glyphs = Vec::new();
        for (index, character) in line.trim_end_matches('\r').chars().enumerate() {
            if index % 4096 == 0 {
                ctx.check()?;
            }
            let code = if let Some(code) = codes.get(&character) {
                *code
            } else {
                let glyph = face.glyph_index(character).filter(|_| !character.is_control()).ok_or_else(||
                    format!("The PDF font does not cover U+{:04X}. Choose Word or Markdown to keep the text.", character as u32)
                )?;
                let width = f32::from(
                    face.glyph_hor_advance(glyph)
                        .ok_or("PDF font has no glyph width")?,
                ) * units;
                let cid = u16::try_from(widths.len() + 1).map_err(error)?;
                cmap.pair(cid, character);
                map.extend_from_slice(&glyph.0.to_be_bytes());
                widths.push(width);
                codes.insert(character, (cid, width));
                (cid, width)
            };
            glyphs.push((code, character == ' '));
        }
        if glyphs.is_empty() {
            lines.push(Vec::new());
        }
        let mut remaining = glyphs.as_slice();
        while !remaining.is_empty() {
            let mut width = 0.0;
            let mut last_space = None;
            let mut end = remaining.len();
            for (index, ((_, advance), space)) in remaining.iter().enumerate() {
                width += advance;
                if width > 49_000.0 && index > 0 {
                    end = last_space.unwrap_or(index);
                    break;
                }
                if *space && width > 24_500.0 {
                    last_space = Some(index + 1);
                }
            }
            let (line, rest) = remaining.split_at(end);
            lines.push(
                line.iter()
                    .flat_map(|((id, _), _)| id.to_be_bytes())
                    .collect(),
            );
            remaining = rest;
        }
    }
    let descendant = Ref::new(4);
    let descriptor = Ref::new(5);
    let font_file = Ref::new(6);
    let unicode = Ref::new(7);
    let glyph_map = Ref::new(8);
    let name = Name(b"NotoSans-Regular");
    pdf.type0_font(font)
        .base_font(name)
        .encoding_predefined(Name(b"Identity-H"))
        .descendant_font(descendant)
        .to_unicode(unicode);
    let mut child = pdf.cid_font(descendant);
    child
        .subtype(CidFontType::Type2)
        .base_font(name)
        .system_info(system)
        .font_descriptor(descriptor)
        .cid_to_gid_map_stream(glyph_map)
        .widths()
        .consecutive(1, widths);
    child.finish();
    let bbox = face.global_bounding_box();
    pdf.font_descriptor(descriptor)
        .name(name)
        .flags(FontFlags::NON_SYMBOLIC)
        .bbox(Rect::new(
            bbox.x_min as f32 * units,
            bbox.y_min as f32 * units,
            bbox.x_max as f32 * units,
            bbox.y_max as f32 * units,
        ))
        .italic_angle(0.0)
        .ascent(face.ascender() as f32 * units)
        .descent(face.descender() as f32 * units)
        .cap_height(face.capital_height().unwrap_or(face.ascender()) as f32 * units)
        .stem_v(80.0)
        .font_file2(font_file);
    pdf.stream(font_file, FONT)
        .pair(Name(b"Length1"), FONT.len() as i32)
        .pair(Name(b"VaultorFontLicense"), Str(LICENSE.as_bytes()));
    pdf.stream(unicode, &cmap.finish());
    pdf.stream(glyph_map, &map);
    Ok(lines)
}
