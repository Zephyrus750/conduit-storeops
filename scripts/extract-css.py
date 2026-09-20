#!/usr/bin/env python3
"""Build styles/tokens.css and styles/shell.css from the showcase stylesheet.

The showcase (docs/showcase/conduit-shell-swap.html in vector-suite) is the
design of record. This keeps only the rules the shell and its views use:
a rule survives when one of its class names appears in index.html, js/**,
or the map SVG, or when it has no class at all (element rules). Showcase
page chrome (.stage, .rp-*, the swap sheet) is dropped. At-rule nesting
(@container, @media, @keyframes) is preserved.

    python3 scripts/extract-css.py /path/to/conduit-shell-swap.html
"""
import re, sys, os, glob

src = sys.argv[1]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html = open(src, encoding='utf-8').read()
css = re.search(r'<style>(.*?)</style>', html, re.S).group(1)

# ── classes the app uses ────────────────────────────────────────────────
used = set()
files = [os.path.join(root, 'index.html')] + glob.glob(os.path.join(root, 'js', '**', '*.js'), recursive=True) + glob.glob(os.path.join(root, 'maps', '*.svg'))
for f in files:
    t = open(f, encoding='utf-8').read()
    # Scan class="…" attributes, then blank the innermost ${…} expressions
    # and scan again, a few levels deep. The raw pass catches names quoted
    # inside expressions (`${on ? 'on' : ''}`); each blanked pass exposes
    # the static part next to an expression holding quotes
    # (class="ad-tile${cls ? ' ' + cls : ''}" → ad-tile), including inside
    # nested template literals.
    text = t
    for _ in range(5):
        for m in re.finditer(r'class=\\?["\']([^"\']*)["\']', text):
            for c in re.split(r'\s+|\$\{[^}]*\}', m.group(1)):
                c = c.strip()
                if re.fullmatch(r'[A-Za-z_][\w-]*', c): used.add(c)
        text = re.sub(r'\$\{[^{}]*\}', ' ', text)
    for m in re.finditer(r"classList\.(?:add|toggle|remove)\(([^)]*)\)", t):
        for c in re.findall(r"'([\w-]+)'", m.group(1)): used.add(c)
    for m in re.finditer(r"class(?:Name)?\s*=\s*['\"]([^'\"]*)['\"]", t):
        for c in m.group(1).split(): used.add(c)
# state / variant classes set from code paths the regexes cannot see
used |= {'on', 'off', 'sel', 'done', 'hot', 'live', 'open', 'hi', 'full', 'warn', 'info', 'good', 'sec', 'ok', 'bad', 'cur', 'completed', 'error', 'zoomed', 'mono', 'rfplan', 'showem', 'railmin', 'dark', 'fit', 'mv', 'loading', 'frame', 'app', 'browser',
         'rail-light', 'rail-tint', 'rail-solid', 'rail-deep', 'bars-plain', 'bars-tint', 'bars-strong', 'hdr-classic', 'hdr-title', 'ws-floor', 'ws-stockroom', 'ws-backdock',
         'sr3', 'srail', 'smid', 'slc', 'sel', 'wait', 'subm', 'left', 'right', 'scode', 'scols', 'scol', 'inc', 'bad', 'ok', 'lost', 'todo', 'moved', 'hot', 'old', 'mid', 'add', 'del', 'match', 'lock', 'amber', 'green', 'typed', 'zero', 'low', 'req', 'a', 'd', 'cs', 'cs-tabs', 'cs-target', 'cs-last', 'cs-p', 'ask', 'swp-row', 'swp-zone', 'hist-row', 'adj-row', 'mv-scan', 'mv-field', 'mv-steps', 'mv-last', 'mv-stepper', 'mv-done', 'mv-cnt', 'mv-sub', 'mv-note', 'ring', 'ringpick', 'reqgrid', 'reqcard', 'reqlist', 'reqrow', 'dlist', 'drow', 'dhead', 'lochist', 'matches', 'finall', 'sortb', 'addrow', 'cres', 'cfind', 'clist', 'cact', 'cage-age', 'swrow', 'mtip', 'mx', 'shid', 'rtip', 'omni', 'pal', 'in', 'body', 'cols', 'prev', 'wide', 'okind', 'ogrp', 'orow', 'oi', 'ot', 'oa', 'ohint', 'ofoot', 'esc', 'pcardx', 'pfacts', 'pmap', 'pt2', 'kc', 'nm', 'fx', 'soh', 'g', 'p', 's', 'l', 'm', 'prod', 'shelf', 'loc', 'name', 'none', 'placeholder', 'adm', 'radm', 'radm-top', 'radm-find', 'hdot', 'ad', 'own', 'ro', 'ad-tile', 'ad-tiles', 'ad-tools', 'ad-in', 'ad-done', 'ad-kv', 'ad-steps', 'ad-sum', 'ad-ent', 'ad-entc', 'ad-inrow', 'ad-grid2', 'ad-field', 'ad-form', 'ad-form-main', 'ad-form-side', 'ad-tabs', 'ad-filters', 'ad-ev', 'ad-dev', 'ad-dot', 'ad-areas', 'ad-two', 'ad-tbl', 'ad-row', 'ad-banner', 'ad-tgl', 'tick', 'mono', 'go', 'rt', 'pd-name', 'codes', 'foot-adm', 'si-owner', 'si-own', 'route-path', 'route-n', 'pin', 'c-green', 'c-red', 'due', 'soon', 'overdue', 'phase', 'er', 'v', 'c', 'dep', 'chip', 'sw', 'sw2', 'pt', 'big', 'of', 'lbl', 'go', 'ib', 'md', 'mc', 'mn', 'sc', 'tk', 'micro', 'micros', 'subrow', 'sh', 'ct', 'code', 'nm', 'rt', 'loc', 'stopn', 'tick', 'li', 'list', 'kh', 'hero', 'n', 'd', 'hl', 'rows', 'row', 'l', 'r', 'where', 'hs', 'prog', 'track', 'kpi', 'dash', 'kpis', 'side2', 'greet', 'vh', 'vt', 'vic', 'sub', 'acts', 'acts2', 'i', 'mic', 'kbd', 'btn', 'primary', 'accent', 'sm', 'ibtn', 'seg', 'seg2', 'seg3', 'pills', 'tabs', 'status', 'card', 'ch', 'pcard', 'pt3', 'cs-dim', 'grid2', 'mapbox', 'mapstage', 'mapleg', 'crumbx', 'sidecol', 'fill', 'mapview', 'selshelf', 'sid', 'meta', 'mapbar', 'search', 'legchips', 'zoom', 'keywrap', 'keypop', 'keygrp', 'keygrid', 'keyrow'}
EXCLUDE = re.compile(r'\.stage\b|\.stagewrap|\.page\b|\.rp\b|\.rp-|\.sheet-sec|\.swap\b|\.si-var|\.intro\b|\.footnote|\.cap\b|\.capline|#stage|#accents|#heads|\.accents\b|\.acc\b|\.acc-|\.heads\b|\.eyebrow|\.lead\b|\.showcase|\.pills\.top|\.sizes|\.seg\.sizes')
CLASS_RE = re.compile(r'\.(-?[_a-zA-Z][\w-]*)')

def keep(selector):
    if EXCLUDE.search(selector): return False
    if selector.strip().startswith(('html', 'body')): return False
    classes = CLASS_RE.findall(selector)
    if not classes: return True
    return any(c in used for c in classes)

# ── walk the stylesheet keeping at-rule nesting ────────────────────────
out_tokens, out_shell = [], []
pos = 0; stack = []; tok = re.compile(r'[{}]')
def emit(rule):
    r = rule
    for a in reversed(stack): r = a + '{' + r + '}'
    out_shell.append(r)
while True:
    m = tok.search(css, pos)
    if not m: break
    seg = css[pos:m.start()]
    if m.group(0) == '{':
        prelude = seg.strip()
        prelude = prelude.split('*/')[-1].strip() if '*/' in prelude else prelude
        if prelude.startswith('@'):
            if prelude.startswith(('@keyframes', '@font-face')):
                # copy the whole block verbatim
                depth = 1; k = m.end()
                while depth:
                    if css[k] == '{': depth += 1
                    elif css[k] == '}': depth -= 1
                    k += 1
                out_shell.append(prelude + css[m.end()-1:k]); pos = k; continue
            stack.append(prelude); pos = m.end(); continue
        e = css.find('}', m.end()); dec = css[m.end():e].strip(); pos = e + 1
        if prelude == ':root' and not stack: out_tokens.append(':root{' + dec + '}'); continue
        sels = [s.strip() for s in prelude.split(',')]
        kept = [s for s in sels if keep(s)]
        if kept and dec: emit(','.join(kept) + '{' + dec + '}')
    else:
        if stack: stack.pop()
        pos = m.end()

tokens = '/* Design tokens: generated from the showcase by scripts/extract-css.py. */\n' + '\n'.join(out_tokens) + '\n'
shell = '/* Shell and view rules: generated from the showcase by scripts/extract-css.py. Do not hand-edit; change the showcase or js/ and regenerate. */\n' + '\n'.join(out_shell) + '\n'
open(os.path.join(root, 'styles', 'tokens.css'), 'w', encoding='utf-8').write(tokens)
open(os.path.join(root, 'styles', 'shell.css'), 'w', encoding='utf-8').write(shell)
print('classes used', len(used), 'tokens', len(tokens), 'shell', len(shell), 'of', len(css))
