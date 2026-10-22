/**
 * CaseRoomSightline — what stands between the eyes and a panel.
 *
 * Solid things in the room (the stand-in furniture's parts, the clues' meshes) are described as boxes.
 * nearestDepth() returns how far, measured along the panel's facing direction, the nearest solid point
 * inside the pyramid from the eye through the panel's corners is. A panel drawn nearer than that is never
 * hidden by any of the boxes, wherever on it the player looks.
 * Pure functions; no scene state.
 */

/** A solid box: centre, three unit axes, and half sizes along them (cm, world). */
export interface SolidBox {
  center: vec3
  axes: vec3[]
  half: vec3
}

/** n . p <= d, with n of unit length. */
interface HalfSpace {
  n: vec3
  d: number
}

function halfSpace(n: vec3, d: number): HalfSpace {
  const len = n.length
  return {n: n.uniformScale(1 / len), d: d / len}
}

/**
 * Smallest depth (p - eye) . dir over the points p that are inside one of `boxes` and inside the pyramid
 * from `eye` through `corners` (in order around the panel), at least 1 cm in front of the eye.
 * Infinity when no box reaches into the pyramid.
 */
export function nearestDepth(eye: vec3, dir: vec3, corners: vec3[], boxes: SolidBox[]): number {
  const cone: HalfSpace[] = []
  for (let i = 0; i < corners.length; i++) {
    let m = corners[i].sub(eye).cross(corners[(i + 1) % corners.length].sub(eye))
    if (m.dot(dir) < 0) m = m.uniformScale(-1) // so that m . (p - eye) >= 0 inside
    cone.push(halfSpace(m.uniformScale(-1), -m.dot(eye)))
  }
  cone.push(halfSpace(dir.uniformScale(-1), -dir.dot(eye) - 1))
  let best = Infinity
  for (const box of boxes) {
    const planes = cone.slice()
    const h = [box.half.x, box.half.y, box.half.z]
    for (let i = 0; i < 3; i++) {
      const a = box.axes[i]
      const c = a.dot(box.center)
      planes.push(halfSpace(a, c + h[i]))
      planes.push(halfSpace(a.uniformScale(-1), -c + h[i]))
    }
    best = Math.min(best, minDepth(planes, eye, dir))
  }
  return best
}

/**
 * The region inside all `planes` is convex and bounded (it lies in a box), so the depth is smallest at one
 * of its corners: try every point where three planes meet and keep those inside all of them.
 */
function minDepth(planes: HalfSpace[], eye: vec3, dir: vec3): number {
  let best = Infinity
  const n = planes.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const a = planes[i]
        const b = planes[j]
        const c = planes[k]
        const bc = b.n.cross(c.n)
        const det = a.n.dot(bc)
        if (Math.abs(det) < 1e-6) continue
        const p = bc
          .uniformScale(a.d)
          .add(c.n.cross(a.n).uniformScale(b.d))
          .add(a.n.cross(b.n).uniformScale(c.d))
          .uniformScale(1 / det)
        let inside = true
        for (const q of planes) {
          if (q.n.dot(p) > q.d + 1e-3) {
            inside = false
            break
          }
        }
        if (inside) best = Math.min(best, p.sub(eye).dot(dir))
      }
    }
  }
  return best
}
