# Srijon — Infrastructure for the AI Creator Economy

A static marketing site + demo dashboard for **Srijon**, a platform for running content challenges at scale (brief → payout, automated).

## Pages

| Page | Description |
|------|-------------|
| `index.html` | Landing page — hero, how it works, features, stats, pricing, CTA |
| `dashboard.html` | Admin dashboard — KPIs, charts, challenges table |
| `challenge.html` | Challenge detail — brief, rules, submissions, rewards |
| `creator.html` | Creator profile — stats, platforms, recent work |

## Tech

Pure **HTML / CSS / JavaScript** — no build step, no dependencies. Just open `index.html` in a browser.

## Structure

```
.
├── index.html
├── dashboard.html
├── challenge.html
├── creator.html
├── css/
│   ├── styles.css       # design system + landing page
│   └── dashboard.css    # dashboard + detail pages
└── js/
    ├── main.js          # landing interactions
    └── dashboard.js     # charts + sidebar
```

## Deploy

Static site — deploy anywhere. On **Hostinger**: upload all files to `public_html/` via the File Manager or FTP. `index.html` will be served as the homepage automatically.
