# Catalog artwork

The sixteen fictional-game covers in `web/public/images/covers/` were generated
specifically for this project on 14 November 2026 with the built-in OpenAI
`image_gen` tool, one independent generation per game. No third-party photographs,
game artwork, logos or reference images were used. These are AI-generated demo
illustrations, not official artwork for commercial games.

[catalog-covers.json](catalog-covers.json) records every full prompt, output path,
dimensions, byte size and SHA-256 checksum, plus the original PNG checksum.
Each 3:4 original was exported to a 432×576 WebP at quality 0.82 using Chromium's
high-quality canvas resampling. There was no cropping or creative post-processing.
Original PNGs are retained locally in ignored `.local/artwork-originals/`; clean
clones require only the committed WebP files and never need an image-generation tool.

Seed `002_catalog_artwork.sql` assigns these URLs only to the known demo product IDs
whose cover is still the original placeholder. It leaves customized covers and all
stock, offers and purchases alone. Applied seed `001_demo.sql` stays unchanged.
The React card consumes `coverUrl` from the API without a title-to-asset mapping.

Cards reserve image space, load off-screen covers lazily, and keep meaningful text
when an image fails. The title overlay is decorative duplication of the card's
semantic heading. Its dark gradient remains a failure fallback, not finished artwork.
