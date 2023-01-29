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

//#endregion

//#region Cache

const CACHE_DIR = path.resolve(CONFIG_DIR, CONFIG.cacheFolder);
const CACHE_PATH = path.join(CACHE_DIR, "cache.json");

/** Map of filepaths (strings) to keys (objects w/ type, group, instance). */
const PATH_TO_KEY_CACHE = new Map();

/** Map of tuning names (strings) to filepaths (strings). */
const NAME_TO_PATH_CACHE = new Map();

/** Set of filepaths (strings) that exist, so unseen ones can be deleted. */
const SEEN_PATHS = new Set();

// Load existing cache, if there is any
try {
  if (fs.existsSync(CACHE_PATH)) {
    // Cache = { keys: { filepath: string; tuningName: string; key: ResourceKey; }[]; }
    // ResourceKey = { type: number; group: number; instance: string; }
    const cache = JSON.parse(fs.readFileSync(CACHE_PATH).toString());

    cache.keys.forEach(({ filepath, tuningName, key }) => {
      key.instance = BigInt(key.instance);
      PATH_TO_KEY_CACHE.set(filepath, key);
      NAME_TO_PATH_CACHE.set(tuningName, filepath);
    });

    console.log(`Using cache: ${CACHE_PATH}`);
  } else {
    console.log("No cache found. Keys will be generated from XML.");
  }
} catch (err) {
  console.error("Error reading cache:", err);
  console.log("Keys will be generated from XML.");
}

//#endregion

//#region Helpers

function getSourceFilePaths(patterns) {
  return patterns
    .map((pattern) =>
      glob.sync(path.resolve(CONFIG_DIR, CONFIG.sourceFolder, pattern))
    )
    .flat(1);
}

function getTuningKey(filepath, resource) {
  if (PATH_TO_KEY_CACHE.has(filepath)) return PATH_TO_KEY_CACHE.get(filepath);
  // TODO:
}

function getSimDataKey(filepath, resource) {
  if (PATH_TO_KEY_CACHE.has(filepath)) return PATH_TO_KEY_CACHE.get(filepath);
  // TODO:
}

//#endregion

//#region Building the Package

const buildPkg = new Package();

// parsing tuning files
getSourceFilePaths(CONFIG.sourcePatterns.tuning).forEach((filepath) => {
  try {
    const { key, resource } = createTuningEntry(filepath);
    buildPkg.add(key, resource);
  } catch (err) {
    // TODO:
  }

  SEEN_PATHS.add(filepath);
});

console.log("Tuning built successfully");

// parsing simdata files
getSourceFilePaths(CONFIG.sourcePatterns.simdata).forEach((filepath) => {
  if (SEEN_PATHS.has(filepath)) {
    throw new Error(
      `File path '${filepath}' appears in both tuning and SimData glob lists. The patterns set in s4tk-config.json are probably incorrect.`
    );
  }

  try {
    // TODO:
  } catch (err) {
    // TODO:
  }

  SEEN_PATHS.add(filepath);
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

if (CONFIG.buildFolders.length === 0) {
  throw new Error(
    `Your package cannot be written without at least one folder listed in 'buildFolders'.`
  );
}

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

//#region Saving the Cache

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
  console.log(`Created cache folder: ${CACHE_DIR}`);
}

try {
  const newKeysCache = [];

  NAME_TO_PATH_CACHE.forEach((filepath, tuningName) => {
    if (SEEN_PATHS.has(filepath)) {
      const key = PATH_TO_KEY_CACHE.get(filepath);
      newKeysCache.push({ filepath, tuningName, key });
    }
  });

  fs.writeFileSync(
    CACHE_PATH,
    JSON.stringify({ keys: newKeysCache }, (_, value) =>
      // bigints must become strings or else they'll lose precision
      typeof value === "bigint" ? value.toString() : value
    )
  );

  console.log(`Saved cached: ${CACHE_PATH}`);
} catch (err) {
  console.error(`Failed to save cache: ${err}`);
}

//#endregion

console.log("Build complete");
