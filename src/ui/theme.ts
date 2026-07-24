/**
 * Semantic iOS colors adapt automatically to system light/dark appearance.
 * Accent colors are reserved for actions and live status, never large surfaces.
 */
export const theme = {
  canvas: "systemBackground",
  canvasRaised: "secondarySystemBackground",
  librarySurface: "tertiarySystemBackground",
  selectedSurface: "quaternarySystemFill",
  ink: "label",
  paper: "label",
  paperMuted: "secondaryLabel",
  charcoal: "tertiarySystemBackground",
  charcoalMuted: "tertiaryLabel",
  line: "separator",
  live: "systemRed",
  library: "systemIndigo",
  capture: "systemTeal",
  opticalBlack: "black",
} as const
