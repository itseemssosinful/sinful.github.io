# Simple Blog

An unstyled blog with accounts, an owner-only "post an update" form, profile pages
and email subscriptions. Data is saved on the server in `data.json`.

## Run it

You need Node.js 18 or newer.

    npm install
    npm start

Then open http://localhost:3000

The **first account that signs up becomes the owner**, so sign up first.

## Sending real emails

Without SMTP settings, emails are printed in the terminal instead of sent.
To send real ones, set these before `npm start` (Gmail, Outlook, Brevo, Mailgun and
similar all provide SMTP details):

    SMTP_HOST=smtp.example.com
    SMTP_PORT=587
    SMTP_USER=you@example.com
    SMTP_PASS=your-password-or-app-password
    MAIL_FROM="My Blog <you@example.com>"
    SITE_URL=https://your-site.example.com

(`SMTP_SECURE=true` if your provider uses port 465.)

## Putting it online

Run it on any Node host (Render, Railway, Fly.io, a VPS). Keep `data.json` on a
persistent disk so accounts and posts survive restarts, set `SITE_URL` to your
https address, and put it behind HTTPS.

## Notes

- Email addresses are not verified when saved.
- If the owner deletes their account, the next person to sign up becomes the owner.
- Back up `data.json` to back up the whole site.

## Using it inside your website (the "test" button)

The blog answers at both `/` and `/blog/`, and all of its pages use relative links, so
it works from a `/blog/` folder. To have your site's **test** button (`blog/index.html`)
open it:

1. Run the blog (`npm start`) on a host that can run Node.js.
2. Make `https://your-site/blog/` go to that running blog (a reverse proxy rule for
   `/blog/` to the blog's port, or your host's equivalent). The blog's own pages are in
   `public/`, so there is nothing to upload to your static site for it.

A plain static host cannot run the blog on its own, because accounts, posts and emails
need the server.
