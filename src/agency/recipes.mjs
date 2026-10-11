import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {contentHash} from "../core/ids.mjs";

const catalog = JSON.parse(await readFile(resolve(import.meta.dirname, "../../recipes/v1/catalog.json"), "utf8"));

export class RecipeError extends Error {}

export function loadRecipeCatalog() {
  if (catalog.schema_version !== 1 || !Array.isArray(catalog.recipes) || catalog.recipes.length === 0) throw new RecipeError("A versioned recipe catalog is required");
  const ids = new Set();
  const recipes = catalog.recipes.map((recipe) => {
    if (!recipe.recipe_id || !Number.isInteger(recipe.version) || recipe.version < 1 || ids.has(recipe.recipe_id)) throw new RecipeError("Recipes require unique IDs and positive versions");
    ids.add(recipe.recipe_id);
    for (const field of ["source_ids", "applicable_objectives", "required_inputs", "checks", "limitations"]) if (!Array.isArray(recipe[field]) || recipe[field].length === 0) throw new RecipeError(`Recipe ${recipe.recipe_id} requires ${field}`);
    return {...structuredClone(recipe), hash: contentHash(recipe)};
  });
  return {schema_version: 1, recipes};
}

export function selectRecipes({recipeIds, objective}) {
  const byId = new Map(loadRecipeCatalog().recipes.map((recipe) => [recipe.recipe_id, recipe]));
  if (!Array.isArray(recipeIds) || recipeIds.length === 0 || new Set(recipeIds).size !== recipeIds.length) throw new RecipeError("At least one unique recipe ID is required");
  return recipeIds.map((id) => {
    const recipe = byId.get(id);
    if (!recipe) throw new RecipeError(`Unknown recipe ${id}`);
    if (!recipe.applicable_objectives.includes(objective)) throw new RecipeError(`Recipe ${id} does not apply to ${objective}`);
    return recipe;
  });
}
