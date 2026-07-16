# Natthawin Tamprasert — Portfolio

Personal portfolio website. Editorial design (warm cream canvas · coral accent · dark navy surfaces)
inspired by the Anthropic / Claude design system. Light + dark themes, fully responsive (mobile · tablet · desktop).

**Live:** https://natthawin0614.github.io

## Structure

```
├── index.html            # single-page site (all content)
├── assets/
│   ├── css/style.css     # design tokens + both themes + responsive
│   └── js/main.js        # theme toggle · mobile menu · scroll reveal · lightbox
├── image/                # photos, certificates, architecture diagram
└── .nojekyll             # tell GitHub Pages to serve files as-is
```

## Features

- 🎨 **Light / Dark mode** — toggle in the nav; remembers your choice; falls back to system preference.
- 📱 **Responsive** — 900px (tablet) and 600px (mobile) breakpoints; hamburger menu on mobile.
- 🖼️ **Certificate lightbox** — click any award/photo to view full size; arrow-key + swipe navigation.
- ✨ **Scroll reveal** animations (respects `prefers-reduced-motion`).
- Fonts via Google Fonts: Fraunces (display serif), Inter (body), JetBrains Mono (code).

## Deploy to GitHub Pages

1. Create/point the repo `natthawin0614/natthawin0614.github.io`.
2. Push all files (keep the folder structure — `index.html` must be at the repo root).
3. Repo → **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main` / root.
4. Wait ~1 min → site is live at `https://natthawin0614.github.io`.

```bash
git init
git add .
git commit -m "Portfolio site"
git branch -M main
git remote add origin https://github.com/natthawin0614/natthawin0614.github.io.git
git push -u origin main
```

## Editing

- **Text / links** → edit `index.html` (sections are clearly commented: HERO, ABOUT, EXPERIENCE, HACKATHONS, PROJECTS, STACK, CERTIFICATES, EDUCATION, CONTACT).
- **Colors / spacing / fonts** → edit the `:root` (light) and `:root[data-theme="dark"]` token blocks at the top of `assets/css/style.css`.
- **Add a certificate** → drop the image in `image/` and copy a `.gcard` block in the gallery section of `index.html`.
