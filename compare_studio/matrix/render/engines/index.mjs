// Engine mở rộng của Matrix native render — hợp đồng module xem README.md.
import chalk from "./chalk.mjs";
import compare from "./compare.mjs";
import glow from "./glow.mjs";
import survival from "./survival.mjs";
import tierlist from "./tierlist.mjs";
import vector from "./vector.mjs";
import wildlife from "./wildlife.mjs";

export const EXTENDED_ENGINES = Object.freeze({ tierlist, survival, chalk, wildlife, compare, vector, glow });

export function extendedEngine(engineType) {
  return Object.prototype.hasOwnProperty.call(EXTENDED_ENGINES, engineType) ? EXTENDED_ENGINES[engineType] : null;
}
