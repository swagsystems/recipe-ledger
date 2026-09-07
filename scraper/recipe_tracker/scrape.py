import json
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

import feedparser
import requests
from bs4 import BeautifulSoup
from psycopg.types.json import Jsonb
from recipe_scrapers import scrape_html

from .db import connect
from .nutrition import estimate_from_ingredients, scraped_nutrition

MAX_ITEMS = int(os.environ.get("MAX_ITEMS_PER_SOURCE", "10"))
MAX_CANDIDATES = int(os.environ.get("MAX_CANDIDATES_PER_SOURCE", str(max(MAX_ITEMS * 5, 50))))
DRY_RUN = os.environ.get("DRY_RUN") == "1"
VERBOSE = os.environ.get("SCRAPER_VERBOSE") == "1"
HEADERS = {"User-Agent": "HeliosRecipeTracker/0.1"}
TRACKING_PARAMS = {"adt_ei", "fbclid", "gclid", "mc_cid", "mc_eid", "mkt_tok"}


def main():
    with connect() as conn:
        sources = conn.execute(
            'select id, name, url, type, "defaultTags" from "ScrapeSource" where enabled = true order by name'
        ).fetchall()
        settings = get_settings(conn)

        for source in sources:
            print(f"scraping {source['name']} ({source['type']})")
            try:
                inserted = scrape_source(conn, source, settings)
                if not DRY_RUN:
                    conn.execute(
                        'update "ScrapeSource" set "lastScrapedAt" = now(), "updatedAt" = now() where id = %s',
                        (source["id"],),
                    )
                    conn.commit()
                print(f"source {source['name']}: inserted {inserted}")
            except Exception as error:
                conn.rollback()
                print(f"source failed {source['name']}: {error}")


def get_settings(conn):
    row = conn.execute('select value from "AppSetting" where key = %s', ("auto_approval",)).fetchone()
    value = row["value"] if row else {}
    return {"protein_g": float(value.get("protein_g", 20)), "fiber_g": float(value.get("fiber_g", 5))}


def scrape_source(conn, source, settings):
    candidates = candidates_for(source)
    print(f"source {source['name']}: candidates {len(candidates)}")
    inserted = 0
    skipped_existing = 0
    failed_parse = 0
    rejected_filter = 0

    scanned = 0
    for url in candidates[:MAX_CANDIDATES]:
        if inserted >= MAX_ITEMS:
            break
        scanned += 1
        allowed, reason = candidate_allowed_for_source(url, source)
        if not allowed:
            rejected_filter += 1
            _debug_candidate(f"reject {url}: {reason}")
            continue
        if exists(conn, url):
            skipped_existing += 1
            continue
        try:
            recipe, reason = parse_recipe_with_reason(url, source)
            if not recipe:
                failed_parse += 1
                _debug_candidate(f"parse failed {url}: {reason}")
                continue
            status, reason = decide_status(recipe.get("nutrition"), settings)
            recipe["status"] = status
            recipe["reviewReason"] = reason
            if DRY_RUN:
                print(f"dry-run insert {recipe['title']} ({recipe['sourceUrl']})")
                inserted += 1
                continue
            recipe_id = insert_recipe(conn, source, recipe)
            attach_tags(conn, recipe_id, merge_tags(source.get("defaultTags"), auto_tags(source, recipe)))
            inserted += 1
        except Exception as error:
            failed_parse += 1
            conn.rollback()
            print(f"candidate failed {url}: {error}")
            continue

    print(
        f"source {source['name']}: inserted {inserted}, existing {skipped_existing}, "
        f"failed_parse {failed_parse}, rejected_filter {rejected_filter}, scanned {scanned}"
    )
    return inserted


def candidates_for(source):
    direct = _direct_source_candidate(source)
    if source["type"] == "rss":
        return _unique_recipe_links(
            [direct, *rss_candidates(source["url"]), *wordpress_api_candidates(source["url"]), *sitemap_candidates(source["url"])],
            source=source,
        )
    return _unique_recipe_links(
        [direct, *blog_candidates(source["url"]), *wordpress_api_candidates(source["url"]), *sitemap_candidates(source["url"])],
        source=source,
    )


def rss_candidates(url):
    parsed = feedparser.parse(url)
    return _unique_recipe_links(entry.link for entry in parsed.entries if getattr(entry, "link", None))


def blog_candidates(url):
    for feed in (urljoin(url.rstrip("/") + "/", "feed/"), urljoin(url.rstrip("/") + "/", "rss/")):
        links = rss_candidates(feed)
        if links:
            return links

    try:
        html = requests.get(url, headers=HEADERS, timeout=20).text
    except Exception:
        return []
    soup = BeautifulSoup(html, "html.parser")
    links = []
    for anchor in soup.select("a[href]"):
        href = urljoin(url, anchor["href"])
        if _looks_like_recipe_url(href):
            links.append(href)
    return _unique_recipe_links(links)


def sitemap_candidates(url):
    root = _site_root(url)
    links = []
    for sitemap_url in (urljoin(root, "sitemap.xml"), urljoin(root, "sitemap_index.xml")):
        links.extend(_sitemap_links(sitemap_url, depth=0))
        if len(links) >= MAX_CANDIDATES:
            break
    return _unique_recipe_links(links)


def _sitemap_links(url, depth):
    if depth > 2:
        return []
    try:
        response = requests.get(url, headers=HEADERS, timeout=20)
        response.raise_for_status()
        root = ET.fromstring(response.content)
    except Exception:
        return []

    locs = [node.text.strip() for node in root.findall(".//{*}loc") if node.text]
    if not locs:
        return []

    child_sitemaps = [loc for loc in locs if loc.lower().endswith(".xml") and not _is_media_url(loc)]
    if child_sitemaps:
        prioritized = sorted(
            child_sitemaps,
            key=lambda item: (
                not any(word in item.lower() for word in ("recipe", "post")),
                item,
            ),
        )
        links = []
        for child in prioritized[:20]:
            links.extend(_sitemap_links(child, depth + 1))
            if len(links) >= MAX_CANDIDATES:
                break
        return links

    return [loc for loc in locs if not _is_media_url(loc)][:MAX_CANDIDATES]


def wordpress_api_candidates(url):
    root = _site_root(url)
    links = []
    for page in range(1, 4):
        try:
            response = requests.get(
                urljoin(root, "wp-json/wp/v2/posts"),
                headers=HEADERS,
                params={"per_page": 100, "page": page, "_fields": "link"},
                timeout=20,
            )
            if response.status_code == 400:
                break
            response.raise_for_status()
            posts = response.json()
        except Exception:
            break
        if not isinstance(posts, list) or not posts:
            break
        links.extend(post.get("link") for post in posts if isinstance(post, dict))
        if len(links) >= MAX_CANDIDATES:
            break
    return _unique_recipe_links(links)


def parse_recipe(url, source):
    recipe, _reason = parse_recipe_with_reason(url, source)
    return recipe


def parse_recipe_with_reason(url, source):
    try:
        html = requests.get(url, headers=HEADERS, timeout=25).text
        soup = BeautifulSoup(html, "html.parser")
        scraper = scrape_html(html, url, online=False, wild_mode=True)
        title = scraper.title()
        ingredients = [normalize_ingredient_item(item, recipe_title=title, source=source) for item in scraper.ingredients()]
        ingredient_texts = [ingredient_text(item) for item in ingredients if ingredient_text(item)]
        required_ingredients = required_ingredient_texts(ingredients)
        instructions = scraper.instructions_list() or _split_instructions(scraper.instructions())
        servings = _servings(scraper)
        nutrition = scraped_nutrition(scraper, servings)
        nutrition_source = "scraped"
        if not nutrition:
            nutrition = estimate_from_ingredients(required_ingredients, servings)
            nutrition_source = "api_estimated" if nutrition else None
        missing = []
        if not title:
            missing.append("title")
        if not ingredient_texts:
            missing.append("ingredients")
        if not instructions:
            missing.append("instructions")
        if missing:
            return None, f"missing {', '.join(missing)}"
        return {
            "title": title[:500],
            "description": _description(scraper),
            "sourceUrl": url,
            "sourceType": source["type"],
            "ingredients": ingredients,
            "instructions": instructions,
            "servings": servings,
            "prepTime": _minutes(scraper, "prep_time"),
            "cookTime": _minutes(scraper, "cook_time"),
            "imageUrl": _image(scraper) or _meta_image(soup, url),
            "nutrition": nutrition,
            "nutritionSource": nutrition_source,
            "confidence": 1 if nutrition_source == "scraped" else 0.65,
        }, None
    except Exception as error:
        return None, _parse_error_reason(error)


def insert_recipe(conn, source, recipe):
    row = conn.execute(
        """
        insert into "Recipe"
          (id, title, description, "sourceUrl", "sourceType", ingredients, instructions, servings,
           "prepTime", "cookTime", "imageUrl", status, "reviewReason", confidence, "sourceId", "createdAt", "updatedAt")
        values
          (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now(), now())
        returning id
        """,
        (
            recipe["title"],
            recipe["description"],
            recipe["sourceUrl"],
            recipe["sourceType"],
            Jsonb(recipe["ingredients"]),
            Jsonb(recipe["instructions"]),
            recipe["servings"],
            recipe["prepTime"],
            recipe["cookTime"],
            recipe["imageUrl"],
            recipe["status"],
            recipe["reviewReason"],
            recipe["confidence"],
            source["id"],
        ),
    ).fetchone()
    recipe_id = row["id"]
    if recipe.get("nutrition"):
        n = recipe["nutrition"]
        conn.execute(
            """
            insert into "Nutrition" (id, "recipeId", calories, protein, carbs, fat, fiber, nutrients, source)
            values (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                recipe_id,
                n.get("calories"),
                n.get("protein"),
                n.get("carbs"),
                n.get("fat"),
                n.get("fiber"),
                Jsonb(n.get("nutrients")) if n.get("nutrients") else None,
                recipe["nutritionSource"],
            ),
        )
    return recipe_id


def normalize_tag(tag):
    tag = str(tag or "").strip().lower().replace("_", "-")
    tag = re.sub(r"[^a-z0-9+ -]+", "", tag)
    tag = re.sub(r"\s+", "-", tag)
    tag = re.sub(r"-+", "-", tag).strip("-")
    return tag


def normalize_tags(tags):
    return {tag for tag in (normalize_tag(tag) for tag in (tags or [])) if tag}


def merge_tags(*tag_groups):
    merged = set()
    for tags in tag_groups:
        merged |= normalize_tags(tags)
    return merged


OPTIONAL_INGREDIENT_PATTERNS = (
    ("optional", re.compile(r"\boptional\b|\(optional\)", re.IGNORECASE)),
    ("to taste", re.compile(r"\bto taste\b", re.IGNORECASE)),
    ("serving", re.compile(r"\bfor serving\b|\bplus more for serving\b", re.IGNORECASE)),
    ("topping", re.compile(r"\bfor toppings?\b|\btoppings?\b|\byour favorite toppings\b", re.IGNORECASE)),
    ("garnish", re.compile(r"\bgarnish\b|\bfor garnish\b", re.IGNORECASE)),
    (
        "substitution",
        re.compile(
            r"\bor substitute\b|\bor use\b|\balternatively\b|\bsubstitute\b|\bswap\b|\bchoice of\b",
            re.IGNORECASE,
        ),
    ),
)

SMOOTHIE_CONTEXT_PATTERN = re.compile(r"\bsmoothie(?:[-\s]?bowl)?\b|\bacai\b", re.IGNORECASE)
SMOOTHIE_MIXIN_PATTERNS = (
    ("mix-in", re.compile(r"\bprotein powder\b", re.IGNORECASE)),
    ("mix-in", re.compile(r"\b(?:nut|peanut|almond|cashew) butter\b", re.IGNORECASE)),
    ("mix-in", re.compile(r"\b(?:hemp|chia|flax) seeds?\b|\bground flax\b", re.IGNORECASE)),
    ("topping", re.compile(r"\bcacao nibs?\b|\bgranola\b|\bcoconut flakes?\b", re.IGNORECASE)),
)


def ingredient_text(item):
    if isinstance(item, dict):
        return str(item.get("text") or "").strip()
    return str(item or "").strip()


def optional_ingredient_reason(text, recipe_title=None, source=None):
    normalized = ingredient_text(text)
    if not normalized:
        return None
    for reason, pattern in OPTIONAL_INGREDIENT_PATTERNS:
        if pattern.search(normalized):
            return reason
    if _is_smoothie_context(recipe_title=recipe_title, source=source):
        for reason, pattern in SMOOTHIE_MIXIN_PATTERNS:
            if pattern.search(normalized):
                return reason
    return None


def is_optional_ingredient(item, recipe_title=None, source=None):
    if isinstance(item, dict) and item.get("optional") is True:
        return True
    return optional_ingredient_reason(ingredient_text(item), recipe_title=recipe_title, source=source) is not None


def normalize_ingredient_item(item, recipe_title=None, source=None):
    text = ingredient_text(item)
    reason = optional_ingredient_reason(text, recipe_title=recipe_title, source=source)
    optional = reason is not None or (isinstance(item, dict) and item.get("optional") is True)
    normalized = {"text": text, "optional": optional}
    if reason:
        normalized["reason"] = reason
    elif isinstance(item, dict) and item.get("reason"):
        normalized["reason"] = str(item.get("reason"))
    return normalized


def required_ingredient_texts(ingredients, recipe_title=None, source=None):
    return [
        text
        for text in (
            ingredient_text(item)
            for item in ingredients
            if not is_optional_ingredient(item, recipe_title=recipe_title, source=source)
        )
        if text
    ]


def _is_smoothie_context(recipe_title=None, source=None):
    parts = [recipe_title or ""]
    if isinstance(source, dict):
        parts.extend(
            [
                source.get("name") or "",
                source.get("url") or "",
                " ".join(source.get("defaultTags") or []),
            ]
        )
    return bool(SMOOTHIE_CONTEXT_PATTERN.search(" ".join(parts)))


def attach_tags(conn, recipe_id, tags):
    for tag in sorted(normalize_tags(tags)):
        row = conn.execute(
            'insert into "Tag" (id, name) values (gen_random_uuid(), %s) on conflict (name) do update set name = excluded.name returning id',
            (tag,),
        ).fetchone()
        conn.execute(
            'insert into "RecipeTag" ("recipeId", "tagId") values (%s, %s) on conflict do nothing',
            (recipe_id, row["id"]),
        )


def auto_tags(source, recipe):
    ingredient_preview = [ingredient_text(item) for item in recipe["ingredients"][:10]]
    text = " ".join([recipe["title"], *ingredient_preview]).lower()
    nutrition = recipe.get("nutrition") or {}
    protein = float(nutrition.get("protein") or 0)
    fiber = float(nutrition.get("fiber") or 0)
    tags = {"scraped"}
    if "protein" in text or protein >= 30:
        tags.add("high-protein")
    if fiber >= 8:
        tags.add("high-fiber")
    if "creami" in text:
        tags.add("ninja-creami")
    if "meal prep" in text:
        tags.add("meal-prep")
    return tags


def decide_status(nutrition, settings):
    if not nutrition:
        return "pending", "nutrition missing"
    protein = float(nutrition.get("protein") or 0)
    fiber = float(nutrition.get("fiber") or 0)
    if protein >= settings["protein_g"] or fiber >= settings["fiber_g"]:
        return "approved", None
    return "pending", f"protein: {protein:g}g below {settings['protein_g']:g}g; fiber: {fiber:g}g below {settings['fiber_g']:g}g"


def exists(conn, url):
    canonical = _canonical_key(url)
    return bool(
        conn.execute(
            """
            select 1 from "Recipe"
            where regexp_replace(
              regexp_replace(
                regexp_replace("sourceUrl", '[?#].*$', ''),
                '/$',
                ''
              ),
              '^https?://(www\\.)?',
              ''
            ) = %s
            """,
            (canonical,),
        ).fetchone()
    )


def _unique_recipe_links(links, source=None):
    normalized = []
    for link in links:
        url = _normalize_url(link)
        if url and (_looks_like_recipe_url(url) or (source and _is_direct_source_url(url, source))):
            normalized.append(url)
    return list(dict.fromkeys(normalized))


def candidate_allowed_for_source(url, source):
    normalized = _normalize_url(url)
    if not normalized:
        return False, "invalid url"
    if _is_direct_source_url(normalized, source):
        if _looks_like_index_url(normalized):
            return False, "source url is index/category/search page"
        return True, None

    intent = _source_intent(source)
    if not intent:
        return True, None

    lowered = _candidate_text(normalized)
    if any(term in lowered for term in _generic_index_terms()):
        return False, "index/category/roundup candidate"

    matched, reason = _matches_source_intent(lowered, intent)
    return (True, None) if matched else (False, reason)


def _source_intent(source):
    tokens = _source_tokens(source)
    intent = []
    if "ninja" in tokens or "creami" in tokens or "ninja-creami" in tokens or "ninja_creami" in tokens:
        intent.append(("ninja-creami", ("ninja", "creami")))
    if "smoothie-bowl" in tokens or "smoothie_bowl" in tokens or ("smoothie" in tokens and "bowl" in tokens):
        intent.append(("smoothie-bowl", ("smoothie", "bowl")))
    elif "smoothie" in tokens:
        intent.append(("smoothie", ("smoothie",)))
    if "protein" in tokens or "high-protein" in tokens:
        intent.append(("protein", ("protein", "high-protein")))
    return intent


def _source_tokens(source):
    text = " ".join(
        [
            source.get("name") or "",
            source.get("url") or "",
            " ".join(normalize_tags(source.get("defaultTags"))),
        ]
    ).lower()
    return set(re.findall(r"[a-z0-9]+(?:[-_][a-z0-9]+)?", text.replace("+", " ")))


def _candidate_text(url):
    parts = urlsplit(url)
    slug = parts.path.lower().replace("/", " ").replace("-", " ").replace("_", " ")
    return f"{parts.netloc.lower()} {slug}"


def _matches_source_intent(text, intents):
    for label, terms in intents:
        if label == "protein":
            if any(term in text for term in terms):
                return True, None
            continue
        if all(term in text for term in terms):
            return True, None
    labels = ", ".join(label for label, _terms in intents)
    return False, f"does not match source intent: {labels}"


def _direct_source_candidate(source):
    url = _normalize_url(source.get("url"))
    if not url or _looks_like_index_url(url):
        return None
    return url


def _is_direct_source_url(url, source):
    source_url = _normalize_url(source.get("url"))
    return bool(source_url and _canonical_key(url) == _canonical_key(source_url))


def _looks_like_index_url(url):
    lowered = url.lower()
    path = urlsplit(lowered).path.rstrip("/") or "/"
    if path == "/":
        return True
    if any(part in lowered for part in ("/category/", "/tag/", "/author/", "/page/", "/search/", "?s=")):
        return True
    return _looks_like_roundup_url(lowered)


def _generic_index_terms():
    return (
        " category ",
        " tag ",
        " recipe index ",
        " recipes ",
        " roundup ",
        " collection ",
        " meal plan ",
    )


def _debug_candidate(message):
    if DRY_RUN or VERBOSE:
        print(message)


def _parse_error_reason(error):
    text = str(error).strip()
    lowered = text.lower()
    if "schema" in lowered and ("not found" in lowered or "no" in lowered):
        return "No Recipe Schema found"
    if "could not find" in lowered and "recipe" in lowered:
        return "No Recipe Schema found"
    return text or error.__class__.__name__


def _normalize_url(url):
    if not url:
        return None
    parts = urlsplit(url.split("#", 1)[0])
    if parts.scheme not in {"http", "https"} or not parts.netloc:
        return None
    query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key.lower() not in TRACKING_PARAMS and not key.lower().startswith("utm_")
    ]
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme, parts.netloc.lower(), path, urlencode(query), ""))


def _canonical_key(url):
    normalized = _normalize_url(url) or url
    return re.sub(r"^https?://(www\.)?", "", normalized).rstrip("/")


def _site_root(url):
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, "/", "", ""))


def _looks_like_recipe_url(url):
    lowered = url.lower()
    if _is_media_url(lowered):
        return False
    if any(part in lowered for part in ("/category/", "/tag/", "/author/", "/page/", "/wp-json/", "/about", "/privacy")):
        return False
    if _looks_like_roundup_url(lowered):
        return False
    return any(word in lowered for word in ("recipe", "meal", "dinner", "breakfast", "lunch", "air-fryer", "instant-pot"))


def _looks_like_roundup_url(lowered):
    path = urlsplit(lowered).path.rstrip("/")
    slug = path.rsplit("/", 1)[-1]
    if slug in {"recipes", "recipe-index"}:
        return True
    roundup_terms = (
        "best-",
        "easy-dinner-recipes",
        "high-fiber-breakfast-ideas",
        "meal-plan",
        "popular-recipes",
        "recipe-roundup",
        "recipes-for",
        "roundup",
        "things-to-make",
    )
    return slug.endswith("-recipes") or any(term in slug for term in roundup_terms)


def _is_media_url(url):
    lowered = url.lower()
    if any(part in lowered for part in ("/wp-content/uploads/", "attachment-sitemap", "image-sitemap", "post_tag-sitemap", "category-sitemap")):
        return True
    return bool(re.search(r"\.(?:avif|gif|jpe?g|png|webp|svg|pdf)(?:$|[?#])", lowered))


def _servings(scraper):
    try:
        value = scraper.yields()
    except Exception:
        return None
    if not value:
        return None
    match = re.search(r"\d+", str(value))
    return int(match.group(0)) if match else None


def _minutes(scraper, method):
    try:
        value = getattr(scraper, method)()
    except Exception:
        return None
    if isinstance(value, int):
        return value
    text = str(value or "")
    hours = re.search(r"(\d+)\s*(?:hour|hr|h)", text)
    minutes = re.search(r"(\d+)\s*(?:minute|min|m)", text)
    total = 0
    if hours:
        total += int(hours.group(1)) * 60
    if minutes:
        total += int(minutes.group(1))
    return total if total > 0 else None


def _description(scraper):
    try:
        description = scraper.description()
    except Exception:
        return None
    return description[:1000] if description else None


def _image(scraper):
    try:
        image = scraper.image()
    except Exception:
        return None
    return image or None


def _meta_image(soup, base_url):
    selectors = [
        ("property", "og:image:secure_url"),
        ("property", "og:image"),
        ("name", "twitter:image"),
    ]
    for attr, value in selectors:
        tag = soup.find("meta", attrs={attr: value})
        content = tag.get("content") if tag else None
        if content:
            return urljoin(base_url, content)
    return None


def _split_instructions(value):
    if not value:
        return []
    return [step.strip() for step in re.split(r"(?:\n+|\.\s+)", value) if len(step.strip()) > 12]


if __name__ == "__main__":
    main()
