// Variant "bộ da" mỗi acc (3 layout, DNA trong creative.skins.<engine>): test riêng ở tests/matrix-variants-skins.test.mjs,
// nên test V2 theo engine (7 base variant, 2 composition, ≥ 4/6 trục) bỏ chúng ra.
export const SKIN_VARIANT_IDS = Object.freeze(["newspaper/front-page", "kinetic/type-poster", "science/explainer-board", "tierlist/ranking-board"]);
export const isSkinVariant = (variant) => SKIN_VARIANT_IDS.includes(variant.id);
