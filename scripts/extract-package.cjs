const fs = require("fs");
const path = require("path");
const { Package } = require("@s4tk/models");
const { BinaryResourceType, TuningResourceType } = require("@s4tk/models/enums");
const { formatResourceGroup } = require("@s4tk/hashing/formatting");

const PKG_PATH = "";
const OUTPUT_DIR = "";
const XML_DIR = "xml";
const PKG_DIR = "packages";
const PREFIX_REGEX = /^[^:]+:/;

const pkg = Package.from(fs.readFileSync(PKG_PATH), {
  decompressBuffers: true,
  saveBuffer: true,
});

const tunings = [];
const simdatas = [];

pkg.entries.forEach((entry) => {
  if (entry.key.type === BinaryResourceType.SimData) {
    simdatas.push(entry);
    pkg.delete(entry.id);
  } else if (entry.key.type in TuningResourceType) {
    tunings.push(entry);
    pkg.delete(entry.id);
  }
});

const subfolders = new Map();

function ensureFolderExists(filepath) {
  const dirname = path.dirname(filepath);
  if (!fs.existsSync(dirname)) fs.mkdirSync(dirname, { recursive: true });
}

tunings.forEach(({ key, resource }) => {
  const filename =
    resource.root.name.replace(PREFIX_REGEX, "") +
    (key.group === 0 ? ".xml" : `.G${formatResourceGroup(key.group)}.xml`);

  const subfolder = resource.root.attributes.i ?? "misc";
  subfolders.set(resource.root.name, subfolder);

  const filepath = path.join(OUTPUT_DIR, XML_DIR, subfolder, filename);
  ensureFolderExists(filepath);

  fs.writeFileSync(filepath, resource.getBuffer());
});

simdatas.forEach(({ resource }) => {
  const filename =
    resource.instance.name.replace(PREFIX_REGEX, "") + ".SimData.xml";

  const subfolder = subfolders.get(resource.instance.name) ?? "misc";

  const filepath = path.join(OUTPUT_DIR, XML_DIR, subfolder, filename);
  ensureFolderExists(filepath);

  fs.writeFileSync(filepath, resource.toXmlDocument().toXml());
});

if (pkg.size > 0) {
  const filepath = path.join(OUTPUT_DIR, PKG_DIR, path.basename(PKG_PATH));
  ensureFolderExists(filepath);

  fs.writeFileSync(filepath, pkg.getBuffer());
}
