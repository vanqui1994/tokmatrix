// Variant THAM CHIẾU của Phase 0 (status "reference", không bao giờ gán cho account): cùng renderer với
// mystery/reference-dossier nhưng giữ trục chép của mystery/case-file — test dùng nó để kiểm cơ chế "reference"
// (chỉ dùng được với MATRIX_ALLOW_REFERENCE_VARIANTS=1, cặp trùng trục chỉ là cảnh báo).
import dossier from "./reference-dossier.mjs";

export default {
  ...dossier,
  id: "mystery/phase0-reference",
  name_vi: "Hồ sơ tham chiếu (Phase 0)",
  status: "reference",
  compatibility: { ...dossier.compatibility, countries: ["en", "de", "ja", "ko"] }, // test "không hỗ trợ vi" dựa vào đây
  visualProfile: {
    ...dossier.visualProfile,
    fingerprintAxes: {
      composition: "folder_card", textPlacement: "bottom", background: "wood_paper",
      transition: "folder_flip", imageMotion: "ken_burns_slow", typography: "typewriter",
    },
  },
};
