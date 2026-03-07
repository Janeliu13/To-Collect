# Figma → site ratio

All dimensions and (x, y) positions from Figma are scaled to the site using this ratio.

**Figma frame:** W **7866** × H **5263**

**Conversion:**
- **Width or X:** `calc(100vw * <figma_value> / 7866)`
- **Height or Y:** `calc(100vh * <figma_value> / 5263)`

**Examples:**
- Figma width 1307 → `calc(100vw * 1307 / 7866)`
- Figma x 161 → `calc(100vw * 161 / 7866)`
- Figma height 3906 → `calc(100vh * 3906 / 5263)`
- Figma y 1234 → `calc(100vh * 1234 / 5263)`

Use this ratio for every dimension and x,y position when implementing from Figma.
