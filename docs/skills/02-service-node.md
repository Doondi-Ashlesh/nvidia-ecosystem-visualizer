# Skill 02 — ServiceHex Component

**File:** `components/ServiceHex.tsx`

> Replaces: `components/ServiceNode.tsx` (React Flow node, removed)

---

## What it does

A hexagonal card representing a single NVIDIA service. Uses CSS `clip-path` to create the hex shape with a double-layer border technique. Responds to 4 visual states based on app mode and workflow activity.

---

## How it works

### Hex shape
```css
clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)
```
Two stacked clipped divs produce the border effect:
- **Outer div** (172×96 px): clipped to hexagon, colored with the border color
- **Inner div** (172-8 × 96-4 px, inset 2px top/bottom, 4px sides): clipped to hexagon, colored with the content background

The outer div's color is the visible "stroke" around the hexagon.

### Visual states

| State | Opacity | Filter | Border color | Background |
|---|---|---|---|---|
| Default | 1 | drop-shadow (faint white) | `#1e293b` | `#0d1117` |
| Hovered (explore) | 1 | `drop-shadow(layerColor dim)` | `layerColor 60%` | `layerColor 10%` |
| Highlighted (workflow path) | 1 | `drop-shadow(layerColor glow)` | `layerColor cc` | `layerColor 18%` |
| Dimmed (not in workflow) | 0.18 | `grayscale(1)` | inherited | inherited |
| Active step | 1 | `drop-shadow(layerColor full)` + pulse | `layerColor` | `layerColor 18%` |

All state transitions use Framer Motion `animate` → `transition: { duration: 0.3 }`.

### Active step pulse
When `isActiveStep=true`, a Framer Motion loop animates opacity `0.4 → 0.8 → 0.4` on a radial gradient overlay behind the hex content.

### Step number badge
When `stepNumber` is provided (workflow mode), a small circle badge appears in the top-right corner showing the step index. It fills with NVIDIA green `#76b900` on the active step.

### Interactions
- `onHover(service | null)` — called on mouse enter/leave; used in explore mode to feed detail into sidebar
- `onClick(service)` — in explore mode opens `service.officialUrl`; in workflow mode jumps to that step

---

## Layer colors used

```typescript
LAYER_COLORS.agent = { hex: '#76b900', dim: '#76b90020', glow: '#76b90050' }
```
The Agentic AI layer uses NVIDIA's brand green — intentionally the most visually prominent layer.

---

## How to verify

1. **Load app in explore mode** → all service hexagons fully visible with correct layer colors on border
2. **Hover a hexagon** → drop-shadow glow appears; sidebar shows that service's details
3. **Select "Build an Agentic AI system" workflow** → 6 hexagons highlight (numbered 1–6); 12 hexagons dim to 18% opacity with grayscale
4. **Active step hexagon** → pulses with NVIDIA green glow; step badge glows
5. **Non-workflow hexagon in workflow mode** → grayed out, unclickable to jump (but still hoverable)
