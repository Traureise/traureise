import { Marked } from "marked";

const SAFE_LINK = /^(https?:|mailto:|tel:|\/|#)/i;
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The files are the operator's own, but they are still rendered as text only: raw HTML is shown escaped, and only
// web, mail and phone links survive.
const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html({ text }) {
      return escape(text);
    },
    link({ href, tokens }) {
      const label = this.parser.parseInline(tokens);
      return SAFE_LINK.test(href) ? `<a href="${escape(href)}">${label}</a>` : label;
    },
    image({ text }) {
      return escape(text);
    },
  },
});

export function renderLegalMarkdown(markdown: string): string {
  return marked.parse(markdown, { async: false });
}
