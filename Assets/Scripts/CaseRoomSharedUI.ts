import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {FlexAlign, FlexDirection, FlexJustify} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"

/**
 * CaseRoomSharedUI — shared UIKit composition helpers for the CaseRoom*UI modules.
 *
 * Owns: the type scale (applyTextRole), and builders for a BackPlate panel with a column
 * FlexLayout, raw-Text rows, UIKit Buttons with width-budgeted labels, icon Images, and a
 * visibility gate that only hides a panel after UIKit has initialized and laid it out.
 * Children are auto-discovered by FlexLayout on start (never call addItems before init).
 * Must not: hold game state.
 */

// ── Typography: the single source of truth for text size + weight ────────────
// Text.size is the glyph em-square height: em-square cm = size / 43.886. The scale is the
// Snap Specs type scale for the system font at 110 cm; pass the panel distance to keep the
// same angular size, and a per-panel boost when the brief asks for bigger text.
export const FONT_SIZE_SCALE = 1.0

export type TextRole =
  | "Title1" | "Title2" | "HeadlineXL" | "Headline1" | "Headline2"
  | "Subheadline" | "Button" | "Callout" | "Body" | "Caption"

export const TYPE_SCALE: Record<TextRole, {size: number; weight: number}> = {
  Title1: {size: 105, weight: 700},
  Title2: {size: 93, weight: 700},
  HeadlineXL: {size: 62, weight: 700},
  Headline1: {size: 54, weight: 700},
  Headline2: {size: 48, weight: 700},
  Subheadline: {size: 41, weight: 700},
  Button: {size: 39, weight: 500},
  Callout: {size: 39, weight: 700},
  Body: {size: 39, weight: 500},
  Caption: {size: 38, weight: 500},
}

export function roleSize(role: TextRole, distanceCm: number = 110, boost: number = 1): number {
  return TYPE_SCALE[role].size * FONT_SIZE_SCALE * (distanceCm / 110) * boost
}

/** Em-square height in cm for a role (handy for sizing text rects). */
export function roleEmCm(role: TextRole, distanceCm: number = 110, boost: number = 1): number {
  return roleSize(role, distanceCm, boost) / 43.886
}

export function applyTextRole(t: Text, role: TextRole, distanceCm: number = 110, boost: number = 1): void {
  t.size = roleSize(role, distanceCm, boost)
  ;(t as Text & {weight?: number}).weight = TYPE_SCALE[role].weight
}

// Z gaps: content sits in front of the plate; a label sits in front of its button face.
export const CONTENT_Z = 0.6
export const BUTTON_LABEL_Z = 0.08

const IMAGE_MATERIAL = requireAsset("../Materials/ImageMaterial.mat") as Material

export function makeObj(parent: SceneObject, name: string, position?: vec3): SceneObject {
  const so = global.scene.createSceneObject(name)
  so.setParent(parent)
  if (position) so.getTransform().setLocalPosition(position)
  return so
}

export interface Panel {
  root: SceneObject
  plate: BackPlate
  content: SceneObject
  flex: FlexLayout
}

/**
 * A static UIKit panel: Canvas + BackPlate on `root`, then a Content child (z +0.6) with a
 * column FlexLayout. The BackPlate hugs the laid-out content.
 */
export function makePanel(
  parent: SceneObject,
  name: string,
  widthCm: number,
  opts: {padCm?: number; gapCm?: number; style?: "default" | "dark" | "simple"; position?: vec3} = {},
): Panel {
  const root = makeObj(parent, name, opts.position)
  root.createComponent("Component.Canvas")
  const plate = root.createComponent(BackPlate.getTypeName()) as BackPlate
  plate.style = opts.style ?? "dark"
  const content = makeObj(root, "Content", new vec3(0, 0, CONTENT_Z))
  const flex = content.createComponent(FlexLayout.getTypeName()) as FlexLayout
  const pad = opts.padCm ?? 2
  flex.width = widthCm
  flex.height = -1
  flex.direction = FlexDirection.Column
  flex.alignItems = FlexAlign.Center
  flex.justifyContent = FlexJustify.Center
  flex.rowGap = opts.gapCm ?? 1.2
  flex.paddingTop = pad
  flex.paddingBottom = pad
  flex.paddingLeft = pad
  flex.paddingRight = pad
  flex.onLayoutComplete.add((r) => {
    plate.size = new vec2(r.containerWidth, r.containerHeight)
  })
  return {root, plate, content, flex}
}

/** A row container (FlexLayout row) inside a column; children are auto-discovered. */
export function makeRow(parent: SceneObject, name: string, gapCm: number): SceneObject {
  const row = makeObj(parent, name)
  const f = row.createComponent(FlexLayout.getTypeName()) as FlexLayout
  f.direction = FlexDirection.Row
  f.alignItems = FlexAlign.Center
  f.justifyContent = FlexJustify.Center
  f.columnGap = gapCm
  f.width = -1
  f.height = -1
  row.createComponent(FlexItem.getTypeName())
  return row
}

export interface TextOpts {
  wrap?: boolean
  align?: "left" | "center"
  color?: vec4
  boost?: number
}

/** Raw Component.Text sized by an explicit rect (works in rows and columns). */
export function addText(
  parent: SceneObject,
  name: string,
  text: string,
  role: TextRole,
  distanceCm: number,
  widthCm: number,
  heightCm: number,
  opts: TextOpts = {},
): Text {
  const so = makeObj(parent, name)
  const t = so.createComponent("Component.Text") as Text
  t.text = text
  t.depthTest = true
  applyTextRole(t, role, distanceCm, opts.boost ?? 1)
  t.horizontalAlignment = opts.align === "left" ? HorizontalAlignment.Left : HorizontalAlignment.Center
  t.verticalAlignment = VerticalAlignment.Center
  t.horizontalOverflow = opts.wrap ? HorizontalOverflow.Wrap : HorizontalOverflow.Overflow
  t.verticalOverflow = VerticalOverflow.Overflow
  t.layoutRect = Rect.create(-widthCm / 2, widthCm / 2, -heightCm / 2, heightCm / 2)
  if (opts.color) t.textFill.color = opts.color
  so.createComponent(FlexItem.getTypeName())
  return t
}

/**
 * A UIKit Button on its own SceneObject (named `name` so tests can find its Interactable),
 * with a raw-Text label lifted in front of the face.
 */
export function addButton(
  parent: SceneObject,
  name: string,
  label: string,
  widthCm: number,
  heightCm: number,
  distanceCm: number,
  boost: number,
  onPress: () => void,
): {button: Button; label: Text} {
  const so = makeObj(parent, name)
  const btn = so.createComponent(Button.getTypeName()) as Button
  btn.size = new vec3(widthCm, heightCm, 1)
  const labelSO = makeObj(so, `${name}Label`, new vec3(0, 0, BUTTON_LABEL_Z))
  const t = labelSO.createComponent("Component.Text") as Text
  t.text = label
  t.depthTest = true
  applyTextRole(t, "Button", distanceCm, boost)
  t.horizontalAlignment = HorizontalAlignment.Center
  t.verticalAlignment = VerticalAlignment.Center
  t.horizontalOverflow = HorizontalOverflow.Overflow
  t.verticalOverflow = VerticalOverflow.Overflow
  t.layoutRect = Rect.create(-(widthCm - 0.5) / 2, (widthCm - 0.5) / 2, -heightCm / 2, heightCm / 2)
  so.createComponent(FlexItem.getTypeName())
  btn.onTriggerUp.add(() => onPress())
  return {button: btn, label: t}
}

/** An icon Image (cloned ImageMaterial, depth-test on / depth-write off). */
export function addIcon(parent: SceneObject, name: string, texture: Texture, sizeCm: number, inFlex: boolean = true): SceneObject {
  const so = makeObj(parent, name)
  const img = so.createComponent("Component.Image") as Image
  const mat = IMAGE_MATERIAL.clone()
  mat.mainPass.baseTex = texture
  mat.mainPass.depthTest = true
  mat.mainPass.depthWrite = false
  img.clearMaterials()
  img.addMaterial(mat)
  so.getTransform().setLocalScale(new vec3(sizeCm, sizeCm, 1))
  if (inFlex) so.createComponent(FlexItem.getTypeName())
  return so
}

/**
 * Hides/shows `target` only after UIKit has initialized and laid it out (3 frames), because a
 * BackPlate or Button that is disabled before its OnStart never initializes.
 */
export class VisibilityGate {
  private want: boolean
  private ready = false

  constructor(owner: BaseScriptComponent, private target: SceneObject, initiallyVisible: boolean) {
    this.want = initiallyVisible
    let frames = 0
    const ev = owner.createEvent("UpdateEvent")
    ev.bind(() => {
      frames++
      if (frames >= 3) {
        this.ready = true
        this.target.enabled = this.want
        ev.enabled = false
      }
    })
  }

  set(visible: boolean): void {
    this.want = visible
    if (this.ready) this.target.enabled = visible
  }

  get visible(): boolean {
    return this.want
  }
}
