#!/usr/bin/env python3
"""Bundle the STANFLEX multi-page site into ONE self-contained HTML file.

Why: the claude.ai artifact preview hosts a single file under a strict CSP
(no external requests at all). This script therefore:

  1. extracts each page's <main> content and wraps it as a client-side route
     (#/company, #/lab?cfg=universal, ...) — nav links keep working;
  2. inlines the stylesheet (fonts + photo become data: URIs);
  3. inlines GSAP, the data/config/UI scripts, and wires Three.js +
     OrbitControls as blob-URL ES modules;
  4. marks <body data-spa="1"> so js/main.js switches to its SPA behaviour.

Output: dist/stanflex-onepage.html  (path can be overridden as argv[1])
The multi-page site in the repo root stays the real deployment target.
"""
import base64, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "dist", "stanflex-onepage.html")

PAGES = ["index", "company", "engineering", "lab", "configurations",
         "range", "special", "quality", "installation", "quote", "admin"]
NO_CTA_ROUTES = ["quote", "admin"]

def read(p, binary=False):
    with open(os.path.join(ROOT, p), "rb" if binary else "r",
              **({} if binary else {"encoding": "utf-8"})) as f:
        return f.read()

def b64(p):
    return base64.b64encode(read(p, True)).decode("ascii")

# ---------------------------------------------------------------- pages
routes, titles = {}, {}
for name in PAGES:
    html = read(f"{name}.html")
    titles[name] = re.search(r"<title>(.*?)</title>", html, re.S).group(1)
    routes[name] = re.search(r'<main id="page-main">\n(.*?)\n</main>', html, re.S).group(1)

index_html = read("index.html")
header_html = re.search(r"<header class=\"site-header\".*?</header>", index_html, re.S).group(0)
# active-state class is managed by the router in the bundle
header_html = header_html.replace(' class="is-active"', "")
footer_html = re.search(r"<footer class=\"site-footer\".*?</footer>", index_html, re.S).group(0)
svg_defs = re.search(r"<!-- Shared SVG defs.*?</svg>", index_html, re.S).group(0)
cta_html = re.search(r"<!-- shared enquiry call-to-action -->.*?</section>", index_html, re.S).group(0)

# ---------------------------------------------------------------- assets
css = read("css/style.css")
for weight in ["500", "600", "700", "800"]:
    css = css.replace(f"url('../assets/fonts/poppins-{weight}.woff2') format('woff2')",
                      f"url('data:font/woff2;base64,{b64(f'assets/fonts/poppins-{weight}.woff2')}') format('woff2')")
css = css.replace("url('../assets/fonts/inter-400.woff2') format('woff2')",
                  f"url('data:font/woff2;base64,{b64('assets/fonts/inter-400.woff2')}') format('woff2')")

img_uri = "data:image/jpeg;base64," + b64("assets/img/bellows-duotone.jpg")
routes_html = "\n".join(
    f'<div class="route" data-route="{n}">\n'
    + routes[n].replace('src="assets/img/bellows-duotone.jpg"', f'src="{img_uri}"')
    + "\n</div>"
    for n in PAGES)

three_scene = read("js/three-scene.js").replace(
    "import { OrbitControls } from '../vendor/OrbitControls.js';",
    "import { OrbitControls } from 'orbit-controls';")

favicon = re.search(r'<link rel="icon"[^>]*>', index_html).group(0)

# ---------------------------------------------------------------- router
router_js = """
/* SPA router for the single-file bundle: '#/page?query' shows one route,
   rewrites internal .html links, keeps nav state + document.title. */
(function () {
  'use strict';
  var TITLES = __TITLES__;
  var NO_CTA = __NO_CTA__;
  var current = null;

  function parse() {
    var m = /^#\\/([a-z]+)(?:\\?(.*))?$/.exec(location.hash);
    var route = m && TITLES[m[1]] ? m[1] : 'index';
    return { route: route, query: new URLSearchParams(m && m[2] || '') };
  }

  function show(r) {
    if (r.route === current) return;
    current = r.route;
    document.querySelectorAll('.route').forEach(function (el) {
      el.classList.toggle('is-current', el.dataset.route === r.route);
    });
    document.querySelectorAll('.site-nav a, .footer-nav a').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      a.classList.toggle('is-active', href === r.route + '.html');
    });
    var cta = document.querySelector('.page-cta');
    if (cta) cta.style.display = NO_CTA.indexOf(r.route) > -1 ? 'none' : '';
    document.title = TITLES[r.route];
    scrollTo(0, 0);
    // move keyboard focus to the new "page" so tab order restarts sensibly
    var main = document.getElementById('page-main');
    if (main) main.focus({ preventScroll: true });
    dispatchEvent(new CustomEvent('stanflex-route', { detail: r }));
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var m = /^([a-z]+)\\.html(?:\\?(.*))?$/.exec(a.getAttribute('href'));
    if (!m || !TITLES[m[1]]) return;
    e.preventDefault();
    var next = '#/' + m[1] + (m[2] ? '?' + m[2] : '');
    if (location.hash === next) show(parse()); // same link twice still scrolls up
    else location.hash = next;
  });

  addEventListener('hashchange', function () { show(parse()); });
  show(parse());
})();
"""
router_js = (router_js
             .replace("__TITLES__", json.dumps(titles))
             .replace("__NO_CTA__", json.dumps(NO_CTA_ROUTES)))

# ---------------------------------------------------------------- assemble
out = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{titles['index']}</title>
  <meta name="description" content="STANFLEX multi-ply metallic bellows expansion joints — interactive 3D catalogue site.">
  <meta name="theme-color" content="#17100a">
  {favicon}
  <style>
{css}
  </style>
</head>
<body data-spa="1" data-page="bundle">

{header_html}

<main id="page-main" tabindex="-1">
{routes_html}
</main>

{cta_html}

{footer_html}

{svg_defs}

<script>
{read("vendor/gsap.min.js")}
</script>
<script>
{read("vendor/ScrollTrigger.min.js")}
</script>
<script>
{read("js/data.js")}
</script>
<script>
{read("js/config.js")}
</script>
<script>
{read("js/enquiries.js")}
</script>
<script>
{read("js/main.js")}
</script>
<script>
{router_js}
</script>

<!-- Three.js + OrbitControls as blob-URL ES modules: the strict artifact
     CSP allows no external requests, so the whole 3D stack ships inline. -->
<script>
(function () {{
  function blobUrl(b64, type) {{
    var bytes = atob(b64);
    var arr = new Uint8Array(bytes.length);
    for (var i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return URL.createObjectURL(new Blob([arr], {{ type: type }}));
  }}
  var threeUrl = blobUrl("{b64('vendor/three.module.min.js')}", "text/javascript");
  var orbitUrl = blobUrl("{b64('vendor/OrbitControls.js')}", "text/javascript");

  var map = document.createElement('script');
  map.type = 'importmap';
  map.textContent = JSON.stringify({{ imports: {{ "three": threeUrl, "orbit-controls": orbitUrl }} }});
  document.head.appendChild(map);

  var sceneUrl = URL.createObjectURL(new Blob([{json.dumps(three_scene)}], {{ type: 'text/javascript' }}));
  var mod = document.createElement('script');
  mod.type = 'module';
  mod.src = sceneUrl;
  document.body.appendChild(mod);
}})();
</script>

</body>
</html>
"""

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(out)
print(f"wrote {OUT} ({len(out):,} bytes)")
