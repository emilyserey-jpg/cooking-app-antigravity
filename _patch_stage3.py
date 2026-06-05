#!/usr/bin/env python3
"""Simplify Stage 3 to a plain success screen — folder assignment happens in the modal popup before saving."""
import sys

with open('app.js', 'r', encoding='utf-8') as f:
    src = f.read()

OLD_FN_START = '// \u2500\u2500 Stage 3: success screen + folder picker'
si = src.find(OLD_FN_START)
if si == -1:
    print('ERROR: start not found'); sys.exit(1)

END_MARKER = '\nwindow.resetCreateView'
ei = src.find(END_MARKER, si)
if ei == -1:
    print('ERROR: end marker not found'); sys.exit(1)

NEW_STAGE3 = (
    '// \u2500\u2500 Stage 3: simple success screen (folder chosen in modal before save) \u2500\u2500\u2500\u2500\n'
    'let _lastSavedRecipeId    = null;\n'
    'let _lastSavedRecipeTitle = \'\';\n'
    '\n'
    'function showStage3WithFolderPicker(recipe, isPublic) {\n'
    '  _lastSavedRecipeId    = recipe ? recipe.id : null;\n'
    '  _lastSavedRecipeTitle = recipe ? recipe.title : \'Recipe\';\n'
    '\n'
    '  const stage3 = document.getElementById(\'createStage3\');\n'
    '  if (!stage3) return;\n'
    '  stage3.style.display = \'block\';\n'
    '\n'
    '  const visibility = isPublic\n'
    '    ? \'<span style="color:#22c55e;font-weight:700;">\U0001f30e Public</span> \u2014 visible on Discover and your profile\'\n'
    '    : \'<span style="color:#4a90d9;font-weight:700;">\U0001f512 Private</span> \u2014 only you can see this\';\n'
    '\n'
    '  stage3.innerHTML =\n'
    '    \'<div style="font-size:4rem;margin-bottom:0.75rem;">\U0001f389</div>\'\n'
    '    + \'<h2 style="font-size:1.6rem;font-weight:900;color:var(--text-heading);margin-bottom:0.5rem;">Recipe Saved!</h2>\'\n'
    '    + \'<p style="color:var(--text-muted);font-weight:600;margin-bottom:2rem;font-size:0.9rem;">\' + visibility + \'</p>\'\n'
    '    + \'<div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;">\'\n'
    '    + \'<button onclick="switchView(\\\'library\\\')" class="btn btn-primary" style="border-radius:999px;padding:12px 28px;">\U0001f4da View in Library</button>\'\n'
    '    + \'<button onclick="resetCreateView()" class="btn" style="border-radius:999px;padding:12px 28px;">+ Upload Another</button>\'\n'
    '    + \'</div>\';\n'
    '}\n'
    '\n'
    '// Stubs for any lingering references\n'
    'window.addNewlySavedToFolder  = function() {};\n'
    'window.createAndAddToNewFolder = function() {};\n'
    '\n'
)

src = src[:si] + NEW_STAGE3 + src[ei:]

opens  = src.count('{')
closes = src.count('}')
print('{ count:', opens, '} count:', closes, 'diff:', opens - closes)
print('showStage3WithFolderPicker count:', src.count('showStage3WithFolderPicker'))
print('SYNTAX OK' if opens == closes else 'BRACE MISMATCH')

with open('app.js', 'w', encoding='utf-8', errors='surrogatepass') as f:
    f.write(src)
print('DONE')
