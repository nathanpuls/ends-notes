# Google Sheet to Markdown

Paste a public Google Sheet URL below to turn it into an ends.at page.

> The sheet must be shared so anyone with the link can view it.

## Sheet structure

If the sheet has one filled cell, that cell renders directly as Markdown.

For multiple pages, use this structure:

| Cell or column | Meaning |
| --- | --- |
| `A1` | Collection name |
| `A2:A` | Markdown pages |
| `B2:B` | Optional slugs (the short name used at the end of each page URL) |

The collection page shows the name from `A1` and a simple list of page links.
