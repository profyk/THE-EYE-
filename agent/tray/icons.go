// Package tray provides the system tray integration with a blinking eye icon.
package tray

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"
)

const iconSize = 32

var (
	colBG     = color.NRGBA{0x0D, 0x11, 0x17, 0xFF} // void #0D1117
	colCyan   = color.NRGBA{0x00, 0xD4, 0xFF, 0xFF} // accent #00D4FF
	colIrisFill = color.NRGBA{0x00, 0xD4, 0xFF, 0x3D} // 24% opacity
)

// EyeOpenICO returns an ICO-wrapped 32×32 eye-open icon.
func EyeOpenICO() []byte { return makeICO(drawEyeOpen()) }

// EyeClosedICO returns an ICO-wrapped 32×32 blink (eyelid closed) icon.
func EyeClosedICO() []byte { return makeICO(drawEyeClosed()) }

// ── Drawing ───────────────────────────────────────────────────────────────────

func drawEyeOpen() image.Image {
	img := image.NewNRGBA(image.Rect(0, 0, iconSize, iconSize))
	draw.Draw(img, img.Bounds(), &image.Uniform{colBG}, image.Point{}, draw.Src)

	cx, cy := float64(iconSize)/2, float64(iconSize)/2
	rx := float64(iconSize) * 0.42 // outer ellipse
	ry := float64(iconSize) * 0.26
	irisR := float64(iconSize) * 0.155
	pupilR := float64(iconSize) * 0.075
	stroke := 1.6

	// Iris fill (dim cyan circle)
	fillCircle(img, cx, cy, irisR, colIrisFill)

	// Outer ellipse stroke
	drawEllipseRing(img, cx, cy, rx, ry, stroke, colCyan)

	// Iris ring stroke
	drawCircleRing(img, cx, cy, irisR, stroke, colCyan)

	// Pupil (solid filled circle)
	fillCircle(img, cx, cy, pupilR, colCyan)

	// Specular highlight — tiny white dot at top-right of pupil
	highlight := color.NRGBA{0xFF, 0xFF, 0xFF, 0xCC}
	fillCircle(img, cx+pupilR*0.45, cy-pupilR*0.45, pupilR*0.3, highlight)

	return img
}

func drawEyeClosed() image.Image {
	img := image.NewNRGBA(image.Rect(0, 0, iconSize, iconSize))
	draw.Draw(img, img.Bounds(), &image.Uniform{colBG}, image.Point{}, draw.Src)

	cx, cy := float64(iconSize)/2, float64(iconSize)/2
	rx := float64(iconSize) * 0.42

	// Draw a single horizontal arc (the closed eyelid) spanning the eye width.
	// We represent it as a 2-pixel-thick horizontal line bounded by the ellipse.
	cyI := int(math.Round(cy))
	for x := int(math.Round(cx - rx)); x <= int(math.Round(cx+rx)); x++ {
		// Fade at the tips for a natural look
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

// ── Shape primitives ──────────────────────────────────────────────────────────

func fillCircle(img *image.NRGBA, cx, cy, r float64, c color.NRGBA) {
	x0 := int(math.Floor(cx - r - 1))
	x1 := int(math.Ceil(cx + r + 1))
	y0 := int(math.Floor(cy - r - 1))
	y1 := int(math.Ceil(cy + r + 1))
	r2 := r * r
	for y := y0; y <= y1; y++ {
		for x := x0; x <= x1; x++ {
			dx := float64(x) - cx
			dy := float64(y) - cy
			if dx*dx+dy*dy <= r2 {
				current := img.NRGBAAt(x, y)
				img.SetNRGBA(x, y, blendNRGBA(current, c))
			}
		}
	}
}

func drawCircleRing(img *image.NRGBA, cx, cy, r, sw float64, c color.NRGBA) {
	rOuter := r + sw/2
	rInner := r - sw/2
	x0 := int(math.Floor(cx - rOuter - 1))
	x1 := int(math.Ceil(cx + rOuter + 1))
	y0 := int(math.Floor(cy - rOuter - 1))
	y1 := int(math.Ceil(cy + rOuter + 1))
	ro2 := rOuter * rOuter
	ri2 := rInner * rInner
	for y := y0; y <= y1; y++ {
		for x := x0; x <= x1; x++ {
			dx := float64(x) - cx
			dy := float64(y) - cy
			d2 := dx*dx + dy*dy
			if d2 <= ro2 && d2 >= ri2 {
				current := img.NRGBAAt(x, y)
				img.SetNRGBA(x, y, blendNRGBA(current, c))
			}
		}
	}
}

func drawEllipseRing(img *image.NRGBA, cx, cy, rx, ry, sw float64, c color.NRGBA) {
	rxO := rx + sw/2
	ryO := ry + sw/2
	rxI := rx - sw/2
	ryI := ry - sw/2
	x0 := int(math.Floor(cx - rxO - 1))
	x1 := int(math.Ceil(cx + rxO + 1))
	y0 := int(math.Floor(cy - ryO - 1))
	y1 := int(math.Ceil(cy + ryO + 1))
	for y := y0; y <= y1; y++ {
		for x := x0; x <= x1; x++ {
			dx := float64(x) - cx
			dy := float64(y) - cy
			outer := (dx/rxO)*(dx/rxO) + (dy/ryO)*(dy/ryO)
			inner := (dx/rxI)*(dx/rxI) + (dy/ryI)*(dy/ryI)
			if outer <= 1.0 && inner >= 1.0 {
				current := img.NRGBAAt(x, y)
				img.SetNRGBA(x, y, blendNRGBA(current, c))
			}
		}
	}
}

// blendNRGBA composites src over dst using standard alpha blending.
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
	return color.NRGBA{
		R: blend(src.R, dst.R),
		G: blend(src.G, dst.G),
		B: blend(src.B, dst.B),
		A: uint8(outA * 255),
	}
}

// ── ICO wrapping ──────────────────────────────────────────────────────────────

// makeICO encodes an image as PNG then wraps it in a minimal ICO container.
// Windows Vista+ loads PNG-embedded ICO files correctly.
func makeICO(img image.Image) []byte {
	var pngBuf bytes.Buffer
	_ = png.Encode(&pngBuf, img)
	pngData := pngBuf.Bytes()

	size := uint32(len(pngData))
	const headerOffset = 6 + 16 // ICONDIR + 1 ICONDIRENTRY

	buf := &bytes.Buffer{}
	// ICONDIR
	_ = binary.Write(buf, binary.LittleEndian, uint16(0)) // reserved
	_ = binary.Write(buf, binary.LittleEndian, uint16(1)) // type = icon
	_ = binary.Write(buf, binary.LittleEndian, uint16(1)) // count = 1
	// ICONDIRENTRY
	buf.WriteByte(byte(iconSize)) // width
	buf.WriteByte(byte(iconSize)) // height
	buf.WriteByte(0)              // color count (0 = use bit count)
	buf.WriteByte(0)              // reserved
	_ = binary.Write(buf, binary.LittleEndian, uint16(1))  // planes
	_ = binary.Write(buf, binary.LittleEndian, uint16(32)) // bit count (32bpp RGBA)
	_ = binary.Write(buf, binary.LittleEndian, size)
	_ = binary.Write(buf, binary.LittleEndian, uint32(headerOffset))
	buf.Write(pngData)
	return buf.Bytes()
}
