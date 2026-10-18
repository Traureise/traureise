# Reverse proxy and HTTPS

Run Traureise behind a reverse proxy that terminates TLS, such as Caddy, Traefik or nginx, and set
`APP_URL` to the public HTTPS address.

```dotenv
APP_URL=https://hochzeit.example.de
```

With an `https://` `APP_URL`, the session cookie is marked `Secure`. Browsers drop `Secure` cookies on
plain `http://` (except on `localhost`), which is why Traureise only sets the flag when `APP_URL` is
HTTPS.

## Client addresses and rate limits

Login requests are rate-limited per client address. Traureise uses the **last** entry of the
`X-Forwarded-For` header, which is the one the nearest proxy appends. That means:

- The proxy must append the client address to `X-Forwarded-For` (Caddy, Traefik and nginx with
  `proxy_add_x_forwarded_for` do this).
- Do not publish port 3000 directly to the internet. Without a proxy, clients could send their own
  header and choose their rate-limit bucket.

## Example: Caddy

```caddyfile
hochzeit.example.de {
	reverse_proxy localhost:3000
}
```

Caddy obtains the certificate itself and sets `X-Forwarded-For`.
