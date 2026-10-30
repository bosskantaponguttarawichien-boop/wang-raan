import { resolve } from "node:path";
import { AnimationClip, PropertyBinding } from "three";
import { createCharacterRig } from "./rig.mjs";
import { createBaseClips } from "./base-clips.mjs";
import { exportCharacter } from "./export.mjs";

function validateClips(model, clips, markers) {
  const names = new Set();
  for (const clip of clips) {
    if (!(clip instanceof AnimationClip) || !clip.name || names.has(clip.name)) throw new Error(`Invalid/duplicate animation clip: ${clip?.name}`);
    if (!Number.isFinite(clip.duration) || clip.duration <= 0) throw new Error(`Invalid duration: ${clip.name}`);
    names.add(clip.name);
    for (const track of clip.tracks) {
      const binding = PropertyBinding.parseTrackName(track.name);
      if (!PropertyBinding.findNode(model, binding.nodeName)) throw new Error(`Unknown animation target: ${track.name}`);
    }
  }
  for (const [name, entries] of Object.entries(markers)) {
    if (!names.has(name) || !Array.isArray(entries)) throw new Error(`Unknown marker clip: ${name}`);
    const markerNames = new Set();
    for (const marker of entries) {
      if (!marker.name || markerNames.has(marker.name) || !Number.isFinite(marker.time) || marker.time < 0 || marker.time > 1) throw new Error(`Invalid marker: ${name}/${marker.name}`);
      markerNames.add(marker.name);
    }
  }
}

/**
 * Providers receive {role,lite,model,bones,baseClips} and return {clips,markers?}.
 * This module exports no assets on import. Each call owns a fresh rig and one output.
 */
export async function buildCharacter({ role = "customer", lite = false, outputDirectory, providers = [] }) {
  if (role !== "customer" && role !== "staff") throw new Error(`Unknown role: ${role}`);
  if (typeof lite !== "boolean" || !outputDirectory) throw new Error("Expected lite boolean and explicit outputDirectory");
  const rig = await createCharacterRig({ role, lite });
  try {
    const baseClips = createBaseClips(rig, role);
    const clips = [...baseClips];
    const markers = {};
    for (const provider of providers) {
      if (typeof provider !== "function") throw new Error("Clip provider must be a function");
      const extra = await provider({ role, lite, model: rig.model, bones: new Map(rig.bones), baseClips: Object.freeze(baseClips.map(clip => clip.clone())) });
      if (!extra || !Array.isArray(extra.clips)) throw new Error("Clip provider must return {clips, markers?}");
      clips.push(...extra.clips);
      for (const [clipName, entries] of Object.entries(extra.markers ?? {})) {
        if (Object.hasOwn(markers, clipName)) throw new Error(`Duplicate marker owner: ${clipName}`);
        markers[clipName] = entries;
      }
    }
    validateClips(rig.model, clips, markers);
    if (Object.keys(markers).length) rig.model.userData.animationMarkers = markers;
    const outputFile = resolve(outputDirectory, `cafe-${role}${lite ? "-lite" : ""}.glb`);
    const bytes = await exportCharacter(rig.model, clips, outputFile);
    return { outputFile, bytes, vertices: rig.vertexCount, triangles: rig.triangleCount, clips: clips.map(clip => clip.name) };
  } finally {
    // Nothing from a build is shared with another invocation/provider.
    const geometries = new Set(), materials = new Set();
    rig.model.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      if (object.skeleton) object.skeleton.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }
}
