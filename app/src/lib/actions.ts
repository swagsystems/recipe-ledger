"use server";

import { NutritionSource, RecipeStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getApprovalSettings } from "@/lib/settings";
import { estimateNutritionFromUsda } from "@/lib/usda";
import { ingredientTextsFromJson } from "@/lib/ingredients";

type MacroEstimate = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  matched: number;
};

export async function setRecipeStatus(id: string, status: RecipeStatus) {
  await requireUser();
  await prisma.recipe.update({
    where: { id },
    data: { status, reviewReason: status === "pending" ? undefined : null }
  });
  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath(`/recipes/${id}`);
}

export async function approveAllPendingRecipes() {
  await requireUser();
  await prisma.recipe.updateMany({
    where: { status: RecipeStatus.pending },
    data: { status: RecipeStatus.approved, reviewReason: null }
  });
  revalidatePath("/");
  revalidatePath("/review");
}

export async function rejectAllPendingRecipes() {
  await requireUser();
  await prisma.recipe.updateMany({
    where: { status: RecipeStatus.pending },
    data: { status: RecipeStatus.rejected, reviewReason: "bulk rejected from review queue" }
  });
  revalidatePath("/");
  revalidatePath("/review");
}

export async function saveApprovalSettings(formData: FormData) {
  await requireUser();
  const protein = Number(formData.get("protein_g"));
  const fiber = Number(formData.get("fiber_g"));

  await prisma.appSetting.upsert({
    where: { key: "auto_approval" },
    update: { value: { protein_g: protein, fiber_g: fiber } },
    create: { key: "auto_approval", value: { protein_g: protein, fiber_g: fiber } }
  });
  revalidatePath("/settings");
}

export async function saveSource(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") || "");
  const data = {
    name: String(formData.get("name") || "").trim(),
    url: String(formData.get("url") || "").trim(),
    type: String(formData.get("type") || "rss") as "blog" | "rss",
    enabled: formData.get("enabled") === "on",
    defaultTags: String(formData.get("defaultTags") || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
  };

  if (!data.name || !data.url) return;

  if (id) {
    await prisma.scrapeSource.update({ where: { id }, data });
  } else {
    await prisma.scrapeSource.create({ data });
  }

  revalidatePath("/sources");
}

export async function checkRecipeWithUsda(id: string) {
  await requireUser();

  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: { nutrition: true, tags: { include: { tag: true } }, source: true }
  });
  if (!recipe) return;

  const ingredients = ingredientTextsFromJson(recipe.ingredients, {
    context: {
      title: recipe.title,
      sourceName: recipe.source?.name,
      sourceUrl: recipe.sourceUrl,
      tags: recipe.tags.map(({ tag }) => tag.name)
    }
  });
  const estimate = await estimateNutritionFromUsda(ingredients, recipe.servings);
  if (!estimate) {
    await prisma.recipe.update({
      where: { id },
      data: { reviewReason: "USDA check found no ingredient matches" }
    });
    revalidateRecipePaths(id);
    return;
  }

  const settings = await getApprovalSettings();
  const protein = Number(estimate.nutrition.protein || 0);
  const fiber = Number(estimate.nutrition.fiber || 0);
  const status = protein >= settings.protein_g || fiber >= settings.fiber_g ? RecipeStatus.approved : RecipeStatus.pending;
  const reviewReason =
    status === RecipeStatus.approved
      ? null
      : `USDA matched ${estimate.matched}/${ingredients.length} ingredients; protein: ${protein}g below ${settings.protein_g}g; fiber: ${fiber}g below ${settings.fiber_g}g`;

  await prisma.$transaction([
    prisma.nutrition.upsert({
      where: { recipeId: id },
      update: { ...estimate.nutrition, source: NutritionSource.api_estimated },
      create: {
        recipeId: id,
        ...estimate.nutrition,
        source: NutritionSource.api_estimated
      }
    }),
    prisma.recipe.update({
      where: { id },
      data: {
        status,
        reviewReason,
        confidence: Math.max(recipe.confidence, 0.72)
      }
    })
  ]);

  revalidateRecipePaths(id);
}

export async function estimateOptionalMixins(ingredients: string[], servings?: number | null): Promise<MacroEstimate | null> {
  await requireUser();

  const cleaned = ingredients
    .map((ingredient) => String(ingredient || "").trim())
    .filter(Boolean)
    .slice(0, 8);

  if (!cleaned.length) return null;

  try {
    const estimate = await estimateNutritionFromUsda(cleaned, servings);
    if (!estimate) return null;

    return {
      calories: estimate.nutrition.calories ?? null,
      protein: estimate.nutrition.protein ?? null,
      carbs: estimate.nutrition.carbs ?? null,
      fat: estimate.nutrition.fat ?? null,
      fiber: estimate.nutrition.fiber ?? null,
      matched: estimate.matched
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("USDA_API_KEY")) {
      return null;
    }
    throw error;
  }
}

function revalidateRecipePaths(id: string) {
  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath(`/recipes/${id}`);
}
