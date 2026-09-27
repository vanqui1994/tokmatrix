// Variant của engine "tierlist" — agent sở hữu engine này thêm variant vào mảng dưới (không sửa file core).
// Hợp đồng: ../schema.mjs (validateVariant) và docs/MATRIX_VARIANT_SYSTEM_V2.md mục 6.
import unsolvedCases from "./cabinet.mjs";
import classicRows from "./classic.mjs";
import orbit from "./orbit.mjs";
import podium from "./podium.mjs";
import shelves from "./shelves.mjs";
import pyramid from "./pyramid.mjs";
import weaponRack from "./rack.mjs";
import rankingBoard from "./ranking-board.mjs";

export default [classicRows, pyramid, weaponRack, orbit, podium, shelves, unsolvedCases, rankingBoard];
