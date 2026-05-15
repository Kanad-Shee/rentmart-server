# server

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.11. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## SMTP Mail Settings

The auth flow now sends OTP emails through Nodemailer.

Required environment variables:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Optional variables:

- `SMTP_SECURE`
- `SMTP_FROM_NAME`
- `SMTP_REPLY_TO`
- `APP_NAME`
