// Variant của engine "newspaper" — agent sở hữu engine này thêm variant vào mảng dưới (không sửa file core).
// Hợp đồng: ../schema.mjs (validateVariant) và docs/MATRIX_VARIANT_SYSTEM_V2.md mục 6.
import variants from "./variants.mjs";
import frontPage from "./front-page.mjs";
import original from "./original.mjs";

export default [...variants, frontPage, original];
