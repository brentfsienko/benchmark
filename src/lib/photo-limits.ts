/** Keep total review payload under Vercel's ~4.5MB function body limit. */
export const MAX_PHOTOS_PER_REVIEW = 4;
export const MAX_ORIGINAL_PHOTO_BYTES = 20_000_000;
/** ~750KB data-URL each × 4 ≈ 3MB, leaving headroom for JSON. */
export const MAX_PHOTO_BASE64_CHARS = 750_000;
export const MAX_IMAGE_DIMENSION = 1280;
