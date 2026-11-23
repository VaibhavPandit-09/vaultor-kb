#![cfg(feature = "host")]

use lopdf::{
    content::{Content, Operation},
    dictionary, Document, EncryptionState, EncryptionVersion, Object, Stream, StringFormat,
};
use std::{
    io::Write,
    process::{Command, Stdio},
};

fn fixture(pages: &[Option<&str>]) -> Document {
    let mut pdf = Document::with_version("1.5");
    let root = pdf.new_object_id();
    let font = pdf.add_object(dictionary! {
        "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica",
    });
    let resources = pdf.add_object(dictionary! { "Font" => dictionary! { "F1" => font } });
    let mut kids = Vec::new();
    for phrase in pages {
        let operations = phrase.map_or_else(Vec::new, |text| {
            vec![
                Operation::new("BT", vec![]),
                Operation::new("Tf", vec![Object::Name(b"F1".to_vec()), 12.into()]),
                Operation::new(
                    "Tj",
                    vec![Object::String(
                        text.as_bytes().to_vec(),
                        StringFormat::Literal,
                    )],
                ),
                Operation::new("ET", vec![]),
            ]
        });
        let contents = pdf.add_object(Stream::new(
            dictionary! {},
            Content { operations }.encode().unwrap(),
        ));
        let page = pdf.add_object(dictionary! {
            "Type" => "Page", "Parent" => root, "Resources" => resources, "Contents" => contents,
            "MediaBox" => vec![0.into(), 0.into(), 400.into(), 400.into()],
        });
        kids.push(Object::Reference(page));
    }
    pdf.objects.insert(
        root,
        Object::Dictionary(dictionary! {
            "Type" => "Pages", "Count" => pages.len() as i64, "Kids" => kids,
        }),
    );
    let catalog = pdf.add_object(dictionary! { "Type" => "Catalog", "Pages" => root });
    pdf.trailer.set("Root", catalog);
    pdf.trailer.set(
        "ID",
        Object::Array(vec![
            Object::string_literal("pdf-index-fixture"),
            Object::string_literal("pdf-index-fixture"),
        ]),
    );
    pdf
}

fn bytes(pdf: &mut Document) -> Vec<u8> {
    let mut bytes = Vec::new();
    pdf.save_to(&mut bytes).unwrap();
    bytes
}

fn run(bytes: &[u8]) -> String {
    let mut worker = Command::new(env!("CARGO_BIN_EXE_vaultor-next-host"))
        .arg("--internal-pdf-text")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    worker.stdin.take().unwrap().write_all(bytes).unwrap();
    let output = worker.wait_with_output().unwrap();
    assert!(output.status.success());
    String::from_utf8(output.stdout).unwrap()
}

#[test]
fn worker_extracts_both_pages_and_classifies_unindexed_documents() {
    let body = run(&bytes(&mut fixture(&[
        Some("violet orbit"),
        Some("crimson telescope"),
    ])));
    assert!(body.starts_with('T'));
    assert!(body.contains("violet orbit"));
    assert!(body.contains("crimson telescope"));
    assert_eq!(run(&bytes(&mut fixture(&[None]))), "N");
    assert_eq!(run(b"%PDF-malformed"), "I");
    assert_eq!(run(&bytes(&mut fixture(&[None; 101]))), "L");

    for password in ["private", ""] {
        let mut doc = fixture(&[Some("protected phrase")]);
        let state = EncryptionState::try_from(EncryptionVersion::V2 {
            document: &doc,
            owner_password: "owner",
            user_password: password,
            key_length: 128,
            permissions: lopdf::Permissions::all(),
        })
        .unwrap();
        doc.encrypt(&state).unwrap();
        assert_eq!(run(&bytes(&mut doc)), "E");
    }
}
