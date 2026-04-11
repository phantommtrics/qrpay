import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const logoPath = join(__dirname, '../public/app_logo.png')

/** Match typical app-icon squircle; tune if corners clip content or leave halos. */
const CORNER_RADIUS_RATIO = 0.223

/** Bottom corners after bottom-band crop (often slightly flat); match main radius or tune. */
const BOTTOM_CORNER_RADIUS_RATIO = CORNER_RADIUS_RATIO

/** Trim bottom halo / “white” airbrush: rows whose opaque pixels average brighter than this (main fill is ~35–55). */
const BOTTOM_ROW_OPAQUE_AVG_LUM_MAX = 82

/**
 * Top/right 1px anti-alias halos read ~180–210 lum; real edge ~45–55. Strip only when clearly halo, max a few px.
 */
const EDGE_FRINGE_OPAQUE_LUM_MIN = 115
const MAX_EDGE_FRINGE_TRIM_PX = 2

/** Pixels treated as outside the icon: white margins + soft grey drop shadow on white. */
function isBackground(r, g, b, a) {
  if (a < 16) return true
  if (r >= 250 && g >= 250 && b >= 250) return true
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max - min < 14 && max >= 212 && min >= 200) return true
  return false
}

function opaqueRowAvgLum(data, width, ch, y) {
  let sum = 0
  let n = 0
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * ch
    const a = data[i + 3]
    if (a < 16) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    sum += (r + g + b) / 3
    n++
  }
  return n === 0 ? 0 : sum / n
}

function opaqueColAvgLum(data, width, height, ch, x) {
  let sum = 0
  let n = 0
  for (let y = 0; y < height; y++) {
    const i = (y * width + x) * ch
    const a = data[i + 3]
    if (a < 16) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    sum += (r + g + b) / 3
    n++
  }
  return n === 0 ? 0 : sum / n
}

function countTopLightFringeRows(data, width, height, ch) {
  let n = 0
  while (n < MAX_EDGE_FRINGE_TRIM_PX && n < height) {
    const avg = opaqueRowAvgLum(data, width, ch, n)
    if (avg > EDGE_FRINGE_OPAQUE_LUM_MIN) {
      n++
      continue
    }
    break
  }
  return n
}

function countRightLightFringeCols(data, width, height, ch) {
  let n = 0
  while (n < MAX_EDGE_FRINGE_TRIM_PX && n < width) {
    const x = width - 1 - n
    const avg = opaqueColAvgLum(data, width, height, ch, x)
    if (avg > EDGE_FRINGE_OPAQUE_LUM_MIN) {
      n++
      continue
    }
    break
  }
  return n
}

/** Drop contiguous rows from the bottom while they look like light margin / shadow, not main icon fill. */
function cropBottomLightBand(data, width, height, channels) {
  let y = height - 1
  while (y >= 0) {
    const avg = opaqueRowAvgLum(data, width, channels, y)
    if (avg === 0 || avg > BOTTOM_ROW_OPAQUE_AVG_LUM_MAX) {
      y--
      continue
    }
    break
  }
  return y + 1
}

/** Rounded-rect mask: opaque inside the squircle, transparent in corner wedges (dest-in). */
function roundedRectMaskSvg(width, height, radius) {
  const r = Math.min(radius, Math.floor(Math.min(width, height) / 2))
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${r}" ry="${r}" fill="#ffffff"/>
    </svg>`,
  )
}

/**
 * Orthogonal top edge, rounded bottom-left and bottom-right only (restores curve after flat bottom crop).
 */
function bottomCornersRoundedMaskSvg(width, height, radius) {
  const r = Math.min(radius, Math.floor(Math.min(width, height) / 2))
  const W = width
  const H = height
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <path fill="#ffffff" d="
        M 0 0
        L ${W} 0
        L ${W} ${H - r}
        A ${r} ${r} 0 0 1 ${W - r} ${H}
        L ${r} ${H}
        A ${r} ${r} 0 0 1 0 ${H - r}
        L 0 0
        Z
      "/>
    </svg>`,
  )
}

const input = await readFile(logoPath)
const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const w = info.width
const h = info.height
const ch = info.channels

let minX = w
let minY = h
let maxX = -1
let maxY = -1

for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = ch > 3 ? data[i + 3] : 255
    if (isBackground(r, g, b, a)) continue
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
}

if (maxX < minX) {
  console.error('No non-background pixels found; aborting.')
  process.exit(1)
}

let out = await sharp(input)
  .extract({
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  })
  .ensureAlpha()
  .png()
  .toBuffer()

const tw = maxX - minX + 1
const th = maxY - minY + 1
const cornerR = Math.round(Math.min(tw, th) * CORNER_RADIUS_RATIO)

out = await sharp(out)
  .composite([
    {
      input: roundedRectMaskSvg(tw, th, cornerR),
      blend: 'dest-in',
    },
  ])
  .png()
  .toBuffer()

out = await sharp(out).trim().png().toBuffer()

let meta = await sharp(out).metadata()
let { width: cw, height: ch2 } = meta
const rawBottom = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const newH = cropBottomLightBand(rawBottom.data, cw, ch2, rawBottom.info.channels)
const hBeforeBottomCrop = ch2
if (newH < ch2) {
  out = await sharp(out)
    .extract({ left: 0, top: 0, width: cw, height: newH })
    .png()
    .toBuffer()
}

meta = await sharp(out).metadata()
cw = meta.width
ch2 = meta.height
const bottomR = Math.round(Math.min(cw, ch2) * BOTTOM_CORNER_RADIUS_RATIO)
out = await sharp(out)
  .composite([
    {
      input: bottomCornersRoundedMaskSvg(cw, ch2, bottomR),
      blend: 'dest-in',
    },
  ])
  .png()
  .toBuffer()

out = await sharp(out).trim().png().toBuffer()

const rawEdge = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const ew = rawEdge.info.width
const eh = rawEdge.info.height
const ech = rawEdge.info.channels
const fringeTop = countTopLightFringeRows(rawEdge.data, ew, eh, ech)
const fringeRight = countRightLightFringeCols(rawEdge.data, ew, eh, ech)
if (fringeTop > 0 || fringeRight > 0) {
  out = await sharp(out)
    .extract({
      left: 0,
      top: fringeTop,
      width: ew - fringeRight,
      height: eh - fringeTop,
    })
    .png()
    .toBuffer()
}

await writeFile(logoPath, out)

const final = await sharp(out).metadata()
console.log(
  `Trimmed + rounded public/app_logo.png (${w}×${h} → ${tw}×${th}, r≈${cornerR}px → ${final.width}×${final.height})`,
)
if (newH < hBeforeBottomCrop) {
  console.log(`  Cropped bottom light band: height ${hBeforeBottomCrop} → ${newH}`)
}
console.log(`  Bottom corner radius (re-mask): r≈${bottomR}px`)
if (fringeTop > 0 || fringeRight > 0) {
  console.log(`  Top/right halo trim: −${fringeTop}px top, −${fringeRight}px right`)
}
