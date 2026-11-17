# Artwork and credits

I made the artwork for this marketplace specifically for the project. The game covers, titles and products are fictional; none of the images are official artwork for a commercial game.

## Game covers

The 16 covers in `web/public/images/covers/` were generated on 14 November 2026 using OpenAI's image-generation tool, with a separate original prompt for each game. No third-party photos, game covers, logos or reference images were used.

The [artwork manifest](catalog-covers.json) contains the prompts, file paths, sizes, dimensions and SHA-256 checksums. Each original 3:4 PNG was exported as a 432 × 576 WebP image. The original PNG files remain in ignored local storage; the repository includes everything needed to display the finished covers.

Seed `db/seeds/002_catalog_artwork.sql` assigns the covers to the original catalog entries without changing inventory, offers or orders. React reads the image URL from the API instead of mapping game titles to files.

## Homepage illustration

The main homepage banner uses an original, hand-authored 1600 × 900 SVG: `web/public/images/banners/discover-world.svg`. It shows a fantasy portal against mountains and stars, without borrowed artwork or external assets.

Seed `db/seeds/003_home_banner.sql` attaches the illustration to the original banner and links it to the catalog. The image is decorative; its heading and description come from PostgreSQL through the API.

Artwork is displayed with reserved space, lazy loading where appropriate, and a fallback if an image cannot load.
