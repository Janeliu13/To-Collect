# Back button spec (reusable)

Use this exact button on other pages when the user asks for “this button” or “the back button”.

## Shape & asset
- **Image:** `/assets/back-button-shape.png` — left-pointing rounded triangle (cyan).
- **Direction:** Point faces **left** (rotation `0deg`).

## Dimensions (Figma scale 7866×5263)
| Property   | Value   | CSS (scale to viewport) |
|-----------|---------|--------------------------|
| Width     | 363.44  | `calc(100vw * 363.44 / 7866)` |
| Height    | 395.52  | `calc(100vh * 395.52 / 5263)` |
| X         | 50.66   | `left: calc(100vw * 50.66 / 7866)` |
| Y         | 2800.82 | `top: calc(100vh * 2800.82 / 5263)` |

## Style
- **Color:** `#3EC9E0` (cyan) — used in the shape image.
- **Rotation:** `0deg` (pointing left).
- **Corner radius:** 40 (baked into the asset).
- **Background:** transparent (shape is the image).

## Behavior
- **Default target:** Main gallery — link to `/main/gallery`.
- **Label:** “Back to main” (or adjust per page).
- **Aria:** `aria-label="Back to main page"` (or equivalent).

## Markup pattern
```jsx
<Link to="/main/gallery" className="back-btn-spec" aria-label="Back to main page">
  <img src="/assets/back-button-shape.png" alt="" className="back-btn-spec-shape" />
  <span className="back-btn-spec-text">Back to main</span>
</Link>
```

## CSS classes to reuse
- Copy the rules for: `.my-profile-back-btn`, `.my-profile-back-btn-shape`, `.my-profile-back-btn-text` from `app/src/App.css` (or create shared classes e.g. `.back-btn-spec`, `.back-btn-spec-shape`, `.back-btn-spec-text` and use the same values).
- **Position:** Change `left`/`top` per page if the button should sit elsewhere; keep width, height, rotation, and image the same.

---
*Defined from My Profile page back button; asset: `app/public/assets/back-button-shape.png`.*
