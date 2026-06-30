// Package tray provides the system tray integration with the app icon.
package tray

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	_ "image/png"
	"math"

	_ "embed"
)

//go:embed app-icon.png
var appIconPNG []byte

const iconSize = 32

// Scaled-down versions of the app icon, initialised once at startup.
var (
	icoOpen   []byte
	icoClosed []byte
)

func init() {
	src, _, err := image.Decode(bytes.NewReader(appIconPNG))
	if err != nil {
		// Fall back to the programmatic eye if the embedded PNG can't be decoded.
		icoOpen = makeICO(drawEyeOpen())
		icoClosed = makeICO(drawEyeClosed())
		return
	}
	full := boxScale(src, iconSize, iconSize)
	dim := dimImage(full, 0.35)
	icoOpen = makeICO(full)
	icoClosed = makeICO(dim)
}

// EyeOpenICO returns the full-colour app icon at tray size.
func EyeOpenICO() []byte { return icoOpen }

// EyeClosedICO returns a dimmed version of the app icon for the blink frame.
func EyeClosedICO() []byte { return icoClosed }

// ── Image processing ──────────────────────────────────────────────────────────

// boxScale downscales src to w×h using a box (area-average) filter.
func boxScale(src image.Image, w, h int) *image.NRGBA {
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	sb := src.Bounds()
	sw := float64(sb.Dx())
	sh := float64(sb.Dy())

	for dy := 0; dy < h; dy++ {
		for dx := 0; dx < w; dx++ {
			x0 := int(float64(dx) * sw / float64(w))
			x1 := int(float64(dx+1) * sw / float64(w))
			y0 := int(float64(dy) * sh / float64(h))
			y1 := int(float64(dy+1) * sh / float64(h))
			if x1 <= x0 {
				x1 = x0 + 1
			}
			if y1 <= y0 {
				y1 = y0 + 1
			}

			var rS, gS, bS, aS, n float64
			for y := y0; y < y1; y++ {
				for x := x0; x < x1; x++ {
					r, g, b, a := src.At(x+sb.Min.X, y+sb.Min.Y).RGBA()
					rS += float64(r >> 8)
					gS += float64(g >> 8)
					bS += float64(b >> 8)
					aS += float64(a >> 8)
					n++
				}
			}
			dst.SetNRGBA(dx, dy, color.NRGBA{
				R: uint8(rS / n),
				G: uint8(gS / n),
				B: uint8(bS / n),
				A: uint8(aS / n),
			})
		}
	}
	return dst
}

// dimImage returns a copy of img with all pixels multiplied by factor (0–1).
func dimImage(src *image.NRGBA, factor float64) *image.NRGBA {
	b := src.Bounds()
	dst := image.NewNRGBA(b)
	draw.Draw(dst, b, src, b.Min, draw.Src)
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			c := dst.NRGBAAt(x, y)
			c.R = uint8(float64(c.R) * factor)
			c.G = uint8(float64(c.G) * factor)
			c.B = uint8(float64(c.B) * factor)
			dst.SetNRGBA(x, y, c)
		}
	}
	return dst
}

// ── Fallback programmatic icons (used only if PNG decode fails) ───────────────

var (
	colBG       = color.NRGBA{0x0D, 0x11, 0x17, 0xFF}
	colCyan     = color.NRGBA{0x00, 0xD4, 0xFF, 0xFF}
	colIrisFill = color.NRGBA{0x00, 0xD4, 0xFF, 0x3D}
)

func drawEyeOpen() image.Image {
	img := image.NewNRGBA(image.Rect(0, 0, iconSize, iconSize))
	draw.Draw(img, img.Bounds(), &image.Uniform{colBG}, image.Point{}, draw.Src)

	cx, cy := float64(iconSize)/2, float64(iconSize)/2
	rx := float64(iconSize) * 0.42
	ry := float64(iconSize) * 0.26
	irisR := float64(iconSize) * 0.155
	pupilR := float64(iconSize) * 0.075
	stroke := 1.6

	fillCircle(img, cx, cy, irisR, colIrisFill)
	drawEllipseRing(img, cx, cy, rx, ry, stroke, colCyan)
	drawCircleRing(img, cx, cy, irisR, stroke, colCyan)
	fillCircle(img, cx, cy, pupilR, colCyan)
	fillCircle(img, cx+pupilR*0.45, cy-pupilR*0.45, pupilR*0.3, color.NRGBA{0xFF, 0xFF, 0xFF, 0xCC})
	return img
}

func drawEyeClosed() image.Image {
	img := image.NewNRGBA(image.Rect(0, 0, iconSize, iconSize))
	draw.Draw(img, img.Bounds(), &image.Uniform{colBG}, image.Point{}, draw.Src)

	cx, cy := float64(iconSize)/2, float64(iconSize)/2
	rx := float64(iconSize) * 0.42
	cyI := int(math.Round(cy))
	for x := int(math.Round(cx - rx)); x <= int(math.Round(cx+rx)); x++ {
		dx := float64(x) - cx
		alpha := uint8(255)
		edgeFrac := math.Abs(dx) / rx
		if edgeFrac > 0.85 {
			alpha = uint8(255 * (1 - (edgeFrac-0.85)/0.15))
		}
		c := color.NRGBA{0x00, 0xD4, 0xFF, alpha}
		img.SetNRGBA(x, cyI-1, blendNRGBA(img.NRGBAAt(x, cyI-1), color.NRGBA{0x00, 0xD4, 0xFF, alpha / 2}))
		img.SetNRGBA(x, cyI, c)
		img.SetNRGBA(x, cyI+1, blendNRGBA(img.NRGBAAt(x, cyI+1), color.NRGBA{0x00, 0xD4, 0xFF, alpha / 2}))
	}
	return img
}

// ── Shape primitives (fallback only) ─────────────────────────────────────────

func fillCircle(img *image.NRGBA, cx, cy, r float64, c color.NRGBA) {
	x0, x1 := int(math.Floor(cx-r-1)), int(math.Ceil(cx+r+1))
	y0, y1 := int(math.Floor(cy-r-1)), int(math.Ceil(cy+r+1))
	r2 := r * r
	for y := y0; y <= y1; y++ {
		for x := x0; x <= x1; x++ {
			dx, dy := float64(x)-cx, float64(y)-cy
			if dx*dx+dy*dy <= r2 {
				img.SetNRGBA(x, y, blendNRGBA(img.NRGBAAt(x, y), c))
			}
		}
	}
}

func drawCircleRing(img *image.NRGBA, cx, cy, r, sw float64, c color.NRGBA) {
	ro, ri := r+sw/2, r-sw/2
	x0, x1 := int(math.Floor(cx-ro-1)), int(math.Ceil(cx+ro+1))
	y0, y1 := int(math.Floor(cy-ro-1)), int(math.Ceil(cy+ro+1))
	ro2, ri2 := ro*ro, ri*ri
	for y := y0; y <= y1; y++ {
		for x := x0; x <= x1; x++ {
			dx, dy := float64(x)-cx, float64(y)-cy
			d2 := dx*dx + dy*dy
			if d2 <= ro2 && d2 >= ri2 {
				img.SetNRGBA(x, y, blendNRGBA(img.NRGBAAt(x, y), c))
			}
		}
	}
}

func drawEllipseRing(img *image.NRGBA, cx, cy, rx, ry, sw float64, c color.NRGBA) {
	rxO, ryO := rx+sw/2, ry+sw/2
	rxI, ryI := rx-sw/2, ry-sw/2
	x0, x1 := int(math.Floor(cx-rxO-1)), int(math.Ceil(cx+rxO+1))
	y0, y1 := int(math.Floor(cy-ryO-1)), int(math.Ceil(cy+ryO+1))
	for y := y0; y <= y1; y++ {
		for x := x0; x <= x1; x++ {
			dx, dy := float64(x)-cx, float64(y)-cy
			outer := (dx/rxO)*(dx/rxO) + (dy/ryO)*(dy/ryO)
			inner := (dx/rxI)*(dx/rxI) + (dy/ryI)*(dy/ryI)
			if outer <= 1.0 && inner >= 1.0 {
				img.SetNRGBA(x, y, blendNRGBA(img.NRGBAAt(x, y), c))
			}
		}
	}
}

func blendNRGBA(dst, src color.NRGBA) color.NRGBA {
	if src.A == 0 {
		return dst
	}
	if src.A == 255 {
		return src
	}
	sa := float64(src.A) / 255
	da := float64(dst.A) / 255
	outA := sa + da*(1-sa)
	if outA == 0 {
		return color.NRGBA{}
	}
	blend := func(s, d uint8) uint8 {
		return uint8((float64(s)*sa + float64(d)*da*(1-sa)) / outA)
	}
	return color.NRGBA{R: blend(src.R, dst.R), G: blend(src.G, dst.G), B: blend(src.B, dst.B), A: uint8(outA * 255)}
}

// ── ICO wrapping ──────────────────────────────────────────────────────────────

func makeICO(img image.Image) []byte {
	var pngBuf bytes.Buffer
	_ = png.Encode(&pngBuf, img)
	pngData := pngBuf.Bytes()
	size := uint32(len(pngData))
	const headerOffset = 6 + 16

	buf := &bytes.Buffer{}
	_ = binary.Write(buf, binary.LittleEndian, uint16(0))
	_ = binary.Write(buf, binary.LittleEndian, uint16(1))
	_ = binary.Write(buf, binary.LittleEndian, uint16(1))
	buf.WriteByte(byte(iconSize))
	buf.WriteByte(byte(iconSize))
	buf.WriteByte(0)
	buf.WriteByte(0)
	_ = binary.Write(buf, binary.LittleEndian, uint16(1))
	_ = binary.Write(buf, binary.LittleEndian, uint16(32))
	_ = binary.Write(buf, binary.LittleEndian, size)
	_ = binary.Write(buf, binary.LittleEndian, uint32(headerOffset))
	buf.Write(pngData)
	return buf.Bytes()
}
