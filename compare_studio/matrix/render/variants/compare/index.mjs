// Variant của engine "compare" — agent sở hữu engine này thêm variant vào mảng dưới (không sửa file core).
// Hợp đồng: ../schema.mjs (validateVariant) và docs/MATRIX_VARIANT_SYSTEM_V2.md mục 6.
// 7 base variant (Phase 4, model/view tách: ./common.mjs là mô hình dữ liệu dùng chung, mỗi file một giao diện).
import boxingRing from "./boxing.mjs";
import cardGame from "./cards.mjs";
import courtroom from "./court.mjs";
import raceTrack from "./race.mjs";
import scaleBalance from "./scale.mjs";
import splitScreen from "./split.mjs";
import tierDuel from "./duel.mjs";

export default [boxingRing, scaleBalance, splitScreen, cardGame, raceTrack, courtroom, tierDuel];
