# Branding and theme

## Logo assets

Supplied by Prostarm, August 2026. Four files in `assets/`, each used where it
actually reads well rather than one file stretched everywhere.

| File | Where it is used |
|---|---|
| `prostarm-logo.png` | Full colour wordmark — login screen, both panels |
| `prostarm-mark.png` | Colour power-button icon — sidebar |
| `prostarm-logo-black.png` | Black wordmark — printed and PDF headers |
| `prostarm-mark-black.png` | Black icon — spare, for mono contexts |
| `favicon.png` | Browser tab, generated from the colour icon |

The colour icon is now the supplied `Prostarm_Logo.png` rather than a crop
taken out of the wordmark, so the edges are clean at any size.

**The printed header uses the black wordmark.** A colour logo on a mono office
printer prints as muddy grey; the black version is what the artwork was drawn
for.

**The sidebar icon sits on a white plate.** The wordmark is dark blue on
transparent and disappears against the navy rail. Rather than recolour the
logo — which would flatten the two-tone blue and lose the red power symbol —
it keeps its own background. If Prostarm has an official reversed version,
drop it in and the plate can go.

---

## Theme

Taken from the Petty Cash dashboard, so the two applications read as one
family rather than two separate tools.

| Token | Value | Was |
|---|---|---|
| Page background | `#DFEAF2` | `#F2F5F9` neutral grey |
| Navy | `#0B3F7A` | `#0A2540` |
| Blue | `#1E5FA8` | `#1668B0` |
| Light blue | `#2F80D2` | `#1B84D6` |
| **Teal accent** | `#00B3A4` | *new* |
| Ink | `#123047` | `#12212F` |
| Muted | `#5D7C93` | `#7A8898` |
| Line | `#C9DAE6` | `#DCE3EC` |
| Tile | `#F2F8FB` | `#F7F9FC` |
| Corner radius | 8px | 12px on cards |
| Shadow | blue-tinted, two-layer | neutral grey |

### What changed visually

- **Cards carry their accent on the top edge**, 3px, as in the reference —
  previously a left bar.
- **Table headings** are navy on pale blue `#EAF3F9`, smaller and tighter.
- **The top bar** is a soft vertical gradient rather than flat white.
- **The sidebar** is a navy gradient, and the active item's inner rule is teal.
- **Charts and category colours** move to the new palette: UPS blue, SMF teal,
  Lithium light blue, Isolation Transformer amber, Servo purple, Other grey.

### Dark mode

Recalibrated to the same hues — a deep blue-black page rather than neutral
charcoal, teal preserved as the positive accent. Printing from dark mode still
forces the light palette, so a PDF never comes out navy.

---

## Changing it again

Everything lives in the `:root` block at the top of `css/style.css`. The rest
of the stylesheet only references tokens, so a re-theme means editing that one
block. Category colours are separate, in `data/master-categories.js` under
`colours`, because they belong to the data rather than the theme.
