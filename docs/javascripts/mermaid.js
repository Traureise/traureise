// Material for MkDocs renders Mermaid itself, but reuses a `mermaid` that is already on the
// page (loaded just before this file in mkdocs.yml, and self-hosted by the privacy plugin).
// Wrap its initialize call to fill gaps in Material's Mermaid theme for sequence diagrams.
const extraCSS = `
  .actor-line { stroke: var(--md-mermaid-sequence-actor-line-color) !important; }
  rect.rect { stroke: none !important; }
  [id$="sequencenumber"] { fill: var(--md-mermaid-sequence-number-bg-color) !important; }
  .sequenceNumber { font-weight: 700; }
  .node rect { rx: 6px; ry: 6px; }
`;

const initialize = mermaid.initialize.bind(mermaid);
mermaid.initialize = (config) =>
  initialize({
    ...config,
    themeCSS: (config.themeCSS || "") + extraCSS,
    sequence: {
      ...config.sequence,
      actorFontSize: "14px",
      messageFontSize: "14px",
      noteFontSize: "14px",
      width: 110,
      actorMargin: 30,
      boxMargin: 8,
      noteMargin: 8,
      messageMargin: 30,
      mirrorActors: false,
    },
  });
