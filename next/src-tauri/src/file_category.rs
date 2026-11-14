//! File categories describe the preserved original filename, not decoded preview support.
pub const CATEGORIES:&[&str]=&["image","pdf","audio","video","text","other"];
pub fn sql(name:&str)->String {
    let groups=[("image",vec!["png","jpg","jpeg","gif","webp","svg","bmp","tif","tiff","avif"]),("pdf",vec!["pdf"]),("audio",vec!["mp3","wav","ogg","flac","aac","m4a","opus"]),("video",vec!["mp4","mkv","webm","avi","mov","m4v"]),("text",vec!["txt","md","markdown","csv","json","xml","html","htm","css","js","ts","log","yaml","yml","rs","py","java","toml"] )];
    let mut expression=String::from("CASE");
    for (category,extensions) in groups {let predicate=extensions.iter().map(|ext|format!("lower({name}) GLOB '*.{ext}'")).collect::<Vec<_>>().join(" OR ");expression.push_str(&format!(" WHEN ({predicate}) THEN '{category}'"));}
    expression.push_str(" ELSE 'other' END");expression
}
pub fn for_resource(id:&str)->String {format!("COALESCE((SELECT {} FROM managed_originals o WHERE o.resource_id={id} AND o.kind='file'),'')",sql("o.name"))}
