// Variant của engine "science" — agent sở hữu engine này thêm variant vào mảng dưới (không sửa file core).
// Hợp đồng: ../schema.mjs (validateVariant) và docs/MATRIX_VARIANT_SYSTEM_V2.md mục 6.
import variants from "./variants.mjs";
import explainerBoard from "./explainer-board.mjs";
import spacePack from "./space-pack.mjs";

export default [...variants, explainerBoard, ...spacePack];
