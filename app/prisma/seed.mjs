import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const sources = [
  ["Skinnytaste RSS", "https://www.skinnytaste.com/feed/", "rss", ["healthy"]],
  ["Eating Bird Food RSS", "https://www.eatingbirdfood.com/feed/", "rss", ["healthy"]],
  ["Budget Bytes RSS", "https://www.budgetbytes.com/category/recipes/feed/", "rss", ["budget"]],
  ["Ambitious Kitchen RSS", "https://www.ambitiouskitchen.com/feed/", "rss", ["healthy"]],
  ["Well Plated RSS", "https://www.wellplated.com/feed/", "rss", ["healthy"]],
  ["Pinch of Yum RSS", "https://pinchofyum.com/feed", "rss", ["healthy"]],
  ["The Protein Chef RSS", "https://theproteinchef.co/feed/", "rss", ["high-protein"]],
  ["MasonFit RSS", "https://masonfit.com/feed/", "rss", ["high-protein"]],
  ["Downshiftology RSS", "https://downshiftology.com/feed/", "rss", ["meal-prep"]],
  ["Minimalist Baker RSS", "https://minimalistbaker.com/feed/", "rss", ["plant-based"]],
  ["Skinnytaste", "https://www.skinnytaste.com", "blog", ["healthy"]],
  ["EatingWell", "https://www.eatingwell.com/recipes/", "blog", ["healthy"]],
  ["The Protein Chef", "https://theproteinchef.co", "blog", ["high-protein"]],
  ["MasonFit", "https://masonfit.com", "blog", ["high-protein"]],
  ["Nourished by Nic", "https://nourishedbynic.com", "blog", ["high-protein"]]
];

const tags = [
  "meal-prep",
  "ninja-creami",
  "high-protein",
  "high-fiber",
  "budget",
  "healthy",
  "quick",
  "lower-calorie",
  "plant-based",
  "scraped"
];

async function main() {
  for (const name of tags) {
    await prisma.tag.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }

  for (const [name, url, type, defaultTags] of sources) {
    await prisma.scrapeSource.upsert({
      where: { url },
      update: { name, type, defaultTags },
      create: { name, url, type, defaultTags }
    });
  }

  await prisma.appSetting.upsert({
    where: { key: "auto_approval" },
    update: {},
    create: {
      key: "auto_approval",
      value: { protein_g: 20, fiber_g: 5 }
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
