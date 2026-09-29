// Variant của engine "mystery" — agent sở hữu engine này thêm variant vào mảng dưới (không sửa file core).
// Hợp đồng: ../schema.mjs (validateVariant) và docs/MATRIX_VARIANT_SYSTEM_V2.md mục 6.
import phase0Reference from "./phase0-reference.mjs";
import referenceDossier from "./reference-dossier.mjs";
import variants from "./variants.mjs";

export default [phase0Reference, referenceDossier, ...variants];
