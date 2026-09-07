# Kevin Ushey’s website

A static personal website, served directly by GitHub Pages. The homepage uses
semantic HTML and responsive CSS with system fonts; it needs no JavaScript or
external UI libraries. The older bundled libraries remain available for existing
URLs, but the homepage no longer loads them.

## Preview and build

Run `python3 -m http.server 4173 --bind 127.0.0.1` from this directory and open
<http://127.0.0.1:4173/>.

GitHub Pages can continue serving the repository as before. For the separate
private Sites preview, `python3 scripts/build.py` stages the static public files
in `dist/`. The build does not change the source files. `.openai/hosting.json`
identifies that preview and its static output directory.

## Content and image sources

Public details verified on September 7, 2026:

- [Posit profile](https://opensource.posit.co/people/kevin-ushey/): Principal
  Software Engineer title and RStudio work.
- [renv](https://rstudio.github.io/renv/): author and maintainer credit.
- [reticulate authors](https://rstudio.github.io/reticulate/authors.html): co-author
  credit.
- [Bluesky](https://bsky.app/profile/kevinushey.bsky.social): current social handle.
- [LinkedIn](https://www.linkedin.com/in/kevin-ushey-33a35542): profile URL.
- [UBC thesis record](https://open.library.ubc.ca/handle/2429/37068): replacement
  for the old broken PDF link.

The research and education background is retained from the original homepage.

`img/kevin-ushey.jpg` is the personal photo Kevin supplied on September 7, 2026,
resized to 1350 × 1800 and JPEG-compressed for the web, without retouching or
generative edits. It replaces the earlier Posit headshot. CSS applies a circular
head-and-shoulders crop while keeping the original photograph intact. The crop
keeps his full head and some autumn background visible at every screen size;
adjust `.portrait img` in `css/styles.css` to change the framing.
