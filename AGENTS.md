# TemplateAtlas owner preferences

Owner direction, 2026-11-02. Apply to every future topic and imported template.

- Inspect actual source artwork and document contents before writing titles, alt text, introductions or expanded descriptions. Never claim a review based on filenames or package prompts.
- Give each template an accurate, distinct title and a concise introduction. Do not expose repetitive production-family names as individual template names.
- Author `intro` and `description_paragraphs` separately. More must explain the actual subject, what the template contains, how to read or use it, and useful distinctions supported by the file. A list of row counts, dimensions and units alone is insufficient. Do not pad copy or invent differences between shared datasets.
- Keep the short introduction visible in full. More/Less expands the reviewed paragraphs; detail pages show the same paragraphs. Keep search, metadata and alt text consistent through the shared catalog.
- Preserve source bytes, checksums, IDs and URLs. Record source-bound review snapshots in `editorial_review`; replacement of any original or text invalidates its approval. Review approvals are evidence records, not automatic semantic verification. Do not mark unseen images reviewed.
- All imported collections must pass `node scripts/check-imported-editorial.mjs` and the build. Never bypass the shared validation to import generic or unreviewed content. New template renderers must follow the same editorial rules even when they do not use ImportedCollection.
- Reuse shared controls and `TemplateProperties.astro` for consistent icon/text geometry; fix shared styles rather than per-card exceptions. Verify responsive layout and filter/reset/More behavior before publication.
- Publish only when the owner requests publication. Do not rerun the legacy private R134a preparation script over accepted editorial copy.
- For a multipage PDF, Word document, or other downloadable file, use one WebP of the first page as the gallery preview. Verify that it represents the correct first page; retain the complete downloadable file and its original page count. Apply this preference to future TemplateAtlas imports.
