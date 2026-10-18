# Languages

Traureise is German-first. Every text in the interface lives in a message catalogue
(`messages/de.json`, via [next-intl](https://next-intl.dev)); lint fails on hardcoded text in
components.

## Adding a language

1. Copy `messages/de.json` to `messages/<locale>.json` (for example `en.json`) and translate every value.
2. Add the locale to `locales` in `src/i18n/config.ts`.

The interface language then follows the `traureise_locale` cookie if it is set, otherwise the browser's
`Accept-Language` header, otherwise German. Wedding websites are shown in the visitor's language the
same way. Login emails always use German for now.

Theme names and palette names are translated inside each theme's `theme.json` (see [Themes](themes.md)).
