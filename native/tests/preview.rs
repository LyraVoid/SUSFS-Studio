use std::io::Write;
use std::process::{Command, Stdio};

fn preview(input: &[u8]) -> serde_json::Value {
    let mut child = Command::new(env!("CARGO_BIN_EXE_studioctl"))
        .arg("preview")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.take().unwrap().write_all(input).unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn reads_archive_from_stdin_without_changing_it() {
    let input = include_bytes!("../../contracts/archive-v1.json");
    assert_eq!(preview(input)["data"], "valid");
    assert_eq!(preview(b"{\"schema\":2}")["data"], "unknown");
    assert_eq!(preview(b"\xff")["data"], "invalid");
    assert_eq!(preview(&vec![b' '; 128 * 1024 + 1])["data"], "invalid");
}

#[test]
fn shared_depth_and_number_boundaries() {
    let deep = |nested: usize| {
        format!(
            "{{\"extra\":{}0{}}}",
            "[".repeat(nested),
            "]".repeat(nested)
        )
    };
    assert_eq!(preview(deep(63).as_bytes())["data"], "unknown");
    assert_eq!(preview(deep(64).as_bytes())["data"], "invalid");
    assert_eq!(preview(b"{\"format\":\"susfs-studio\",\"schema\":1,\"rules\":{\"paths\":[],\"maps\":[],\"kstats\":[],\"redirects\":[]},\"future\":1e1000}")["data"], "valid");
    assert_eq!(
        preview(br#"{"$serde_json::private::Number":"1"}"#)["data"],
        "unknown"
    );
}
