/**
 * CaseRoomMeshes — code-authored geometry (MeshBuilder) and material helpers.
 *
 * Owns: a small MeshKit that emits closed, CCW-wound triangle meshes (box, Y-cylinder,
 * lathe, flat polygon), the shared silhouettes (suspect bust, walking figure, shoeprint),
 * and tinted clones of the two project materials.
 * Expects: Assets/Materials/CaseRoomLit.mat (SimplePBR) and Assets/Materials/CaseRoomGlow.mat
 * (Unlit) — created by the scene bootstrap.
 * Must not: hold game state or create UI text.
 *
 * Winding: every triangle is counter-clockwise seen from outside (front face), verified with
 * the cross-product rule: (v1 - v0) x (v2 - v0) points along the outward normal.
 */

const SOLID_MAT = requireAsset("../Materials/CaseRoomLit.mat") as Material
const GLOW_MAT = requireAsset("../Materials/CaseRoomGlow.mat") as Material

/** A 2D profile point (radius, height) for lathes, or (x, y) for flat polygons. */
export type P2 = [number, number]

export class MeshKit {
  private verts: number[] = []
  private indices: number[] = []
  private count = 0

  private v(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
    this.verts.push(x, y, z, nx, ny, nz, 0, 0)
    return this.count++
  }

  private tri(a: number, b: number, c: number): void {
    this.indices.push(a, b, c)
  }

  /** Axis-aligned box centered at (cx, cy, cz) with half extents. 24 verts, per-face normals. */
  box(cx: number, cy: number, cz: number, hw: number, hh: number, hd: number): MeshKit {
    const x0 = cx - hw, x1 = cx + hw
    const y0 = cy - hh, y1 = cy + hh
    const z0 = cz - hd, z1 = cz + hd
    const face = (p: number[][], n: number[]) => {
      const a = this.v(p[0][0], p[0][1], p[0][2], n[0], n[1], n[2])
      const b = this.v(p[1][0], p[1][1], p[1][2], n[0], n[1], n[2])
      const c = this.v(p[2][0], p[2][1], p[2][2], n[0], n[1], n[2])
      const d = this.v(p[3][0], p[3][1], p[3][2], n[0], n[1], n[2])
      this.tri(a, b, c)
      this.tri(a, c, d)
    }
    face([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0])
    face([[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], [-1, 0, 0])
    face([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0])
    face([[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], [0, -1, 0])
    face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1])
    face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1])
    return this
  }

  /** Capped cylinder along +Y, centered at (cx, cy, cz). */
  cylinderY(cx: number, cy: number, cz: number, radius: number, height: number, segments: number = 24): MeshKit {
    const y0 = cy - height / 2
    const y1 = cy + height / 2
    // Side: x = r sin(t), z = r cos(t); quad (a=bottom j, b=bottom j+1, c=top j+1, d=top j) is CCW from outside.
    const side: number[][] = []
    for (let j = 0; j <= segments; j++) {
      const t = (j / segments) * Math.PI * 2
      const s = Math.sin(t), c = Math.cos(t)
      side.push([
        this.v(cx + radius * s, y0, cz + radius * c, s, 0, c),
        this.v(cx + radius * s, y1, cz + radius * c, s, 0, c),
      ])
    }
    for (let j = 0; j < segments; j++) {
      const a = side[j][0], b = side[j + 1][0], c = side[j + 1][1], d = side[j][1]
      this.tri(a, b, c)
      this.tri(a, c, d)
    }
    // Top cap (+Y): (center, p_j, p_j+1) with x = sin, z = cos is CCW seen from above.
    const top = this.v(cx, y1, cz, 0, 1, 0)
    const bottom = this.v(cx, y0, cz, 0, -1, 0)
    const topRim: number[] = []
    const bottomRim: number[] = []
    for (let j = 0; j <= segments; j++) {
      const t = (j / segments) * Math.PI * 2
      const s = Math.sin(t), c = Math.cos(t)
      topRim.push(this.v(cx + radius * s, y1, cz + radius * c, 0, 1, 0))
      bottomRim.push(this.v(cx + radius * s, y0, cz + radius * c, 0, -1, 0))
    }
    for (let j = 0; j < segments; j++) {
      this.tri(top, topRim[j], topRim[j + 1])
      this.tri(bottom, bottomRim[j + 1], bottomRim[j])
    }
    return this
  }

  /**
   * Surface of revolution around +Y. Profile runs bottom -> top as (radius, y).
   * Start and end the profile at radius 0 for a closed solid.
   */
  lathe(profile: P2[], segments: number = 28, cx: number = 0, cy: number = 0, cz: number = 0): MeshKit {
    const rings: number[][] = []
    for (let i = 0; i < profile.length; i++) {
      const prev = profile[Math.max(0, i - 1)]
      const next = profile[Math.min(profile.length - 1, i + 1)]
      const tr = next[0] - prev[0]
      const ty = next[1] - prev[1]
      let nr = ty
      let ny = -tr
      const len = Math.sqrt(nr * nr + ny * ny) || 1
      nr /= len
      ny /= len
      const ring: number[] = []
      for (let j = 0; j <= segments; j++) {
        const t = (j / segments) * Math.PI * 2
        const s = Math.sin(t), c = Math.cos(t)
        const r = profile[i][0]
        ring.push(this.v(cx + r * s, cy + profile[i][1], cz + r * c, nr * s, ny, nr * c))
      }
      rings.push(ring)
    }
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < segments; j++) {
        const a = rings[i][j], b = rings[i][j + 1], c = rings[i + 1][j + 1], d = rings[i + 1][j]
        this.tri(a, b, c)
        this.tri(a, c, d)
      }
    }
    return this
  }

  /** Ellipsoid centered at (cx, cy, cz) with radii (rx, ry, rz). */
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, segments: number = 20): MeshKit {
    const start = this.count
    const profile: P2[] = []
    const steps = 12
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (i / steps) * Math.PI
      profile.push([Math.cos(a), Math.sin(a)])
    }
    this.lathe(profile, segments)
    // Scale + offset the unit sphere we just appended (normals scaled inversely, then renormalized).
    for (let k = start; k < this.count; k++) {
      const o = k * 8
      this.verts[o] = cx + this.verts[o] * rx
      this.verts[o + 1] = cy + this.verts[o + 1] * ry
      this.verts[o + 2] = cz + this.verts[o + 2] * rz
      let nx = this.verts[o + 3] / rx, ny = this.verts[o + 4] / ry, nz = this.verts[o + 5] / rz
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
      this.verts[o + 3] = nx / len
      this.verts[o + 4] = ny / len
      this.verts[o + 5] = nz / len
    }
    return this
  }

  /**
   * Flat polygon in the XY plane at depth z, front facing +Z. Points must be ordered
   * counter-clockwise (seen from +Z) and star-shaped around their average.
   * Adds a back face (facing -Z, offset by -thickness) when thickness > 0.
   */
  flatXY(points: P2[], z: number, thickness: number = 0): MeshKit {
    let mx = 0, my = 0
    for (const p of points) {
      mx += p[0]
      my += p[1]
    }
    mx /= points.length
    my /= points.length
    const center = this.v(mx, my, z, 0, 0, 1)
    const rim = points.map((p) => this.v(p[0], p[1], z, 0, 0, 1))
    for (let k = 0; k < rim.length; k++) {
      this.tri(center, rim[k], rim[(k + 1) % rim.length])
    }
    if (thickness > 0) {
      const zb = z - thickness
      const bc = this.v(mx, my, zb, 0, 0, -1)
      const brim = points.map((p) => this.v(p[0], p[1], zb, 0, 0, -1))
      for (let k = 0; k < brim.length; k++) {
        this.tri(bc, brim[(k + 1) % brim.length], brim[k])
      }
    }
    return this
  }

  build(): RenderMesh {
    const mb = new MeshBuilder([
      {name: "position", components: 3},
      {name: "normal", components: 3, normalized: true},
      {name: "texture0", components: 2},
    ])
    mb.topology = MeshTopology.Triangles
    mb.indexType = MeshIndexType.UInt16
    mb.appendVerticesInterleaved(this.verts)
    mb.appendIndices(this.indices)
    const mesh = mb.getMesh()
    mb.updateMesh()
    return mesh
  }
}

// ── Shared silhouettes ─────────────────────────────────────────────────────────

/** Chest-up bust, ~70 cm tall, ~34 cm wide. Origin at the bottom center. */
export const BUST_PROFILE: P2[] = [
  [0, 0], [16, 0], [17, 6], [16.5, 18], [17, 28], [15.5, 34], [11, 37.5], [6, 39],
  [5, 44], [7.5, 47], [9.5, 51], [10, 56], [9.5, 61], [8, 65.5], [5, 68.5], [0, 70],
]

/** Full standing figure, ~168 cm tall. Origin at the floor center. */
export const FIGURE_PROFILE: P2[] = [
  [0, 0], [11, 0], [12, 8], [11, 45], [12.5, 80], [14, 95], [15.5, 115], [18, 132], [16, 137],
  [7, 141], [5.5, 145], [8, 149], [10, 155], [9.5, 161], [7.5, 165], [4, 167.5], [0, 168],
]

/** Shoeprint outline in the XY plane, toes at +Y. Narrow, pointed heel. */
export function shoeOutline(length: number, width: number, segments: number = 22): P2[] {
  const pts: P2[] = []
  for (let k = 0; k < segments; k++) {
    const a = (k / segments) * Math.PI * 2
    const s = Math.sin(a)
    // 1.0 wide at the toe (s = 1), 0.35 at the heel (s = -1).
    const widthScale = 0.35 + 0.65 * Math.pow((s + 1) / 2, 0.6)
    pts.push([Math.cos(a) * (width / 2) * widthScale, s * (length / 2)])
  }
  return pts
}

// ── Materials ──────────────────────────────────────────────────────────────────

/** A solid (lit) material clone tinted with an RGBA color. */
export function solidMaterial(color: vec4): Material {
  if (isNull(SOLID_MAT)) {
    print("[CaseRoomMeshes] ERROR: Materials/CaseRoomLit.mat is missing")
    return null
  }
  const m = SOLID_MAT.clone()
  m.mainPass.baseColor = color
  return m
}

/** An additive, two-sided, no-depth-write glow clone. Intensity 0..1 scales brightness. */
export function glowMaterial(color: vec3, intensity: number): Material {
  if (isNull(GLOW_MAT)) {
    print("[CaseRoomMeshes] ERROR: Materials/CaseRoomGlow.mat is missing")
    return null
  }
  const m = GLOW_MAT.clone()
  m.mainPass.blendMode = BlendMode.Add
  m.mainPass.depthWrite = false
  m.mainPass.twoSided = true
  setGlow(m, color, intensity)
  return m
}

export function setGlow(m: Material, color: vec3, intensity: number): void {
  if (isNull(m)) return
  const i = Math.max(0, Math.min(1, intensity))
  m.mainPass.baseColor = new vec4(color.x * i, color.y * i, color.z * i, i)
}

/** Create a child SceneObject that renders `mesh` with `material`. */
export function addVisual(
  parent: SceneObject,
  name: string,
  mesh: RenderMesh,
  material: Material,
  position?: vec3,
  rotation?: quat,
  scale?: vec3,
): SceneObject {
  const so = global.scene.createSceneObject(name)
  so.setParent(parent)
  const rmv = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
  rmv.mesh = mesh
  if (!isNull(material)) rmv.mainMaterial = material
  const t = so.getTransform()
  if (position) t.setLocalPosition(position)
  if (rotation) t.setLocalRotation(rotation)
  if (scale) t.setLocalScale(scale)
  return so
}

// ── Small math helpers ─────────────────────────────────────────────────────────

export const DEG = Math.PI / 180

export function yawQuat(rad: number): quat {
  return quat.angleAxis(rad, vec3.up())
}

export function pitchQuat(rad: number): quat {
  return quat.angleAxis(rad, vec3.right())
}

export function rollQuat(rad: number): quat {
  return quat.angleAxis(rad, vec3.forward())
}

/** Viewing direction of a camera-like transform (its -Z axis, i.e. Transform.back) in world space. */
export function lookDirection(t: Transform): vec3 {
  return t.back
}

/** Horizontal viewing direction (the camera's -Z axis flattened onto the floor plane). */
export function flatForward(t: Transform): vec3 {
  const f = lookDirection(t)
  const v = new vec3(f.x, 0, f.z)
  const len = v.length
  return len > 1e-4 ? v.uniformScale(1 / len) : new vec3(0, 0, -1)
}

/** Rotation whose +Z axis points from `from` toward `to`, yaw only. */
export function faceTowardYaw(from: vec3, to: vec3): quat {
  const d = new vec3(to.x - from.x, 0, to.z - from.z)
  if (d.length < 1e-4) return quat.quatIdentity()
  return yawQuat(Math.atan2(d.x, d.z))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
