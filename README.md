# SVG Workbench

Client-only SVG inspection, normalization, and export workbench built with React and Vite.

## Local development

```powershell
npm install
npm run dev
```

`npm install` also enables the local Git hooks via Husky.

## Production build

```powershell
npm run build
```

Commits run the build in a `pre-commit` hook and are blocked if the build fails.


## GitHub Pages

This repository includes a GitHub Actions workflow that builds the site on pushes to `main` and deploys the `dist` output to GitHub Pages.