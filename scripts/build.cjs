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

//#region Cacheing

const CACHE_PATH = path.resolve(CONFIG_DIR, CONFIG.cachePath);
const PATHS_TO_KEYS = new Map();
const SEEN_PATHS = new Set();

// load existing cache, if available
if (CONFIG.cache) {
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE_PATH).toString());
    cache.keys.forEach(({ filepath, key }) => {
      const [t, g, i] = key.split("_");
      PATHS_TO_KEYS.set(filepath, {
        type: parseInt(t),
        group: parseInt(g),
        instance: BigInt(i),
      });
    });
  } catch (err) {
    // intentionally blank
  }
}

//#endregion

//#region Globals & Helpers

const TUNING_INSTANCES = new Set();
const TUNING_NAMES_TO_KEYS = new Map();

function getSourceFilePaths(patterns) {
  return patterns
    .map((pattern) =>
      glob.sync(path.resolve(CONFIG_DIR, CONFIG.sourceFolder, pattern))
    )
    .flat(1);
}

function parseTuningKey(filepath, tuning) {
  if (CONFIG.cache && PATHS_TO_KEYS.has(filepath))
    return PATHS_TO_KEYS.get(filepath);

  const filename = tuning.root.name;
  if (TUNING_NAMES_TO_KEYS.has(filename))
    throw `More than one file has n="${filename}"`;

  const { i, s } = tuning.root.attributes;

  if (tuning.root.tag === "M") {
    var type = TuningResourceType.Tuning;
  } else {
    var type = TuningResourceType.parseAttr(i);
    if (!type || type === TuningResourceType.Tuning)
      throw `Could not parse i="${i}" as a non-generic type`;
  }

  const instance = BigInt(s);
  if (TUNING_INSTANCES.has(instance))
    throw `More than one file has s="${instance}"`;

  const groupMatch = /G([0-9A-Fa-f]{8})\.xml$/.exec(filepath);
  const group = groupMatch ? parseInt(groupMatch[1], 16) : 0;

  const key = { type, group, instance };
  TUNING_NAMES_TO_KEYS.set(filename, key);
  TUNING_INSTANCES.add(instance);
  return key;
}

function parseSimDataKey(filepath, simdata) {
  if (CONFIG.cache && PATHS_TO_KEYS.has(filepath))
    return PATHS_TO_KEYS.get(filepath);

  const name = simdata.instance.name;
  const tuningKey = TUNING_NAMES_TO_KEYS.get(name);

  if (!tuningKey) throw `SimData '${name}' does not have matching tuning`;

  const group = SimDataGroup.getForTuning(tuningKey.type);
  if (!group) {
    const typeName = TuningResourceType[tuningKey.type];
    throw `SimDataGroup.${typeName} is not defined`;
  }

  const key = {
    type: BinaryResourceType.SimData,
    group: group,
    instance: tuningKey.instance,
  };

  return key;
}

//#endregion

//#region Building the Package

const buildPkg = new Package();

// parsing tuning files
getSourceFilePaths(CONFIG.sourcePatterns.tuning).forEach((filepath) => {
  try {
    const buffer = fs.readFileSync(filepath);
    const tuning = XmlResource.from(buffer);
    const key = parseTuningKey(filepath, tuning);
    PATHS_TO_KEYS.set(filepath, key);
    SEEN_PATHS.add(filepath);
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
  try {
    const buffer = fs.readFileSync(filepath);
    const simdata = SimDataResource.fromXml(buffer);
    const key = parseSimDataKey(filepath, simdata);
    PATHS_TO_KEYS.set(filepath, key);
    SEEN_PATHS.add(filepath);
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

//#region Writing the Cache

if (CONFIG.cache) {
  try {
    const keys = [];

    PATHS_TO_KEYS.forEach((key, filepath) => {
      if (SEEN_PATHS.has(filepath)) {
        keys.push({
          filepath,
          key: `${key.type}_${key.group}_${key.instance}`,
        });
      }
    });

    fs.writeFileSync(CACHE_PATH, JSON.stringify({ keys }));

    console.log(`Saved cached: ${CACHE_PATH}`);
  } catch (err) {
    console.error(`Failed to save cache: ${err}`);
  }
}

//#endregion

console.log("Build complete");
