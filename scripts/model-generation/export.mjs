import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, prune, quantize, reorder, resample } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";

/** Export exactly one requested file, preserving the legacy compression settings. */
export async function exportCharacter(model, clips, outputFile) {
  // Node-only compatibility, installed on use rather than as an import side effect.
  if (!globalThis.FileReader) {
    globalThis.FileReader = class FileReader {
      readAsArrayBuffer(blob) {
        blob.arrayBuffer().then(result => {
          this.result = result;
          this.onloadend?.();
        });
      }
    };
  }
  const glb = await new GLTFExporter().parseAsync(model, { binary: true, animations: clips, onlyVisible: true });
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  const document = await io.readBinary(new Uint8Array(glb));
  await document.transform(
    dedup(), prune({ keepAttributes: true }), resample(),
    quantize({ pattern: /^(NORMAL|JOINTS_0|WEIGHTS_0)$/, quantizeNormal: 8, quantizeWeight: 8 }),
    reorder({ encoder: MeshoptEncoder }),
  );
  document.createExtension(KHRMeshQuantization).setRequired(true);
  document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const compressed = await io.writeBinary(document);
  // Create/write only after validation and encoding succeed.
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, compressed);
  return compressed.byteLength;
}
