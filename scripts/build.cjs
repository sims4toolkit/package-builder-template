const fs = require("fs");
const path = require("path");
const glob = require("glob");
const { Package, XmlResource, SimDataResource } = require("@s4tk/models");
const {
  BinaryResourceType,
  TuningResourceType,
  SimDataGroup,
} = require("@s4tk/models/enums");

//#region Config

const CONFIG_DIR = path.resolve(__dirname, "..");
const CONFIG = require("../s4tk-config.json");

if (CONFIG.buildFolders.length === 0) {
  throw "Build script cannot run without at least one folder listed in 'buildFolders'.";
}

//#endregion

//#region Globals & Helpers

const TUNING_INSTANCES = new Set();
const TUNING_NAMES_TO_KEYS = new Map();
const TUNING_PATHS = new Set();

function getSourceFilePaths(patterns) {
  return patterns
    .map((pattern) =>
      glob.sync(path.resolve(CONFIG_DIR, CONFIG.sourceFolder, pattern))
    )
    .flat(1);
}

function parseTuningKey(filepath, tuning) {
  const filename = tuning.root.name;
  if (TUNING_NAMES_TO_KEYS.has(filename))
    throw new Error(`More than one file has n="${filename}"`);

  const { i, s } = tuning.root.attributes;

  const type = TuningResourceType.parseAttr(i);
  if (!type) throw new Error(`Could not parse i="${i}" as a type`);

  const instance = BigInt(s);
  if (TUNING_INSTANCES.has(instance))
    throw new Error(`More than one file has s="${instance}"`);

  const groupMatch = /G([0-9A-Fa-f]{8})\.xml$/.exec(filepath);
  const group = groupMatch ? parseInt(groupMatch[1], 16) : 0;

  const key = { type, group, instance };
  TUNING_NAMES_TO_KEYS.set(filename, key);
  TUNING_INSTANCES.add(instance);
  return key;
}

function parseSimDataKey(filepath, simdata) {
  const name = simdata.instance.name;
  const tuningKey = TUNING_NAMES_TO_KEYS.get(name);

  if (!tuningKey) throw new Error(`SimData '${name}' does not have tuning`);

  const group = SimDataGroup.getForTuning(tuningKey.type);
  if (!group) {
    const typeName = TuningResourceType[tuningKey.type];
    throw new Error(`SimDataGroup.${typeName} is not defined`);
  }

  return {
    type: BinaryResourceType.SimData,
    group: group,
    instance: tuningKey.instance,
  };
}

//#endregion

//#region Building the Package

const buildPkg = new Package();

// parsing tuning files
getSourceFilePaths(CONFIG.sourcePatterns.tuning).forEach((filepath) => {
  TUNING_PATHS.add(filepath);

  try {
    const buffer = fs.readFileSync(filepath);
    const tuning = XmlResource.from(buffer);
    const key = parseTuningKey(filepath, tuning);
    buildPkg.add(key, tuning);
  } catch (err) {
    console.error(`Error ocurred while building ${filepath}`);
    if (CONFIG.cancelOnError) {
      throw err;
    } else {
      console.error(err);
    }
  }
});

console.log("Tuning built successfully");

// parsing simdata files
getSourceFilePaths(CONFIG.sourcePatterns.simdata).forEach((filepath) => {
  if (TUNING_PATHS.has(filepath))
    throw new Error(
      `'${filepath}' is listed as both tuning and SimData (sourcePatterns is likely configured incorrectly)`
    );

  try {
    const buffer = fs.readFileSync(filepath);
    const simdata = SimDataResource.fromXml(buffer);
    const key = parseSimDataKey(filepath, simdata);
    buildPkg.add(key, simdata);
  } catch (err) {
    console.error(`Error ocurred while building ${filepath}`);
    if (CONFIG.cancelOnError) {
      throw err;
    } else {
      console.error(err);
    }
  }
});

console.log("SimData built successfully");

// merging pre-built packages
getSourceFilePaths(CONFIG.sourcePatterns.packages).forEach((filepath) => {
  const buffer = fs.readFileSync(filepath);
  const resources = Package.extractResources(buffer, { loadRaw: true });
  buildPkg.addAll(resources);
});

console.log("Packages merged successfully");

//#endregion

//#region Writing the Package

const packageName = `${CONFIG.buildName}.package`;
const packageBuffer = buildPkg.getBuffer();
console.log(`Package built successfully: ${packageName}`);

CONFIG.buildFolders.forEach((folder) => {
  if (!path.isAbsolute(folder)) folder = path.resolve(CONFIG_DIR, folder);

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
    console.log(`Created folder: ${folder}`);
  }

  const filepath = path.join(folder, packageName);
  fs.writeFileSync(filepath, packageBuffer);
  console.log(`Wrote package: ${filepath}`);
});

//#endregion

console.log("Build complete");
