/**
 * Export exactly one food asset variant (`<id>.glb` or `<id>-lite.glb`) into the target directory.
 * Usage:
 *   node scripts/food-models/export-one.mjs --id fried-rice [--lite] [--output-dir <dir>] [--builder <module>]
 *
 * Isolation rules (feat-103):
 * - Importing this file has no side effects and writes nothing.
 * - Never exports multiple food IDs or touches character GLBs.
 * - Default output directory is `public/assets/models/food/<id>/`.
 */
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FOOD_IDS, disposeFoodObject, exportFoodGlb } from "./shared/index.mjs";

export function parseFoodExportOptions(args) {
  let foodId;
  let lite = false;
  let outputDirectory;
  let builderModule;

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--lite") {
      lite = true;
    } else if (flag === "--id" || flag === "--output-dir" || flag === "--builder") {
      const value = args[++i];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${flag}`);
      }
      if (flag === "--id") {
        if (foodId !== undefined) throw new Error("Specify --id only once");
        foodId = value;
      } else if (flag === "--output-dir") {
        outputDirectory = resolve(value);
      } else if (flag === "--builder") {
        builderModule = resolve(value);
      }
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }

  if (!foodId) {
    throw new Error("Missing required --id <food-id>");
  }
  if (!FOOD_IDS.includes(foodId)) {
    throw new Error(`Unknown food id: ${foodId}`);
  }

  const defaultOutputDir = fileURLToPath(new URL(`../../public/assets/models/food/${foodId}/`, import.meta.url));
  const defaultBuilderPath = fileURLToPath(new URL(`./${foodId}/build.mjs`, import.meta.url));

  return {
    foodId,
    lite,
    outputDirectory: outputDirectory ?? defaultOutputDir,
    builderModule: builderModule ?? defaultBuilderPath,
  };
}

export async function buildAndExportOneFood({ foodId, lite = false, outputDirectory, builder }) {
  if (!FOOD_IDS.includes(foodId)) {
    throw new Error(`Unknown food id: ${foodId}`);
  }
  if (typeof lite !== "boolean" || !outputDirectory) {
    throw new Error("Expected lite boolean and explicit outputDirectory");
  }
  if (typeof builder !== "function") {
    throw new Error("Food builder must be a function");
  }

  const model = await builder({ foodId, lite });
  try {
    const contractId = model?.userData?.foodContract?.foodId;
    if (contractId && contractId !== foodId) {
      throw new Error(`Builder produced foodId "${contractId}" instead of "${foodId}"`);
    }
    const fileName = `${foodId}${lite ? "-lite" : ""}.glb`;
    const outputFile = resolve(outputDirectory, fileName);
    const result = await exportFoodGlb(model, outputFile, { lite });
    return {
      foodId,
      variant: lite ? "lite" : "full",
      ...result,
    };
  } finally {
    if (model) disposeFoodObject(model);
  }
}

export async function runFoodExport(args) {
  const { foodId, lite, outputDirectory, builderModule } = parseFoodExportOptions(args);
  const imported = await import(pathToFileURL(builderModule).href);
  if (imported.foodId && imported.foodId !== foodId) {
    throw new Error(`Builder module is for "${imported.foodId}", cannot export "${foodId}"`);
  }
  const builder = imported.default ?? imported.buildFoodModel;
  if (typeof builder !== "function") {
    throw new Error(`Builder module must export a default function: ${builderModule}`);
  }
  return buildAndExportOneFood({ foodId, lite, outputDirectory, builder });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const summary = await runFoodExport(process.argv.slice(2));
    console.log(JSON.stringify(summary));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

