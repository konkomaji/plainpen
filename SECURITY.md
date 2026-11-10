# Security and privacy

No website can promise to be safe from every attack. This document states what Plainpen does, what it relies on, and what it cannot do, so that you can judge it.

## The main decision

Plainpen has no backend that receives your text. Checking happens in a web worker in your browser. That removes whole classes of risk: server breaches, database leaks, injection into a server, and training on user text.

## Defences in the page

| Threat | Defence |
|---|---|
| Cross site scripting | No `innerHTML`, `eval`, `new Function` or `document.write` anywhere. All user text is rendered with `textContent` and DOM nodes. Enforced by `tests/security.mjs`. |
| Injected script | Content Security Policy: `default-src 'none'`, `script-src 'self'`, no inline scripts or styles, no `unsafe-inline` or `unsafe-eval`. |
| DOM based XSS | `require-trusted-types-for 'script'`. Scripts and workers are only created through a policy that accepts same origin URLs. |
| Data exfiltration | `connect-src 'self'`. Even a bug could not send your text to another site. |
| Clickjacking | `frame-ancestors 'none'` and `X-Frame-Options: DENY`. |
| Mixed content, downgrade | `Strict-Transport-Security`. |
| Supply chain | Zero runtime dependencies. No third party scripts, fonts or CDNs. Fonts are self hosted (SIL OFL). |
| Referrer and permission leaks | `Referrer-Policy: no-referrer`, a locked down `Permissions-Policy`. |
| Malicious import files | Every imported profile, lexicon or backup is validated against a schema, size limited, and copied into fresh objects. Keys such as `__proto__` are rejected. |
| Storage theft | Settings and drafts are encrypted with AES-GCM 256. The key is created with WebCrypto as non extractable, so page code cannot read it. A new random IV is used for every write. |
| Weak backups | Backups use PBKDF2 (SHA-256, 600,000 rounds, random salt) and AES-GCM 256. Iteration counts in imported files are bounded to stop denial of service. |
| Denial of service by text | Long text is checked in slices with cancellation, per paragraph error isolation, issue caps, a cache bounded by characters, and a watchdog that restarts a stuck worker. |
| Share target | Text shared from other apps is handled inside the service worker and never sent over the network. It uses POST so it does not appear in logs. |

## What this does not cover

- **Your device.** A browser extension, malware or someone with access to your unlocked browser can read what you type. Encryption at rest does not help there.
- **The host.** If the site is deployed on a host that is hacked, the served files could be replaced. Use a host you trust, enable two factor sign in, and consider Subresource Integrity or a hash pinned deployment for high risk uses.
- **Lost passphrases.** Backups cannot be recovered without the passphrase.
- **Old browsers.** Trusted Types and module workers need a modern browser. Browsers that lack Trusted Types still get the rest of the policy.

## Google Search Console and Analytics

These are optional and off in the repository.

- Search Console is a verification meta tag. It adds no runtime code.
- Google Analytics 4 is enabled only by `node tools/configure.mjs --ga G-XXXX` for your deployment. It loads after the visitor opts in, with advertising features off and anonymised IPs. The page sends no custom events, so your text can never be included. The cost: the content security policy must allow the Google hosts, which weakens the "cannot send anywhere" guarantee for that deployment. The test suite then allows exactly those hosts and nothing else.
- Under GDPR and similar laws, analytics needs consent. Plainpen asks first, but you are responsible for your own privacy notice.

## Reporting a problem

Open an issue on the project repository. For a vulnerability, please describe it privately first.

## Verify it yourself

```
npm test
```

The security section fails the build if a dangerous code pattern, an external URL, a missing header, a weak storage setting or an em dash appears.
