// Variant của engine "survival" — agent sở hữu engine này thêm variant vào mảng dưới (không sửa file core).
// Hợp đồng: ../schema.mjs (validateVariant) và docs/MATRIX_VARIANT_SYSTEM_V2.md mục 6.
// + survival/original: giao diện gốc của engines/survival.mjs dựng lại bằng kit.
// + survival/mr-incredible: meme "Mr. Incredible Becoming Uncanny" — OPT-IN (autoAssign: false), chỉ khi kênh ghi rõ variant_id.
import mrIncredible from "./mr-incredible.mjs";
import original from "./original.mjs";
import variants from "./variants.mjs";

export default [...variants, original, mrIncredible];
