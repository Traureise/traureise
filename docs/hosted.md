# Hosted or your own

## These docs are for whoever runs an instance

Couples don't need documentation: everything they do (create a wedding, design the cards, keep the guest
list, publish the website) is explained in the app itself, in German. These pages are for **operators**,
the person or team who runs Traureise on a server. The pages under [What couples get](weddings.md)
describe the app's features from that side, so you know what you are offering and what your privacy
policy has to cover.

## traureise.de

**[traureise.de](https://traureise.de)** is the instance run by the author of Traureise, with the
[packages](legal-and-billing.md#billing) switched on. Until it opens, the address leads to this project on
GitHub. It runs the current release of the same software these pages describe.

- **Who runs it and the binding texts:** the [Impressum](https://docs.traureise.de/impressum/),
  the [Datenschutzerklärung](https://docs.traureise.de/datenschutz/) and the
  [AGB](https://docs.traureise.de/agb/), linked in the footer of every page here and in the app. These docs
  describe the software and do not repeat them.
- **How it is run:** [Traureise/stacks](https://github.com/Traureise/stacks) holds its compose file and its
  legal texts, as a worked example for a public instance of your own.

## Hosted or your own

| | traureise.de | Your own instance |
|---|---|---|
| Set-up | None | [Docker Compose](getting-started.md), a few minutes |
| Prices | The website is free; [packages](legal-and-billing.md#billing) per wedding for guest links, cards and email sending | Everything is available; billing stays off unless you [switch it on](legal-and-billing.md#billing) |
| Where the data is | On the service's server in Germany | On your server, in your PostgreSQL and your file storage |
| Email | Sent by the service | Your [SMTP provider](email.md) |
| Legal pages | The service's | [Yours](legal-and-billing.md), if the instance is public; none for a private one on your network |

A couple can [download all their data](legal-and-billing.md#account-rights) from either one under **Konto**.
