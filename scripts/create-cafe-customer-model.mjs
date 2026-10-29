/**
 * Build one trusted character GLB. Legacy --staff/--lite flags remain supported.
 * node scripts/create-cafe-customer-model.mjs --role staff --lite --output-dir <dir>
 * Add --clips <ESM module> per provider; importing this entry point writes nothing.
 *
 * With no --clips the role's registered lane providers are used, so the published
 * assets stay reproducible from the plain command. An explicit --clips replaces
 * that set entirely, which keeps provider fixtures isolated.
 */
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildCharacter } from "./model-generation/build.mjs";

/** Clip providers that ship with each role's published GLB (feat-109/111 for staff). */
export const REGISTERED_CLIP_MODULES = {
  customer: [],
  staff: ["scripts/character-clips/staff-carry.mjs", "scripts/character-clips/staff-clean.mjs"],
};

const registeredClipModules = (role) =>
  REGISTERED_CLIP_MODULES[role].map((path) => fileURLToPath(new URL("../" + path, import.meta.url)));

export function parseCharacterOptions(args) {
  let role, legacyStaff = false, lite = false;
  let outputDirectory = fileURLToPath(new URL("../public/assets/models/", import.meta.url));
  const clipModules = [];
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--staff") legacyStaff = true;
    else if (flag === "--lite") lite = true;
    else if (flag === "--role" || flag === "--output-dir" || flag === "--clips") {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error("Missing value for " + flag);
      if (flag === "--role") {
        if (role !== undefined) throw new Error("Specify --role only once");
        role = value;
      } else if (flag === "--output-dir") outputDirectory = resolve(value);
      else clipModules.push(resolve(value));
    } else throw new Error("Unknown option: " + flag);
  }
  if (legacyStaff && role && role !== "staff") throw new Error("--staff conflicts with --role");
  role ??= legacyStaff ? "staff" : "customer";
  if (role !== "customer" && role !== "staff") throw new Error("Unknown role: " + role);
  return { role, lite, outputDirectory, clipModules: clipModules.length ? clipModules : registeredClipModules(role) };
}

export async function runCharacterBuild(args) {
  const { clipModules, ...options } = parseCharacterOptions(args);
  const providers = [];
  for (const path of clipModules) {
    const providerModule = await import(pathToFileURL(path).href);
    if (providerModule.roles && (!Array.isArray(providerModule.roles) || !providerModule.roles.includes(options.role))) throw new Error("Provider does not support role: " + path);
    if (typeof providerModule.default !== "function") throw new Error("Provider needs a default function export: " + path);
    providers.push(providerModule.default);
  }
  return buildCharacter({ ...options, providers });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await runCharacterBuild(process.argv.slice(2))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
