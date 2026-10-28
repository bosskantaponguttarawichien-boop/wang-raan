import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { createCharacterLoader } from "../character-loader";

const directory = mkdtempSync(join(tmpdir(), "wangraan-model-test-"));
const script = resolve("scripts/create-cafe-customer-model.mjs");
function run(args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", timeout: 30000, windowsHide: true });
}
afterAll(() => {
  // Only the exact directory this suite created may be removed recursively.
  if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith("wangraan-model-test-")) throw new Error("Unexpected temporary directory");
  rmSync(directory, { recursive: true, force: true });
});

describe("isolated character generator", () => {
  it("has no build or FileReader side effects on import", () => {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(script).href)}); console.log(JSON.stringify({reader:typeof globalThis.FileReader}));`], { encoding: "utf8", windowsHide: true });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ reader: "undefined" });
  });
  for (const role of ["customer", "staff"] as const) for (const lite of [false, true]) {
    it(`preserves ${role}/${lite ? "lite" : "full"} byte for byte and writes only that variant`, () => {
      const output = join(directory, `${role}-${lite}`);
      const args = ["--role", role, "--output-dir", output, ...(lite ? ["--lite"] : [])];
      const result = run(args);
      expect(result.status, result.stderr).toBe(0);
      const name = `cafe-${role}${lite ? "-lite" : ""}.glb`;
      expect(readdirSync(output)).toEqual([name]);
      expect(readFileSync(join(output, name))).toEqual(readFileSync(resolve("public/assets/models", name)));
    });
  }
  it("appends an external clip and normalized markers without overwriting another role", async () => {
    const provider = join(directory, "fixture-provider.mjs"), output = join(directory, "provider-output");
    const three = pathToFileURL(resolve("node_modules/three/build/three.module.js")).href;
    writeFileSync(provider, `import * as THREE from ${JSON.stringify(three)};
export const roles = ["staff"];
export default ({role,bones,baseClips}) => {
  if(role!=="staff" || !bones.has("Head") || !baseClips.some(c=>c.name==="Work")) throw new Error("bad provider context");
  return {clips:[new THREE.AnimationClip("Fixture",1,[new THREE.QuaternionKeyframeTrack("Head.quaternion",[0,1],[0,0,0,1,0,0,0,1])])],markers:{Fixture:[{name:"hand-contact",time:0.5}]}};
};`);
    const result = run(["--staff", "--lite", "--output-dir", output, "--clips", provider]);
    expect(result.status, result.stderr).toBe(0);
    expect(readdirSync(output)).toEqual(["cafe-staff-lite.glb"]);
    const bytes = readFileSync(join(output, "cafe-staff-lite.glb"));
    const loaded = await createCharacterLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    expect(loaded.animations.map(clip => clip.name)).toEqual(["Idle", "Walk", "Sit", "Work", "Fixture"]);
    expect(loaded.scene.getObjectByName("CafeMannequin")?.userData.animationMarkers).toEqual({ Fixture: [{ name: "hand-contact", time: 0.5 }] });
    expect(run(["--role", "customer", "--clips", provider, "--output-dir", output]).status).toBe(1);
    expect(readdirSync(output)).toEqual(["cafe-staff-lite.glb"]);
  });
  it.each([
    ["--role", "unknown"], ["--staff", "--role", "customer"], ["--output-dir"], ["--unknown"],
  ])("rejects invalid options without exporting: %j", (...args) => {
    expect(run(args).status).toBe(1);
  });
  it.each(["duplicate", "unknown-target", "bad-marker"])("rejects %s provider data before writing", kind => {
    const provider = join(directory, `${kind}.mjs`), output = join(directory, "invalid-output");
    const three = pathToFileURL(resolve("node_modules/three/build/three.module.js")).href;
    const name = kind === "duplicate" ? "Idle" : "Fixture";
    const target = kind === "unknown-target" ? "MissingBone.quaternion" : "Head.quaternion";
    writeFileSync(provider, `import * as THREE from ${JSON.stringify(three)};export default()=>({clips:[new THREE.AnimationClip(${JSON.stringify(name)},1,[new THREE.QuaternionKeyframeTrack(${JSON.stringify(target)},[0,1],[0,0,0,1,0,0,0,1])])],markers:${kind === "bad-marker" ? '{Fixture:[{name:"bad",time:2}]}' : '{}'}});`);
    const result = run(["--output-dir", output, "--clips", provider]);
    expect(result.status, result.stderr).toBe(1);
    expect(() => readdirSync(output)).toThrow();
  });
});
