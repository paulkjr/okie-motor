import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func load(_ p: String) -> (Int, Int, [UInt8]) {
  let s = CGImageSourceCreateWithURL(URL(fileURLWithPath: p) as CFURL, nil)!; let i = CGImageSourceCreateImageAtIndex(s, 0, nil)!
  let w = i.width, h = i.height; var px = [UInt8](repeating: 0, count: w * h * 4)
  let c = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  c.draw(i, in: CGRect(x: 0, y: 0, width: w, height: h)); return (w, h, px)
}
let (W, H, mock) = load(CommandLine.arguments[1])
let (BW, BH, bg) = load(CommandLine.arguments[2])
let outPath = CommandLine.arguments[3]

// the card in the mock-up (found by looking at the picture): its rectangle and corner radius
let cx0 = 122.0, cy0 = 40.0, cx1 = 1788.0, cy1 = 782.0, R = 92.0

func mockAt(_ x: Int, _ y: Int) -> (Double, Double, Double) { let i = (y * W + x) * 4; return (Double(mock[i]), Double(mock[i + 1]), Double(mock[i + 2])) }
func bgAt(_ fx: Double, _ fy: Double) -> (Double, Double, Double) {
  let x = min(Double(BW - 2), max(0, fx)), y = min(Double(BH - 2), max(0, fy)); let x0 = Int(x), y0 = Int(y), tx = x - Double(x0), ty = y - Double(y0)
  func g(_ xx: Int, _ yy: Int) -> (Double, Double, Double) { let i = (yy * BW + xx) * 4; return (Double(bg[i]), Double(bg[i + 1]), Double(bg[i + 2])) }
  let a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1)
  func m(_ p: Double, _ q: Double, _ r: Double, _ s: Double) -> Double { (p * (1 - tx) + q * tx) * (1 - ty) + (r * (1 - tx) + s * tx) * ty }
  return (m(a.0, b.0, c.0, d.0), m(a.1, b.1, c.1, d.1), m(a.2, b.2, c.2, d.2))
}

// the text of the mock-up is taken out: its pixels (bright on the dark ground, a little wider than the letters) are filled in from what is around them, smoothly (the ground there is a soft blur)
let tx0 = 735, ty0 = 300, tx1 = 1480, ty1 = 525
var buf = [(Double, Double, Double)](repeating: (0, 0, 0), count: W * H)
for y in 0..<H { for x in 0..<W { buf[y * W + x] = mockAt(x, y) } }
var mask = [Bool](repeating: false, count: W * H)
for y in ty0..<ty1 { for x in tx0..<tx1 { let m = buf[y * W + x]; if (m.0 + m.1 + m.2) / 3 > 105 { mask[y * W + x] = true } } }
var wide = mask
let rad = 9
for y in ty0..<ty1 { for x in tx0..<tx1 where mask[y * W + x] { for dy in -rad...rad { for dx in -rad...rad where dx * dx + dy * dy <= rad * rad { wide[(y + dy) * W + x + dx] = true } } } }
// start: a straight blend between the nearest unmasked pixel to the left and to the right in the row
for y in ty0..<ty1 { var x = tx0; while x < tx1 { if wide[y * W + x] { var e = x; while e < tx1 && wide[y * W + e] { e += 1 }
  let l = buf[y * W + max(0, x - 1)], r = buf[y * W + min(W - 1, e)]
  for k in x..<e { let t = Double(k - x + 1) / Double(e - x + 1); buf[y * W + k] = (l.0 * (1 - t) + r.0 * t, l.1 * (1 - t) + r.1 * t, l.2 * (1 - t) + r.2 * t) }
  x = e } else { x += 1 } } }
for _ in 0..<400 { for y in (ty0 - 12)..<(ty1 + 12) { for x in (tx0 - 12)..<(tx1 + 12) where wide[y * W + x] {
  let a = buf[(y - 1) * W + x], b = buf[(y + 1) * W + x], c = buf[y * W + x - 1], d = buf[y * W + x + 1]
  buf[y * W + x] = ((a.0 + b.0 + c.0 + d.0) / 4, (a.1 + b.1 + c.1 + d.1) / 4, (a.2 + b.2 + c.2 + d.2) / 4) } } }
print("text removed")

let ow = Int(cx1 - cx0) - 8, oh = Int(cy1 - cy0) - 8, ox = Int(cx0) + 4, oy = Int(cy0) + 4
var out = [UInt8](repeating: 255, count: ow * oh * 4)
func inside(_ x: Double, _ y: Double) -> Bool {
  if x < cx0 || x > cx1 || y < cy0 || y > cy1 { return false }
  let qx = min(max(x, cx0 + R), cx1 - R), qy = min(max(y, cy0 + R), cy1 - R)
  return (x - qx) * (x - qx) + (y - qy) * (y - qy) <= (R - 3) * (R - 3)
}
for j in 0..<oh { for i in 0..<ow {
  let x = ox + i, y = oy + j
  var sx = Double(x), sy = Double(y)
  if !inside(sx, sy) {            // the corners outside the card's round edge: take the colour from just inside the edge
    let qx = min(max(sx, cx0 + R), cx1 - R), qy = min(max(sy, cy0 + R), cy1 - R)
    let dx = sx - qx, dy = sy - qy, len = max(0.001, (dx * dx + dy * dy).squareRoot())
    sx = Int(qx + dx / len * (R - 6)) == 0 ? sx : qx + dx / len * (R - 6); sy = qy + dy / len * (R - 6)
  }
  let c = buf[Int(sy) * W + Int(sx)]
  let o = (j * ow + i) * 4
  out[o] = UInt8(min(255, max(0, c.0))); out[o + 1] = UInt8(min(255, max(0, c.1))); out[o + 2] = UInt8(min(255, max(0, c.2))); out[o + 3] = 255
} }
let cs = CGColorSpaceCreateDeviceRGB()
let octx = CGContext(data: &out, width: ow, height: oh, bitsPerComponent: 8, bytesPerRow: ow * 4, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: outPath) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(d, octx.makeImage()!, nil); CGImageDestinationFinalize(d)
print("wrote \(ow)x\(oh)")
