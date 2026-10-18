# Themes

A theme decides how a wedding website looks: colour palettes, the default font pairing, and optional
ornaments. Themes are plain data packages. **To add a theme, add a folder. No code changes.**

```
themes/
  salbei/
    theme.json      manifest (required)
    preview.svg     picture shown in the theme picker (required)
    frame.svg       hero frame (optional)
    divider.svg     section divider (optional)
```

Traureise loads every `themes/<id>/theme.json` when it starts. Each manifest is validated. A theme with an
invalid manifest or a missing asset file is skipped, and a warning is logged:

```
[themes] skipping "mein-theme": {"palettes.0.colors.text":"invalid_color"}
```

The app needs at least one valid theme. If it has a theme called `salbei`, that is the default for new
websites; otherwise the default is the first theme in alphabetical order.

After adding or changing a theme, restart the app: `docker compose up -d --build`, because themes are
copied into the image. You can also mount your own `themes/` directory as a volume and set `THEMES_DIR`.

## Manifest

```json
{
  "$schema": "../theme.schema.json",
  "id": "salbei",
  "name": { "de": "Salbei", "en": "Sage" },
  "category": { "de": "Botanisch", "en": "Botanical" },
  "palettes": [
    {
      "id": "salbei",
      "name": { "de": "Salbei", "en": "Sage" },
      "colors": {
        "background": "#f5f6f0",
        "surface": "#ffffff",
        "text": "#26302a",
        "muted": "#5f6d63",
        "primary": "#56735f",
        "accent": "#b8935a"
      }
    }
  ],
  "fonts": { "defaultPairing": "klassisch" },
  "assets": { "preview": "preview.svg", "heroFrame": "frame.svg", "divider": "divider.svg" }
}
```

| Field | Type | Rules |
|---|---|---|
| `id` | string | Lowercase letters, digits and single dashes. **Must equal the folder name.** It is stored for each website, so don't rename it once websites use the theme. |
| `name` | localized text | Display name. An object with locale keys; `de` is required. |
| `category` | localized text | Category shown in the theme picker; `de` is required. |
| `palettes` | array, at least 1 | The first palette is the theme's default. Users pick one on the Design page. |
| `palettes[].id` | string | `[a-z0-9-]`, unique within the theme. |
| `palettes[].name` | localized text | `de` is required. |
| `palettes[].colors` | object | All six tokens are required, each as `#rrggbb`. See below. |
| `fonts.defaultPairing` | string | One of the font pairing ids listed below. |
| `assets.preview` | file name | Required. |
| `assets.heroFrame` | file name | Optional. A mask for the cover photo. |
| `assets.divider` | file name | Optional. An ornament between sections. |
| `assets.background` | file name | Optional. A tiled background pattern. |

Asset file names must match `^[a-z0-9][a-z0-9-]*\.(svg|png|jpg|webp)$` and live directly in the theme
folder. Only files listed in `assets` are served (under `/theme-assets/<id>/<file>`).

The authoritative schema is `themeManifestSchema` in `src/domain/theme.ts`. `themes/theme.schema.json` is a
JSON Schema copy for editor autocompletion.

### Colour tokens

| Token | Used for |
|---|---|
| `background` | Page background |
| `surface` | Cards (events, hotels, registry entries) |
| `text` | Body text and headings |
| `muted` | Secondary text such as addresses and dates |
| `primary` | Links and buttons |
| `accent` | Ornaments, small labels and the hashtag |

Check contrast: `text` and `muted` on `background`, and `primary` on `surface`, should reach WCAG AA (4.5:1).

### Font pairings

Pairings are defined in `src/domain/fonts.ts`. All fonts are bundled with the app (SIL Open Font License).

| id | Headings | Body text |
|---|---|---|
| `klassisch` | Cormorant Garamond | Source Sans 3 |
| `romantisch` | Great Vibes | Lora |
| `modern` | Josefin Sans | Work Sans |
| `elegant` | Playfair Display | Nunito Sans |
| `verspielt` | Parisienne | Raleway |
| `markant` | DM Serif Display | DM Sans |
| `buchsatz` | Lora | Source Sans 3 |
| `schlicht` | Raleway | Lora |

A new pairing is a code change: add it to `FONT_PAIRINGS` and import its `@fontsource` files in
`src/app/site-fonts.css`.

## Ornaments are masks

`heroFrame` and `divider` are drawn as **CSS masks**:

- The divider is filled with the palette's `accent` colour.
- The cover photo is clipped to the shape of the hero frame.

So draw them as single-colour shapes on a transparent background; the colour in the file does not matter.
That way one SVG works with every palette.

- **Hero frame:** draw the shape in a `viewBox="0 0 400 500"` (portrait, 4:5) with
  `preserveAspectRatio="none"`, filled where the photo should show.
- **Divider:** about `viewBox="0 0 240 40"`. It is displayed 200 × 28 px.
- **Background:** tiles across the page behind everything; keep it subtle.

Without a hero frame, the cover photo gets rounded corners. Without a divider, a thin line in the
accent colour is shown.

## Rules for contributed themes

- Only original artwork, or artwork under a license that allows commercial use and redistribution.
- No assets loaded from other servers; everything lives in the theme folder.
- Keep SVGs simple (no scripts, no external references); they are served with a restrictive
  Content Security Policy.
