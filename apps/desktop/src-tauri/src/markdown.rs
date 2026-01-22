use comrak::{markdown_to_html, Options};

/// Parse markdown input and return HTML.
pub fn parse_markdown(input: &str) -> String {
    let mut options = Options::default();

    // GFM extensions
    options.extension.strikethrough = true;
    options.extension.table = true;
    options.extension.tasklist = true;
    options.extension.autolink = true;

    // Rendering options
    options.render.unsafe_ = true; // Allow raw HTML pass-through

    markdown_to_html(input, &options)
}

/// Tauri command to parse markdown from the frontend.
#[tauri::command]
pub async fn parse_markdown_command(markdown: String) -> Result<String, String> {
    Ok(parse_markdown(&markdown))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_markdown() {
        let input = "# Hello\n\nThis is **bold** and *italic*.";
        let html = parse_markdown(input);
        assert!(html.contains("<h1>"));
        assert!(html.contains("<strong>bold</strong>"));
        assert!(html.contains("<em>italic</em>"));
    }

    #[test]
    fn test_strikethrough() {
        let input = "~~deleted~~";
        let html = parse_markdown(input);
        assert!(html.contains("<del>deleted</del>"));
    }

    #[test]
    fn test_table() {
        let input = "| A | B |\n|---|---|\n| 1 | 2 |";
        let html = parse_markdown(input);
        assert!(html.contains("<table>"));
        assert!(html.contains("<th>"));
        assert!(html.contains("<td>"));
    }

    #[test]
    fn test_tasklist() {
        let input = "- [x] Done\n- [ ] Todo";
        let html = parse_markdown(input);
        assert!(html.contains("checked"));
    }

    #[test]
    fn test_autolink() {
        let input = "Visit https://example.com for more.";
        let html = parse_markdown(input);
        assert!(html.contains("<a href=\"https://example.com\">"));
    }

    #[test]
    fn test_code_block() {
        let input = "```rust\nfn main() {}\n```";
        let html = parse_markdown(input);
        assert!(html.contains("<pre>"));
        assert!(html.contains("<code"));
    }

    #[test]
    fn test_empty_input() {
        let html = parse_markdown("");
        assert_eq!(html, "");
    }
}
