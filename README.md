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
- [Rcpp package metadata](https://github.com/RcppCore/Rcpp/blob/master/DESCRIPTION)
  and [Kevin’s commit history](https://github.com/RcppCore/Rcpp/commits?author=kevinushey):
  authorship and contributions; Kevin confirmed his Rcpp Core team membership.
- [rmarkdown authors](https://pkgs.rstudio.com/rmarkdown/authors.html) and
  [Kevin’s commit history](https://github.com/rstudio/rmarkdown/commits?author=kevinushey):
  co-author credit and contributions to rendering and website resources.
- [RcppParallel package metadata](https://github.com/RcppCore/RcppParallel/blob/master/DESCRIPTION)
  and [Kevin’s commit history](https://github.com/RcppCore/RcppParallel/commits?author=kevinushey):
  author and maintainer credit, including recent release work.
- [RcppRoll’s removal of its Rcpp dependency](https://github.com/kevinushey/RcppRoll/commit/5e0ed9d949465706062a09eb432be169c51ee9d9):
  the description reflects the current implementation while keeping the
  Rcpp-named packages together.
- [Bluesky](https://bsky.app/profile/kevinushey.bsky.social): current social handle.
- [LinkedIn](https://www.linkedin.com/in/kevin-ushey-33a35542): profile URL.
- [Thesis DOI](https://dx.doi.org/10.14288/1.0072188): Kevin’s preferred
  permanent link to the thesis.

The research and education background is retained from the original homepage.

`img/kevin-ushey.jpg` is the personal photo Kevin supplied on September 7, 2026,
resized to 1350 × 1800 and JPEG-compressed for the web, without retouching or
generative edits. It replaces the earlier Posit headshot. CSS applies a circular
head-and-shoulders crop while keeping the original photograph intact. The crop
keeps his full head and some autumn background visible at every screen size;
adjust `.portrait img` in `css/styles.css` to change the framing.
