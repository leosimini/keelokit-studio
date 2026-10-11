import Ajv2020 from "ajv/dist/2020.js";
import {readFile, readdir} from "node:fs/promises";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schemaDir = join(root, "schemas/v1");
const documentSchemas = new Map([
  ["project-context.json", "project-context.schema.json"],
  ["audiences.json", "audiences.schema.json"],
  ["product-evidence.json", "product-evidence.schema.json"],
  ["assets.json", "assets.schema.json"],
  ["content-plan.json", "content-plan.schema.json"]
]);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function duplicates(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

export async function validateContracts(inputDirectory) {
  const directory = resolve(inputDirectory);
  const ajv = new Ajv2020({allErrors: true, strict: true});
  const errors = [];
  const documents = {};

  for (const [documentName, schemaName] of documentSchemas) {
    const schema = await readJson(join(schemaDir, schemaName));
    const document = await readJson(join(directory, documentName));
    documents[documentName] = document;
    const validator = ajv.compile(schema);
    const valid = validator(document);
    if (!valid) {
      for (const error of validator.errors ?? []) {
        errors.push(`${documentName}${error.instancePath || "/"}: ${error.message}`);
      }
    }
  }

  const storyboards = [];
  const storyboardSchema = await readJson(join(schemaDir, "storyboard.schema.json"));
  const storyboardValidator = ajv.compile(storyboardSchema);
  for (const name of (await readdir(join(directory, "storyboards"))).filter((entry) => entry.endsWith(".json")).sort()) {
    const storyboard = await readJson(join(directory, "storyboards", name));
    storyboards.push({name, storyboard});
    if (!storyboardValidator(storyboard)) {
      for (const error of storyboardValidator.errors ?? []) {
        errors.push(`storyboards/${name}${error.instancePath || "/"}: ${error.message}`);
      }
    }
  }

  if (errors.length > 0) return {valid: false, errors};

  const projectId = documents["project-context.json"].project_id;
  for (const [name, document] of Object.entries(documents)) {
    if (document.project_id !== projectId) errors.push(`${name}: project_id must equal ${projectId}`);
  }
  for (const {name, storyboard} of storyboards) {
    if (storyboard.project_id !== projectId) errors.push(`storyboards/${name}: project_id must equal ${projectId}`);
  }

  const sourceIdList = documents["project-context.json"].sources.map(({source_id}) => source_id);
  const sourceIds = new Set(sourceIdList);
  const audiences = documents["audiences.json"].audiences;
  const audienceIds = new Set(audiences.map(({audience_id}) => audience_id));
  const evidenceIdList = documents["product-evidence.json"].evidence.map(({evidence_id}) => evidence_id);
  const evidenceIds = new Set(evidenceIdList);
  const assets = documents["assets.json"].assets;
  const assetIds = new Set(assets.map(({asset_id}) => asset_id));
  const suites = documents["content-plan.json"].suites;
  const suiteIds = new Set(suites.map(({suite_id}) => suite_id));
  const pieces = suites.flatMap(({pieces}) => pieces);
  const pieceIds = new Set(pieces.map(({piece_id}) => piece_id));
  const piecesById = new Map(pieces.map((piece) => [piece.piece_id, piece]));

  for (const duplicate of duplicates(sourceIdList)) errors.push(`project-context.json: duplicate source_id ${duplicate}`);
  for (const duplicate of duplicates(audiences.map(({audience_id}) => audience_id))) errors.push(`audiences.json: duplicate audience_id ${duplicate}`);
  for (const duplicate of duplicates(evidenceIdList)) errors.push(`product-evidence.json: duplicate evidence_id ${duplicate}`);
  for (const duplicate of duplicates(assets.map(({asset_id}) => asset_id))) errors.push(`assets.json: duplicate asset_id ${duplicate}`);
  for (const duplicate of duplicates(suites.map(({suite_id}) => suite_id))) errors.push(`content-plan.json: duplicate suite_id ${duplicate}`);
  for (const duplicate of duplicates(pieces.map(({piece_id}) => piece_id))) errors.push(`content-plan.json: duplicate piece_id ${duplicate}`);

  for (const audience of audiences) {
    for (const sourceId of audience.source_ids) if (!sourceIds.has(sourceId)) errors.push(`audiences.json: audience ${audience.audience_id} references unknown source ${sourceId}`);
  }
  for (const asset of assets) {
    if (asset.evidence_id != null && !evidenceIds.has(asset.evidence_id)) errors.push(`assets.json: asset ${asset.asset_id} references unknown evidence ${asset.evidence_id}`);
  }
  for (const suite of suites) {
    for (const dependency of suite.dependencies) if (!suiteIds.has(dependency)) errors.push(`content-plan.json: suite ${suite.suite_id} references unknown suite dependency ${dependency}`);
  }
  for (const piece of pieces) {
    if (!audienceIds.has(piece.audience_id)) errors.push(`content-plan.json: piece ${piece.piece_id} references unknown audience ${piece.audience_id}`);
    for (const evidenceId of piece.evidence_ids) if (!evidenceIds.has(evidenceId)) errors.push(`content-plan.json: piece ${piece.piece_id} references unknown evidence ${evidenceId}`);
    for (const dependency of piece.dependencies) if (!pieceIds.has(dependency)) errors.push(`content-plan.json: piece ${piece.piece_id} references unknown piece dependency ${dependency}`);
  }
  for (const {name, storyboard} of storyboards) {
    const piece = piecesById.get(storyboard.piece_id);
    if (!piece) errors.push(`storyboards/${name}: unknown piece ${storyboard.piece_id}`);
    if (!audienceIds.has(storyboard.audience_id)) errors.push(`storyboards/${name}: unknown audience ${storyboard.audience_id}`);
    if (piece && storyboard.audience_id !== piece.audience_id) errors.push(`storyboards/${name}: audience_id must match piece ${storyboard.piece_id}`);
    if (piece && storyboard.intention !== piece.intention) errors.push(`storyboards/${name}: intention must match piece ${storyboard.piece_id}`);
    if (piece && storyboard.cta !== piece.cta) errors.push(`storyboards/${name}: cta must match piece ${storyboard.piece_id}`);
    for (const scene of storyboard.scenes) {
      if (scene.end_seconds <= scene.start_seconds) errors.push(`storyboards/${name}: scene ${scene.scene_id} must end after it starts`);
      if (scene.end_seconds > storyboard.duration_seconds) errors.push(`storyboards/${name}: scene ${scene.scene_id} exceeds storyboard duration`);
      for (const evidenceId of scene.evidence_ids) if (!evidenceIds.has(evidenceId)) errors.push(`storyboards/${name}: scene ${scene.scene_id} references unknown evidence ${evidenceId}`);
      for (const assetId of scene.asset_ids) if (!assetIds.has(assetId)) errors.push(`storyboards/${name}: scene ${scene.scene_id} references unknown asset ${assetId}`);
    }
  }

  return {valid: errors.length === 0, errors};
}

