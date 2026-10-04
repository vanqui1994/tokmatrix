"""Naming and metadata registry for vector characters.

Labels in 4 languages: de, en, ko, ja (no Vietnamese).
Markets: de, us, kr, jp (never contains 'vi').
Vietnamese characters (with conical hats, buffalo) have locale: 'vi', archived: True, markets: [].
"""

from typing import Dict, Any, Optional, Tuple, List

# Character metadata catalog.
# Key is the canonical character ID.
CHARACTER_METADATA: Dict[str, Dict[str, Any]] = {
    # ---- Chibi Human Roles (Universal / Science / Space / Ocean) ----
    "astronaut_boy": {
        "label": {"de": "Kleiner Astronaut", "en": "Kid Astronaut", "ko": "어린이 우주비행사", "ja": "ちびっこ宇宙飛行士"},
        "rig": "chibi_boy", "outfit": "astronaut", "role": "hero", "height": 200,
        "props": ["moon_footprint", "seismometer"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["space", "science", "us_culture"], "voice_role": "child", "archived": False,
    },
    "diver_boy": {
        "label": {"de": "Kleiner Taucher", "en": "Kid Diver", "ko": "어린이 잠수부", "ja": "ちびっこダイバー"},
        "rig": "chibi_boy", "outfit": "diver", "role": "hero", "height": 200,
        "props": ["rescue_buoy", "magnifier"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["ocean", "science", "nature"], "voice_role": "child", "archived": False,
    },
    "diver_girl": {
        "label": {"de": "Kleine Taucherin", "en": "Girl Diver", "ko": "소녀 잠수부", "ja": "女の子ダイバー"},
        "rig": "chibi_girl", "outfit": "diver", "role": "hero", "height": 200,
        "props": ["magnifier"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["ocean", "science", "nature"], "voice_role": "child", "archived": False,
    },
    "scientist_girl": {
        "label": {"de": "Kleine Forscherin", "en": "Girl Scientist", "ko": "소녀 과학자", "ja": "女の子科学者"},
        "rig": "chibi_girl", "outfit": "scientist", "role": "hero", "height": 200,
        "props": ["telescope", "magnifier"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["science", "space", "nature"], "voice_role": "child", "archived": False,
    },
    "paleontologist_boy": {
        "label": {"de": "Kleiner Paläontologe", "en": "Kid Paleontologist", "ko": "어린이 고생물학자", "ja": "ちびっこ古生物学者"},
        "rig": "chibi_boy", "outfit": "paleontologist", "role": "hero", "height": 200,
        "props": ["shovel", "paint_brush"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["history", "science"], "voice_role": "child", "archived": False,
    },
    "inventor_boy": {
        "label": {"de": "Kleiner Erfinder", "en": "Kid Inventor", "ko": "어린이 발명가", "ja": "ちびっこ発明家"},
        "rig": "chibi_boy", "outfit": "inventor_1900", "role": "hero", "height": 200,
        "props": ["hammer", "early_bulb"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["inventions", "history", "science"], "voice_role": "child", "archived": False,
    },
    "printer_boy": {
        "label": {"de": "Kleiner Drucker", "en": "Kid Printer", "ko": "어린이 인쇄공", "ja": "ちびっこ印刷工"},
        "rig": "chibi_boy", "outfit": "printer_1450", "role": "hero", "height": 200,
        "props": ["movable_type_tray"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["inventions", "history"], "voice_role": "child", "archived": False,
    },
    "aviator_kid": {
        "label": {"de": "Kleiner Flieger", "en": "Kid Aviator", "ko": "어린이 비행사", "ja": "ちびっこ飛行士"},
        "rig": "chibi_kid", "outfit": "aviator_1903", "role": "hero", "height": 200,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["inventions", "history"], "voice_role": "child", "archived": False,
    },
    "knight_boy": {
        "label": {"de": "Kleiner Ritter", "en": "Kid Knight", "ko": "어린이 기사", "ja": "ちびっこ騎士"},
        "rig": "chibi_boy", "outfit": "knight", "role": "hero", "height": 200,
        "props": ["toy_sword", "wooden_shield"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["history", "medieval"], "voice_role": "child", "archived": False,
    },
    "viking_boy": {
        "label": {"de": "Kleiner Wikinger", "en": "Kid Viking", "ko": "어린이 바이킹", "ja": "ちびっこバイキング"},
        "rig": "chibi_boy", "outfit": "viking", "role": "hero", "height": 200,
        "props": ["star_compass_viking"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["history", "medieval"], "voice_role": "child", "archived": False,
    },
    "blacksmith_boy": {
        "label": {"de": "Kleiner Schmied", "en": "Kid Blacksmith", "ko": "어린이 대장장이", "ja": "ちびっこ鍛冶屋"},
        "rig": "chibi_boy", "outfit": "medieval_villager", "role": "hero", "height": 200,
        "props": ["hammer", "horseshoe"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["history", "medieval"], "voice_role": "child", "archived": False,
    },
    "stone_age_kid": {
        "label": {"de": "Steinzeit-Kind", "en": "Stone Age Kid", "ko": "석기시대 어린이", "ja": "石器時代の子ども"},
        "rig": "chibi_kid", "outfit": "stone_age", "role": "hero", "height": 200,
        "props": ["laurel_torch"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["history", "ancient"], "voice_role": "child", "archived": False,
    },
    "egypt_worker_boy": {
        "label": {"de": "Kleiner ägyptischer Baumeister", "en": "Kid Egyptian Builder", "ko": "이집트 건축 어린이", "ja": "エジプトの建設の子ども"},
        "rig": "chibi_boy", "outfit": "egypt_worker", "role": "hero", "height": 200,
        "props": ["papyrus_roll"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["history", "ancient"], "voice_role": "child", "archived": False,
    },
    "roman_boy": {
        "label": {"de": "Römischer Junge", "en": "Roman Boy", "ko": "로마 소년", "ja": "古代ローマの少年"},
        "rig": "chibi_boy", "outfit": "roman_citizen", "role": "hero", "height": 200,
        "props": ["chalkboard_wax_tablet"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["history", "ancient"], "voice_role": "child", "archived": False,
    },
    "greek_boy": {
        "label": {"de": "Griechischer Athlet", "en": "Greek Athlete", "ko": "그리스 선수 소년", "ja": "古代ギリシャの少年選手"},
        "rig": "chibi_boy", "outfit": "greek_tunic", "role": "hero", "height": 200,
        "props": ["laurel_torch", "discus"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["history", "ancient"], "voice_role": "child", "archived": False,
    },

    # ---- US Culture Characters ----
    "cowboy_boy": {
        "label": {"de": "Kleiner Cowboy", "en": "Kid Cowboy", "ko": "어린이 카우보이", "ja": "ちびっこカウボーイ"},
        "rig": "chibi_boy", "outfit": "cowboy", "role": "hero", "height": 200,
        "props": ["gold_pan"], "markets": ["us"], "locale": "us",
        "topics": ["us_culture", "history"], "voice_role": "child", "archived": False,
    },
    "ghost_kid": {
        "label": {"de": "Geister-Kostüm Kind", "en": "Ghost Costume Kid", "ko": "유령 의상 어린이", "ja": "おばけ仮装の子ども"},
        "rig": "chibi_kid", "outfit": "costume_ghost", "role": "hero", "height": 200,
        "props": ["harvest_basket"], "markets": ["us", "de"], "locale": "us",
        "topics": ["us_culture", "halloween"], "voice_role": "child", "archived": False,
    },
    "pumpkin_kid": {
        "label": {"de": "Kürbis-Kostüm Kind", "en": "Pumpkin Costume Kid", "ko": "호박 의상 어린이", "ja": "かぼちゃ仮装の子ども"},
        "rig": "chibi_kid", "outfit": "costume_pumpkin", "role": "hero", "height": 200,
        "props": ["jack_o_lantern"], "markets": ["us", "de"], "locale": "us",
        "topics": ["us_culture", "halloween"], "voice_role": "child", "archived": False,
    },
    "witch_kid": {
        "label": {"de": "Kleine Hexe", "en": "Kid Witch", "ko": "어린이 마녀", "ja": "ちびっこ魔女"},
        "rig": "chibi_kid", "outfit": "costume_witch", "role": "hero", "height": 200,
        "props": ["harvest_basket"], "markets": ["us", "de"], "locale": "us",
        "topics": ["us_culture", "halloween"], "voice_role": "child", "archived": False,
    },
    "johnny_appleseed": {
        "label": {"de": "Johnny Appleseed", "en": "Johnny Appleseed", "ko": "사과나무 조니", "ja": "ジョニー・アップルシード"},
        "rig": "chibi_teacher", "outfit": "farmer_overalls", "role": "hero", "height": 280,
        "props": ["pot", "sack"], "markets": ["us"], "locale": "us",
        "topics": ["us_culture", "folklore"], "voice_role": "adult", "archived": False,
    },

    # ---- German Culture Characters ----
    "dirndl_girl": {
        "label": {"de": "Mädchen im Dirndl", "en": "Girl in Dirndl", "ko": "딘들 입은 소녀", "ja": "ディアンドルの女の子"},
        "rig": "chibi_girl", "outfit": "dirndl", "role": "hero", "height": 200,
        "props": ["schultuete", "gingerbread"], "markets": ["de"], "locale": "de",
        "topics": ["de_culture"], "voice_role": "child", "archived": False,
    },
    "lederhosen_boy": {
        "label": {"de": "Junge in Lederhosen", "en": "Boy in Lederhosen", "ko": "레더호젠 입은 소년", "ja": "レーダーホーゼンの男の子"},
        "rig": "chibi_boy", "outfit": "lederhosen", "role": "hero", "height": 200,
        "props": ["lantern_star", "schultuete"], "markets": ["de"], "locale": "de",
        "topics": ["de_culture"], "voice_role": "child", "archived": False,
    },

    # ---- Japanese Culture Characters ----
    "jp_schoolboy": {
        "label": {"de": "Japanischer Schüler", "en": "Japanese Schoolboy", "ko": "일본 남학생", "ja": "日本の小学生男子"},
        "rig": "chibi_boy", "outfit": "school_uniform_jp", "role": "hero", "height": 200,
        "props": ["school_bag_randoseru", "broom"], "markets": ["jp"], "locale": "jp",
        "topics": ["jp_culture", "school"], "voice_role": "child", "archived": False,
    },
    "jp_schoolgirl": {
        "label": {"de": "Japanische Schülerin", "en": "Japanese Schoolgirl", "ko": "일본 여학생", "ja": "日本の小学生女子"},
        "rig": "chibi_girl", "outfit": "school_uniform_jp", "role": "hero", "height": 200,
        "props": ["school_bag_randoseru", "broom"], "markets": ["jp"], "locale": "jp",
        "topics": ["jp_culture", "school"], "voice_role": "child", "archived": False,
    },
    "kimono_girl": {
        "label": {"de": "Mädchen im Kimono", "en": "Girl in Kimono", "ko": "기모노 입은 소녀", "ja": "着物の女の子"},
        "rig": "chibi_girl", "outfit": "kimono", "role": "hero", "height": 200,
        "props": ["paper_lantern_jp"], "markets": ["jp"], "locale": "jp",
        "topics": ["jp_culture"], "voice_role": "child", "archived": False,
    },
    "yukata_girl": {
        "label": {"de": "Mädchen im Yukata", "en": "Girl in Yukata", "ko": "유카타 입은 소녀", "ja": "浴衣の女の子"},
        "rig": "chibi_girl", "outfit": "yukata", "role": "hero", "height": 200,
        "props": ["paper_lantern_jp"], "markets": ["jp"], "locale": "jp",
        "topics": ["jp_culture"], "voice_role": "child", "archived": False,
    },
    "momotaro": {
        "label": {"de": "Momotaro", "en": "Momotaro", "ko": "모모타로", "ja": "桃太郎"},
        "rig": "chibi_boy", "outfit": "school_uniform_jp", "role": "hero", "height": 200,
        "props": ["dango"], "markets": ["jp"], "locale": "jp",
        "topics": ["jp_culture", "folklore"], "voice_role": "child", "archived": False,
    },

    # ---- Korean Culture Characters ----
    "hanbok_boy": {
        "label": {"de": "Junge im Hanbok", "en": "Boy in Hanbok", "ko": "한복 입은 소년", "ja": "韓服の男の子"},
        "rig": "chibi_boy", "outfit": "hanbok", "role": "hero", "height": 200,
        "props": ["kite", "yut_sticks"], "markets": ["kr"], "locale": "kr",
        "topics": ["kr_culture"], "voice_role": "child", "archived": False,
    },
    "hanbok_girl": {
        "label": {"de": "Mädchen im Hanbok", "en": "Girl in Hanbok", "ko": "한복 입은 소녀", "ja": "韓服の女の子"},
        "rig": "chibi_girl", "outfit": "hanbok", "role": "hero", "height": 200,
        "props": ["bokjumeoni"], "markets": ["kr"], "locale": "kr",
        "topics": ["kr_culture"], "voice_role": "child", "archived": False,
    },
    "kr_schoolboy": {
        "label": {"de": "Koreanischer Schüler", "en": "Korean Schoolboy", "ko": "한국 남학생", "ja": "韓国の男子生徒"},
        "rig": "chibi_boy", "outfit": "school_uniform_kr", "role": "hero", "height": 200,
        "props": ["bag"], "markets": ["kr"], "locale": "kr",
        "topics": ["kr_culture", "school"], "voice_role": "child", "archived": False,
    },
    "kr_schoolgirl": {
        "label": {"de": "Koreanische Schülerin", "en": "Korean Schoolgirl", "ko": "한국 여학생", "ja": "韓国の女子生徒"},
        "rig": "chibi_girl", "outfit": "school_uniform_kr", "role": "hero", "height": 200,
        "props": ["bag"], "markets": ["kr"], "locale": "kr",
        "topics": ["kr_culture", "school"], "voice_role": "child", "archived": False,
    },
    "joseon_scholar": {
        "label": {"de": "Joseon-Gelehrter", "en": "Joseon Scholar", "ko": "조선 선비", "ja": "朝鮮の学者"},
        "rig": "chibi_teacher", "outfit": "joseon_scholar", "role": "hero", "height": 280,
        "props": ["calligraphy_brush", "hangul_brush_scroll"], "markets": ["kr"], "locale": "kr",
        "topics": ["kr_culture", "history"], "voice_role": "adult", "archived": False,
    },

    # ---- Neutral Farm Characters (Neutralized for Engine) ----
    "farmer_woman_straw": {
        "label": {"de": "Bäuerin (Strohhut)", "en": "Farmer Woman (Straw Hat)", "ko": "여성 농부 (밀짚모자)", "ja": "農婦（麦わら帽子）"},
        "rig": "farmer_woman", "outfit": None, "style": {"hat": "straw"}, "role": "hero", "height": 330,
        "props": ["watering_can", "basket"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["farm", "nature"], "voice_role": "adult", "archived": False,
    },
    "farmer_straw": {
        "label": {"de": "Bauer (Strohhut)", "en": "Farmer (Straw Hat)", "ko": "농부 (밀짚모자)", "ja": "農夫（麦わら帽子）"},
        "rig": "farmer", "outfit": None, "style": {"hat": "straw"}, "role": "hero", "height": 340,
        "props": ["watering_can", "shovel"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["farm", "nature"], "voice_role": "adult", "archived": False,
    },
    "fisherman_cap": {
        "label": {"de": "Fischer (Mütze)", "en": "Fisherman (Cap)", "ko": "어부 (캡모자)", "ja": "漁師（キャップ帽）"},
        "rig": "fisherman", "outfit": None, "style": {"hat": "cap"}, "role": "hero", "height": 340,
        "props": ["fishing_rod", "bucket"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["farm", "ocean", "nature"], "voice_role": "adult", "archived": False,
    },
    "chibi_farmer_neutral": {
        "label": {"de": "Kleiner Jungbauer", "en": "Kid Farmer", "ko": "어린이 농부", "ja": "ちびっこ農家"},
        "rig": "chibi_teacher", "outfit": "farmer_overalls", "role": "hero", "height": 260,
        "props": ["basket", "watering_can"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["farm", "nature"], "voice_role": "child", "archived": False,
    },
    "cow": {
        "label": {"de": "Milchkuh", "en": "Cow", "ko": "젖소", "ja": "乳牛"},
        "rig": "cow", "outfit": None, "role": "animal", "height": 260,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["farm", "animal"], "voice_role": "none", "archived": False,
    },

    # ---- Archived Vietnamese Characters (Not supplied to Engine) ----
    "chibi_farmer_vn": {
        "label": {"de": "Vietnamesischer Jungbauer (Kiebitzhut)", "en": "Vietnamese Kid Farmer (Conical Hat)", "ko": "베트남 어린이 농부 (논라)", "ja": "ベトナムのちびっこ農家（ノンラー）"},
        "rig": "chibi_farmer", "outfit": None, "role": "hero", "height": 260,
        "props": [], "markets": [], "locale": "vi",
        "topics": ["farm"], "voice_role": "child", "archived": True,
    },
    "farmer_woman_conical": {
        "label": {"de": "Vietnamesische Bäuerin (Kiebitzhut)", "en": "Vietnamese Farmer Woman (Conical Hat)", "ko": "베트남 여성 농부 (논라)", "ja": "ベトナムの農婦（ノンラー）"},
        "rig": "farmer_woman", "outfit": None, "style": {"hat": "conical"}, "role": "hero", "height": 330,
        "props": ["sickle", "basket"], "markets": [], "locale": "vi",
        "topics": ["farm"], "voice_role": "adult", "archived": True,
    },
    "fisherman_conical": {
        "label": {"de": "Vietnamesischer Fischer (Kiebitzhut)", "en": "Vietnamese Fisherman (Conical Hat)", "ko": "베트남 어부 (논라)", "ja": "ベトナムの漁師（ノンラー）"},
        "rig": "fisherman", "outfit": None, "style": {"hat": "conical"}, "role": "hero", "height": 340,
        "props": ["fishing_rod"], "markets": [], "locale": "vi",
        "topics": ["farm", "ocean"], "voice_role": "adult", "archived": True,
    },
    "buffalo": {
        "label": {"de": "Wasserbüffel", "en": "Water Buffalo", "ko": "물소", "ja": "水牛"},
        "rig": "buffalo", "outfit": None, "role": "animal", "height": 250,
        "props": [], "markets": [], "locale": "vi",
        "topics": ["farm", "animal"], "voice_role": "none", "archived": True,
    },

    # ---- Medical and Healthcare Roles ----
    "chibi_doctor": {
        "label": {"de": "Kinderarzt", "en": "Kid Doctor", "ko": "어린이 의사", "ja": "ちびっこお医者さん"},
        "rig": "chibi_doctor", "outfit": None, "role": "hero", "height": 360,
        "props": ["thermometer", "stethoscope", "syringe"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["health", "science"], "voice_role": "adult", "archived": False,
    },
    "chibi_nurse": {
        "label": {"de": "Krankenpflegerin", "en": "Kid Nurse", "ko": "어린이 간호사", "ja": "ちびっこ看護師"},
        "rig": "chibi_nurse", "outfit": None, "role": "sidekick", "height": 320,
        "props": ["band_aid", "rinse_basin"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["health", "science"], "voice_role": "adult", "archived": False,
    },
    "chibi_patient": {
        "label": {"de": "Kleiner Patient", "en": "Kid Patient", "ko": "어린이 환자", "ja": "ちびっこ患者さん"},
        "rig": "chibi_patient", "outfit": None, "role": "hero", "height": 310,
        "props": ["towel"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["health"], "voice_role": "child", "archived": False,
    },
    "chibi_dentist": {
        "label": {"de": "Zahnarzt", "en": "Kid Dentist", "ko": "어린이 치과의사", "ja": "ちびっこ歯医者さん"},
        "rig": "chibi_dentist", "outfit": None, "role": "hero", "height": 340,
        "props": ["toothbrush", "rinse_basin"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["health"], "voice_role": "adult", "archived": False,
    },
    "chibi_grandpa": {
        "label": {"de": "Opa", "en": "Grandpa", "ko": "할아버지", "ja": "おじいさん"},
        "rig": "chibi_grandpa", "outfit": None, "role": "sidekick", "height": 330,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["health", "farm"], "voice_role": "elder", "archived": False,
    },
    "chibi_grandma": {
        "label": {"de": "Oma", "en": "Grandma", "ko": "할머니", "ja": "おばあさん"},
        "rig": "chibi_grandma", "outfit": None, "role": "sidekick", "height": 320,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["health", "farm"], "voice_role": "elder", "archived": False,
    },
    "chibi_kid_generic": {
        "label": {"de": "Kind", "en": "Kid", "ko": "어린이", "ja": "子ども"},
        "rig": "chibi_kid", "outfit": None, "role": "hero", "height": 210,
        "props": ["soap"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["health", "safety", "school"], "voice_role": "child", "archived": False,
    },
    "chibi_boy_generic": {
        "label": {"de": "Junge", "en": "Boy", "ko": "소년", "ja": "男の子"},
        "rig": "chibi_boy", "outfit": None, "role": "hero", "height": 210,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["safety", "school"], "voice_role": "child", "archived": False,
    },
    "chibi_girl_generic": {
        "label": {"de": "Mädchen", "en": "Girl", "ko": "소녀", "ja": "女の子"},
        "rig": "chibi_girl", "outfit": None, "role": "hero", "height": 210,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["safety", "school"], "voice_role": "child", "archived": False,
    },

    # ---- Body World Cells & Organs & Microbes ----
    "b_cell_archer": {
        "label": {"de": "B-Zellen-Bogenschütze", "en": "B Cell Archer", "ko": "B세포 궁수", "ja": "B細胞アーチャー"},
        "rig": "b_cell_archer", "outfit": None, "role": "hero", "height": 190,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health", "science"], "voice_role": "child", "archived": False,
    },
    "helper_t_captain": {
        "label": {"de": "Helfer-T-Zelle Hauptmann", "en": "Helper T Cell Captain", "ko": "도움T세포 대장", "ja": "ヘルパーT細胞キャプテン"},
        "rig": "helper_t_captain", "outfit": None, "role": "hero", "height": 210,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health", "science"], "voice_role": "child", "archived": False,
    },
    "killer_t_knight": {
        "label": {"de": "Killer-T-Zelle Ritter", "en": "Killer T Cell Knight", "ko": "세포독성T세포 기사", "ja": "キラーT細胞ナイト"},
        "rig": "killer_t_knight", "outfit": None, "role": "hero", "height": 210,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health", "science"], "voice_role": "child", "archived": False,
    },
    "neutrophil_scout": {
        "label": {"de": "Neutrophil-Späher", "en": "Neutrophil Scout", "ko": "호중구 정찰병", "ja": "好中球スカウト"},
        "rig": "neutrophil_scout", "outfit": None, "role": "hero", "height": 190,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health", "science"], "voice_role": "child", "archived": False,
    },
    "macrophage_chef": {
        "label": {"de": "Makrophagen-Chef", "en": "Macrophage Chef", "ko": "대식세포 요리사", "ja": "マクロファージシェフ"},
        "rig": "macrophage_chef", "outfit": None, "role": "hero", "height": 240,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health", "science"], "voice_role": "adult", "archived": False,
    },
    "platelet_builder": {
        "label": {"de": "Blutplättchen-Baumeister", "en": "Platelet Builder", "ko": "혈소판 건축가", "ja": "血小板ビルダー"},
        "rig": "platelet_builder", "outfit": None, "role": "sidekick", "height": 160,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health", "science"], "voice_role": "child", "archived": False,
    },
    "memory_cell_librarian": {
        "label": {"de": "Gedächtniszellen-Bibliothekar", "en": "Memory Cell Librarian", "ko": "기억세포 사서", "ja": "記憶細胞司書"},
        "rig": "memory_cell_librarian", "outfit": None, "role": "sidekick", "height": 200,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health", "science"], "voice_role": "adult", "archived": False,
    },
    "mast_cell_alarm": {
        "label": {"de": "Mastzellen-Signalgeber", "en": "Mast Cell Alarm", "ko": "비만세포 경보원", "ja": "肥満細胞アラーム"},
        "rig": "mast_cell_alarm", "outfit": None, "role": "sidekick", "height": 200,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health", "science"], "voice_role": "child", "archived": False,
    },
    "cilia_sweeper": {
        "label": {"de": "Flimmerhärchen-Feger", "en": "Cilia Sweeper", "ko": "섬모 청소원", "ja": "線毛スイーパー"},
        "rig": "cilia_sweeper", "outfit": None, "role": "sidekick", "height": 180,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health", "science"], "voice_role": "child", "archived": False,
    },
    "skin_guard": {
        "label": {"de": "Hautbarriere-Wächter", "en": "Skin Guard", "ko": "피부 장벽 수호자", "ja": "皮膚ガード"},
        "rig": "skin_guard", "outfit": None, "role": "sidekick", "height": 210,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health", "science"], "voice_role": "adult", "archived": False,
    },
    "good_bacteria": {
        "label": {"de": "Nützliches Bakterium", "en": "Good Bacteria", "ko": "유익균", "ja": "善玉菌"},
        "rig": "good_bacteria", "outfit": None, "role": "prop_actor", "height": 130,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health"], "voice_role": "child", "archived": False,
    },
    "bacteria_rod": {
        "label": {"de": "Stäbchenbakterium", "en": "Bacteria Rod", "ko": "간균", "ja": "桿菌"},
        "rig": "bacteria_rod", "outfit": None, "role": "prop_actor", "height": 140,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health"], "voice_role": "none", "archived": False,
    },
    "virus_spike": {
        "label": {"de": "Spike-Virus", "en": "Virus Spike", "ko": "바이러스", "ja": "ウイルス"},
        "rig": "virus_spike", "outfit": None, "role": "prop_actor", "height": 140,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health"], "voice_role": "none", "archived": False,
    },
    "tooth_chibi": {
        "label": {"de": "Gesunder Zahn", "en": "Healthy Tooth", "ko": "건강한 치아", "ja": "健康な歯"},
        "rig": "tooth_chibi", "outfit": None, "role": "prop_actor", "height": 220,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health"], "voice_role": "child", "archived": False,
    },
    "heart_chibi": {
        "label": {"de": "Herz", "en": "Heart Chibi", "ko": "심장 친구", "ja": "心臓ちゃん"},
        "rig": "heart_chibi", "outfit": None, "role": "prop_actor", "height": 190,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health"], "voice_role": "child", "archived": False,
    },
    "lungs_chibi": {
        "label": {"de": "Lunge", "en": "Lungs Chibi", "ko": "폐 친구", "ja": "肺ちゃん"},
        "rig": "lungs_chibi", "outfit": None, "role": "prop_actor", "height": 200,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health"], "voice_role": "child", "archived": False,
    },
    "brain_chibi": {
        "label": {"de": "Gehirn", "en": "Brain Chibi", "ko": "뇌 친구", "ja": "脳ちゃん"},
        "rig": "brain_chibi", "outfit": None, "role": "prop_actor", "height": 200,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health"], "voice_role": "child", "archived": False,
    },
    "stomach_chibi": {
        "label": {"de": "Magen", "en": "Stomach Chibi", "ko": "위 친구", "ja": "胃ちゃん"},
        "rig": "stomach_chibi", "outfit": None, "role": "prop_actor", "height": 200,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["body", "health"], "voice_role": "child", "archived": False,
    },

    # ---- Animals, Insects & Fable Characters ----
    "dog": {
        "label": {"de": "Hund", "en": "Dog", "ko": "강아지", "ja": "犬"},
        "rig": "dog", "outfit": None, "role": "animal", "height": 130,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "fables", "de_culture", "jp_culture"], "voice_role": "none", "archived": False,
    },
    "cat": {
        "label": {"de": "Katze", "en": "Cat", "ko": "고양이", "ja": "猫"},
        "rig": "cat", "outfit": None, "role": "animal", "height": 110,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "fables", "de_culture"], "voice_role": "none", "archived": False,
    },
    "horse": {
        "label": {"de": "Pferd", "en": "Horse", "ko": "말", "ja": "馬"},
        "rig": "horse", "outfit": None, "role": "animal", "height": 240,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "history", "medieval", "us_culture"], "voice_role": "none", "archived": False,
    },
    "pig": {
        "label": {"de": "Schwein", "en": "Pig", "ko": "돼지", "ja": "豚"},
        "rig": "pig", "outfit": None, "role": "animal", "height": 170,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "farm"], "voice_role": "none", "archived": False,
    },
    "goat": {
        "label": {"de": "Ziege", "en": "Goat", "ko": "염소", "ja": "ヤギ"},
        "rig": "goat", "outfit": None, "role": "animal", "height": 180,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "farm"], "voice_role": "none", "archived": False,
    },
    "sheep": {
        "label": {"de": "Schaf", "en": "Sheep", "ko": "양", "ja": "羊"},
        "rig": "sheep", "outfit": None, "role": "animal", "height": 180,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "farm"], "voice_role": "none", "archived": False,
    },
    "donkey": {
        "label": {"de": "Esel", "en": "Donkey", "ko": "당나귀", "ja": "ロバ"},
        "rig": "donkey", "outfit": None, "role": "animal", "height": 200,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "fables", "de_culture"], "voice_role": "none", "archived": False,
    },
    "rooster": {
        "label": {"de": "Hahn", "en": "Rooster", "ko": "수탉", "ja": "おんどり"},
        "rig": "rooster", "outfit": None, "role": "animal", "height": 110,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "farm", "de_culture"], "voice_role": "none", "archived": False,
    },
    "chicken": {
        "label": {"de": "Huhn", "en": "Chicken", "ko": "암탉", "ja": "にわとり"},
        "rig": "chicken", "outfit": None, "role": "animal", "height": 170,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "farm"], "voice_role": "none", "archived": False,
    },
    "duck": {
        "label": {"de": "Ente", "en": "Duck", "ko": "오리", "ja": "アヒル"},
        "rig": "duck", "outfit": None, "role": "animal", "height": 160,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "farm"], "voice_role": "none", "archived": False,
    },
    "rabbit": {
        "label": {"de": "Hase", "en": "Hare / Rabbit", "ko": "토끼", "ja": "ウサギ"},
        "rig": "rabbit", "outfit": None, "role": "animal", "height": 120,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "fables"], "voice_role": "none", "archived": False,
    },
    "tortoise": {
        "label": {"de": "Schildkröte", "en": "Tortoise", "ko": "거북이", "ja": "カメ"},
        "rig": "tortoise", "outfit": None, "role": "animal", "height": 110,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "fables"], "voice_role": "none", "archived": False,
    },
    "fox": {
        "label": {"de": "Fuchs", "en": "Fox", "ko": "여우", "ja": "キツネ"},
        "rig": "fox", "outfit": None, "role": "animal", "height": 140,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "fables", "nature"], "voice_role": "none", "archived": False,
    },
    "wolf": {
        "label": {"de": "Wolf", "en": "Wolf", "ko": "늑대", "ja": "オオカミ"},
        "rig": "wolf", "outfit": None, "role": "animal", "height": 160,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "fables", "nature"], "voice_role": "none", "archived": False,
    },
    "deer": {
        "label": {"de": "Reh", "en": "Deer", "ko": "사슴", "ja": "鹿"},
        "rig": "deer", "outfit": None, "role": "animal", "height": 190,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "nature"], "voice_role": "none", "archived": False,
    },
    "owl": {
        "label": {"de": "Eule", "en": "Owl", "ko": "올빼미", "ja": "フクロウ"},
        "rig": "owl", "outfit": None, "role": "animal", "height": 120,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "nature"], "voice_role": "none", "archived": False,
    },
    "stork": {
        "label": {"de": "Storch", "en": "Stork", "ko": "황새", "ja": "コウノトリ"},
        "rig": "stork", "outfit": None, "role": "animal", "height": 180,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "nature"], "voice_role": "none", "archived": False,
    },
    "crane": {
        "label": {"de": "Kranich", "en": "Crane", "ko": "두루미", "ja": "ツル"},
        "rig": "crane", "outfit": None, "role": "animal", "height": 180,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "nature", "kr_culture", "jp_culture"], "voice_role": "none", "archived": False,
    },
    "ant": {
        "label": {"de": "Ameise", "en": "Ant", "ko": "개미", "ja": "アリ"},
        "rig": "ant", "outfit": None, "role": "animal", "height": 80,
        "props": ["bread_loaf"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "fables"], "voice_role": "none", "archived": False,
    },
    "grasshopper": {
        "label": {"de": "Grille / Heuschrecke", "en": "Grasshopper", "ko": "베짱이", "ja": "キリギリス"},
        "rig": "grasshopper", "outfit": None, "role": "animal", "height": 90,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "fables"], "voice_role": "none", "archived": False,
    },
    "mouse": {
        "label": {"de": "Maus", "en": "Mouse", "ko": "생쥐", "ja": "ネズミ"},
        "rig": "mouse", "outfit": None, "role": "animal", "height": 70,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "fables"], "voice_role": "none", "archived": False,
    },
    "city_mouse": {
        "label": {"de": "Stadtmaus", "en": "City Mouse", "ko": "시골쥐와 도시쥐", "ja": "都会のネズミ"},
        "rig": "city_mouse", "outfit": None, "role": "animal", "height": 75,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "fables"], "voice_role": "none", "archived": False,
    },
    "hedgehog": {
        "label": {"de": "Igel", "en": "Hedgehog", "ko": "고슴도치", "ja": "ハリネズミ"},
        "rig": "hedgehog", "outfit": None, "role": "animal", "height": 90,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "nature", "de_culture"], "voice_role": "none", "archived": False,
    },
    "sea_turtle": {
        "label": {"de": "Meeresschildkröte", "en": "Sea Turtle", "ko": "바다거북", "ja": "ウミガメ"},
        "rig": "sea_turtle", "outfit": None, "role": "animal", "height": 160,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["ocean", "animal"], "voice_role": "none", "archived": False,
    },
    "whale": {
        "label": {"de": "Wal", "en": "Whale", "ko": "고래", "ja": "クジラ"},
        "rig": "whale", "outfit": None, "role": "animal", "height": 300,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["ocean", "animal"], "voice_role": "none", "archived": False,
    },
    "seal": {
        "label": {"de": "Seehund", "en": "Seal", "ko": "물개", "ja": "アザラシ"},
        "rig": "seal", "outfit": None, "role": "animal", "height": 150,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["ocean", "animal"], "voice_role": "none", "archived": False,
    },
    "octopus": {
        "label": {"de": "Krake", "en": "Octopus", "ko": "문어", "ja": "タコ"},
        "rig": "octopus", "outfit": None, "role": "animal", "height": 160,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["ocean", "animal"], "voice_role": "none", "archived": False,
    },
    "jellyfish": {
        "label": {"de": "Qualle", "en": "Jellyfish", "ko": "해파리", "ja": "クラゲ"},
        "rig": "jellyfish", "outfit": None, "role": "animal", "height": 140,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["ocean", "animal"], "voice_role": "none", "archived": False,
    },
    "anglerfish": {
        "label": {"de": "Tiefsee-Anglerfisch", "en": "Anglerfish", "ko": "아귀", "ja": "チョウチンアンコウ"},
        "rig": "anglerfish", "outfit": None, "role": "animal", "height": 150,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["ocean", "animal"], "voice_role": "none", "archived": False,
    },
    "cartoon_tiger": {
        "label": {"de": "Freundlicher Tiger", "en": "Cartoon Tiger", "ko": "호돌이 호랑이", "ja": "トラのキャラクター"},
        "rig": "cartoon_tiger", "outfit": None, "role": "animal", "height": 180,
        "props": [], "markets": ["kr"], "locale": "kr",
        "topics": ["kr_culture", "folklore"], "voice_role": "none", "archived": False,
    },
    "camel": {
        "label": {"de": "Kamel", "en": "Camel", "ko": "낙타", "ja": "ラクダ"},
        "rig": "camel", "outfit": None, "role": "animal", "height": 220,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["history", "ancient"], "voice_role": "none", "archived": False,
    },
    "mammoth": {
        "label": {"de": "Mammut", "en": "Mammoth", "ko": "매머드", "ja": "マンモス"},
        "rig": "mammoth", "outfit": None, "role": "animal", "height": 240,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["history", "ancient"], "voice_role": "none", "archived": False,
    },
    "bison": {
        "label": {"de": "Bison", "en": "Bison", "ko": "들소", "ja": "バイソン"},
        "rig": "bison", "outfit": None, "role": "animal", "height": 200,
        "props": [], "markets": ["us"], "locale": "us",
        "topics": ["us_culture", "animal"], "voice_role": "none", "archived": False,
    },
    "bear": {
        "label": {"de": "Bär", "en": "Bear", "ko": "곰", "ja": "クマ"},
        "rig": "bear", "outfit": None, "role": "animal", "height": 210,
        "props": [], "markets": ["us", "de"], "locale": "us",
        "topics": ["us_culture", "animal"], "voice_role": "none", "archived": False,
    },
    "raccoon": {
        "label": {"de": "Waschbär", "en": "Raccoon", "ko": "라쿤", "ja": "アライグマ"},
        "rig": "raccoon", "outfit": None, "role": "animal", "height": 120,
        "props": [], "markets": ["us"], "locale": "us",
        "topics": ["us_culture", "animal"], "voice_role": "none", "archived": False,
    },
    "prairie_dog": {
        "label": {"de": "Präriehund", "en": "Prairie Dog", "ko": "프레리도그", "ja": "プレーリードッグ"},
        "rig": "prairie_dog", "outfit": None, "role": "animal", "height": 90,
        "props": [], "markets": ["us"], "locale": "us",
        "topics": ["us_culture", "animal"], "voice_role": "none", "archived": False,
    },
    "salmon": {
        "label": {"de": "Lachs", "en": "Salmon", "ko": "연어", "ja": "サケ"},
        "rig": "salmon", "outfit": None, "role": "animal", "height": 90,
        "props": [], "markets": ["us", "de", "jp"], "locale": "neutral",
        "topics": ["ocean", "animal"], "voice_role": "none", "archived": False,
    },
    "tanuki": {
        "label": {"de": "Tanuki (Marderhund)", "en": "Tanuki (Raccoon Dog)", "ko": "너구리 (타누키)", "ja": "タヌキ"},
        "rig": "tanuki", "outfit": None, "role": "animal", "height": 130,
        "props": [], "markets": ["jp"], "locale": "jp",
        "topics": ["jp_culture", "animal"], "voice_role": "none", "archived": False,
    },
    "snow_monkey": {
        "label": {"de": "Schneeaffe", "en": "Snow Monkey", "ko": "일본원숭이", "ja": "ニホンザル"},
        "rig": "snow_monkey", "outfit": None, "role": "animal", "height": 150,
        "props": [], "markets": ["jp"], "locale": "jp",
        "topics": ["jp_culture", "animal"], "voice_role": "none", "archived": False,
    },
    "pheasant": {
        "label": {"de": "Fasan", "en": "Pheasant", "ko": "꿩", "ja": "キジ"},
        "rig": "pheasant", "outfit": None, "role": "animal", "height": 120,
        "props": [], "markets": ["jp"], "locale": "jp",
        "topics": ["jp_culture", "animal"], "voice_role": "none", "archived": False,
    },
    "koi": {
        "label": {"de": "Koi-Karpfen", "en": "Koi Fish", "ko": "잉어 (비단잉어)", "ja": "コイ"},
        "rig": "koi", "outfit": None, "role": "animal", "height": 110,
        "props": [], "markets": ["jp"], "locale": "jp",
        "topics": ["jp_culture", "ocean"], "voice_role": "none", "archived": False,
    },
    "swallow": {
        "label": {"de": "Schwalbe", "en": "Swallow", "ko": "제비", "ja": "ツバメ"},
        "rig": "swallow", "outfit": None, "role": "animal", "height": 90,
        "props": [], "markets": ["kr", "de", "us", "jp"], "locale": "neutral",
        "topics": ["kr_culture", "animal"], "voice_role": "none", "archived": False,
    },
    "magpie": {
        "label": {"de": "Elster", "en": "Magpie", "ko": "까치", "ja": "カササギ"},
        "rig": "magpie", "outfit": None, "role": "animal", "height": 100,
        "props": [], "markets": ["kr", "de", "us", "jp"], "locale": "neutral",
        "topics": ["kr_culture", "animal"], "voice_role": "none", "archived": False,
    },
    "bee": {
        "label": {"de": "Biene", "en": "Bee", "ko": "꿀벌", "ja": "ミツバチ"},
        "rig": "bee", "outfit": None, "role": "animal", "height": 90,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "nature", "farm"], "voice_role": "none", "archived": False,
    },
    "butterfly": {
        "label": {"de": "Schmetterling", "en": "Butterfly", "ko": "나비", "ja": "チョウ"},
        "rig": "butterfly", "outfit": None, "role": "animal", "height": 100,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "nature"], "voice_role": "none", "archived": False,
    },
    "earthworm": {
        "label": {"de": "Regenwurm", "en": "Earthworm", "ko": "지렁이", "ja": "ミミズ"},
        "rig": "earthworm", "outfit": None, "role": "animal", "height": 80,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["animal", "nature", "farm"], "voice_role": "none", "archived": False,
    },

    # ---- Living Vegetable / Fruit / Nature Actors ----
    "radish_actor": {
        "label": {"de": "Riesenrettich", "en": "Giant Radish", "ko": "거대 무", "ja": "おおきな大根"},
        "rig": "radish", "outfit": None, "role": "prop_actor", "height": 240,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["farm", "fables"], "voice_role": "none", "archived": False,
    },
    "watermelon_actor": {
        "label": {"de": "Wassermelone", "en": "Watermelon Character", "ko": "수박 친구", "ja": "すいかちゃん"},
        "rig": "watermelon", "outfit": None, "role": "prop_actor", "height": 220,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["farm"], "voice_role": "child", "archived": False,
    },
    "tomato_actor": {
        "label": {"de": "Tomate", "en": "Tomato Character", "ko": "토마토 친구", "ja": "トマトちゃん"},
        "rig": "tomato", "outfit": None, "role": "prop_actor", "height": 180,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["farm"], "voice_role": "child", "archived": False,
    },
    "apple_actor": {
        "label": {"de": "Apfel", "en": "Apple Character", "ko": "사과 친구", "ja": "りんごちゃん"},
        "rig": "apple", "outfit": None, "role": "prop_actor", "height": 180,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["farm"], "voice_role": "child", "archived": False,
    },
    "sunflower_actor": {
        "label": {"de": "Sonnenblume", "en": "Sunflower Character", "ko": "해바라기 친구", "ja": "ひまわりちゃん"},
        "rig": "sunflower", "outfit": None, "role": "prop_actor", "height": 380,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["farm", "nature"], "voice_role": "none", "archived": False,
    },
    "pumpkin_actor": {
        "label": {"de": "Kürbis", "en": "Pumpkin Character", "ko": "호박 친구", "ja": "カボチャちゃん"},
        "rig": "pumpkin", "outfit": None, "role": "prop_actor", "height": 190,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["farm"], "voice_role": "child", "archived": False,
    },
    "raindrop_chibi": {
        "label": {"de": "Wassertropfen", "en": "Raindrop Chibi", "ko": "빗방울 친구", "ja": "あめつぶちゃん"},
        "rig": "raindrop_chibi", "outfit": None, "role": "prop_actor", "height": 140,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["nature", "science"], "voice_role": "child", "archived": False,
    },

    # ---- Dynamic Set Pieces (With state/actions) ----
    "volcano_set": {
        "label": {"de": "Vulkan", "en": "Volcano", "ko": "화산", "ja": "火山"},
        "rig": "volcano", "outfit": None, "role": "set", "height": 300,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["nature", "science"], "voice_role": "none", "archived": False,
    },
    "cloud_set": {
        "label": {"de": "Wolke", "en": "Cloud", "ko": "구름", "ja": "雲"},
        "rig": "cloud", "outfit": None, "role": "set", "height": 180,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["nature", "science"], "voice_role": "none", "archived": False,
    },
    "rainbow_set": {
        "label": {"de": "Regenbogen", "en": "Rainbow", "ko": "무지개", "ja": "虹"},
        "rig": "rainbow", "outfit": None, "role": "set", "height": 220,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["nature", "science"], "voice_role": "none", "archived": False,
    },
    "coral_reef_set": {
        "label": {"de": "Korallenriff", "en": "Coral Reef", "ko": "산호초", "ja": "サンゴ礁"},
        "rig": "coral", "outfit": None, "role": "set", "height": 220,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["ocean", "nature"], "voice_role": "none", "archived": False,
    },
    "recycling_plant_set": {
        "label": {"de": "Recyclinganlage", "en": "Recycling Plant", "ko": "재활용 센터", "ja": "リサイクル工場"},
        "rig": "recycling_plant", "outfit": None, "role": "set", "height": 280,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["recycling", "science"], "voice_role": "none", "archived": False,
    },
    "garbage_truck_set": {
        "label": {"de": "Müllwagen", "en": "Garbage Truck", "ko": "청소차", "ja": "ゴミ収集車"},
        "rig": "garbage_truck", "outfit": None, "role": "set", "height": 220,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["recycling", "safety"], "voice_role": "none", "archived": False,
    },
    # ---- Apocalypse / Survival Recurring Cast (Phase V) ----
    "mika": {
        "label": {"de": "Mika", "en": "Mika", "ko": "미카", "ja": "ミカ"},
        "rig": "chibi_girl", "outfit": "survivor_jacket", "role": "leader", "height": 230,
        "props": ["walkie_talkie"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["apocalypse", "survival"], "voice_role": "child", "archived": False,
    },
    "leo": {
        "label": {"de": "Leo", "en": "Leo", "ko": "레오", "ja": "レオ"},
        "rig": "chibi_boy", "outfit": "survivor_hoodie", "role": "scout", "height": 230,
        "props": ["flashlight"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["apocalypse", "survival"], "voice_role": "child", "archived": False,
    },
    "dr_hana": {
        "label": {"de": "Dr. Hana", "en": "Dr. Hana", "ko": "하나 박사", "ja": "ハナ博士"},
        "rig": "chibi_teacher", "outfit": "scientist", "role": "scientist", "height": 250,
        "props": ["cure_sprayer"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["apocalypse", "survival", "science"], "voice_role": "adult", "archived": False,
    },
    "grandpa_otto": {
        "label": {"de": "Opa Otto", "en": "Grandpa Otto", "ko": "오토 할아버지", "ja": "オットーおじいさん"},
        "rig": "chibi_grandpa", "outfit": "construction", "role": "handyman", "height": 240,
        "props": ["hammer"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["apocalypse", "survival"], "voice_role": "elder", "archived": False,
    },
    "pip": {
        "label": {"de": "Pip", "en": "Pip", "ko": "핍", "ja": "ピップ"},
        "rig": "chibi_kid", "outfit": "raincoat", "role": "youngest", "height": 210,
        "props": ["hand_crank_radio"], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["apocalypse", "survival"], "voice_role": "child", "archived": False,
    },
    "nora": {
        "label": {"de": "Nora", "en": "Nora", "ko": "노라", "ja": "ノラ"},
        "rig": "chibi_girl", "outfit": "survivor_hoodie_purple", "role": "survivor", "height": 230,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["apocalypse", "survival"], "voice_role": "child", "archived": False,
    },
    "biscuit": {
        "label": {"de": "Biscuit", "en": "Biscuit", "ko": "비스킷", "ja": "ビスケット"},
        "rig": "dog", "outfit": None, "role": "companion", "height": 120,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["survival", "animal"], "voice_role": "none", "archived": False,
    },
    "zombie_walker_a": {
        "label": {"de": "Wandernder Zombie A", "en": "Zombie Walker A", "ko": "좀비 워커 A", "ja": "ゾンビ・ウォーカーA"},
        "rig": "chibi_boy", "outfit": "torn", "role": "crowd", "height": 230,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["apocalypse", "zombie"], "voice_role": "none", "archived": False,
    },
    "zombie_walker_b": {
        "label": {"de": "Wandernder Zombie B", "en": "Zombie Walker B", "ko": "좀비 워커 B", "ja": "ゾンビ・ウォーカーB"},
        "rig": "chibi_girl", "outfit": "torn", "role": "crowd", "height": 230,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["apocalypse", "zombie"], "voice_role": "none", "archived": False,
    },
    "zombie_walker_c": {
        "label": {"de": "Wandernder Zombie C", "en": "Zombie Walker C", "ko": "좀비 워커 C", "ja": "ゾンビ・ウォーカーC"},
        "rig": "chibi_kid", "outfit": "torn", "role": "crowd", "height": 210,
        "props": [], "markets": ["de", "us", "kr", "jp"], "locale": "neutral",
        "topics": ["apocalypse", "zombie"], "voice_role": "none", "archived": False,
    },
}

RECURRING_CAST_IDS = {
    "mika", "leo", "dr_hana", "grandpa_otto", "pip", "nora", "biscuit",
    "zombie_walker_a", "zombie_walker_b", "zombie_walker_c"
}


def resolve_character_id(
    rig: str,
    outfit: Optional[str] = None,
    props: Tuple[str, ...] = (),
    actor_id: Optional[str] = None,
    story_id: Optional[str] = None,
    style: Optional[Dict[str, Any]] = None,
) -> str:
    """Map a character occurrence to a canonical character ID in the library."""
    if actor_id in RECURRING_CAST_IDS:
        return actor_id
    # 1. Exact rig + outfit matching

    if rig == "chibi_boy" and outfit:
        cid = f"{outfit}_boy" if f"{outfit}_boy" in CHARACTER_METADATA else f"chibi_boy_{outfit}"
        if cid in CHARACTER_METADATA:
            return cid
        if outfit == "school_uniform_jp":
            return "jp_schoolboy"
        if outfit == "school_uniform_kr":
            return "kr_schoolboy"
        if outfit == "hanbok":
            return "hanbok_boy"
        if outfit == "cowboy":
            return "cowboy_boy"
        if outfit == "astronaut":
            return "astronaut_boy"
        if outfit == "diver":
            return "diver_boy"
        if outfit == "knight":
            return "knight_boy"
        if outfit == "viking":
            return "viking_boy"
        if outfit == "inventor_1900":
            return "inventor_boy"
        if outfit == "printer_1450":
            return "printer_boy"
        if outfit == "paleontologist":
            return "paleontologist_boy"
        if outfit == "roman_citizen":
            return "roman_boy"
        if outfit == "greek_tunic":
            return "greek_boy"
        if outfit == "egypt_worker":
            return "egypt_worker_boy"
        if outfit == "medieval_villager":
            return "blacksmith_boy"
        if outfit == "lederhosen":
            return "lederhosen_boy"

    if rig == "chibi_girl" and outfit:
        if outfit == "school_uniform_jp":
            return "jp_schoolgirl"
        if outfit == "school_uniform_kr":
            return "kr_schoolgirl"
        if outfit == "hanbok":
            return "hanbok_girl"
        if outfit == "kimono":
            return "kimono_girl"
        if outfit == "yukata":
            return "yukata_girl"
        if outfit == "dirndl":
            return "dirndl_girl"
        if outfit == "diver":
            return "diver_girl"
        if outfit == "scientist":
            return "scientist_girl"
        if outfit == "costume_witch":
            return "witch_kid"

    if rig == "chibi_kid" and outfit:
        if outfit == "costume_ghost":
            return "ghost_kid"
        if outfit == "costume_pumpkin":
            return "pumpkin_kid"
        if outfit == "costume_witch":
            return "witch_kid"
        if outfit == "aviator_1903":
            return "aviator_kid"
        if outfit == "stone_age":
            return "stone_age_kid"

    if rig == "chibi_teacher" and outfit:
        if outfit == "farmer_overalls":
            return "chibi_farmer_neutral"
        if outfit == "joseon_scholar":
            return "joseon_scholar"
        if outfit == "scientist":
            return "scientist_teacher"

    # Specific human adult rigs
    if rig == "farmer_woman":
        hat = (style or {}).get("hat", "conical")
        return "farmer_woman_straw" if hat in ("straw", "cap", "none") else "farmer_woman_conical"

    if rig == "farmer":
        hat = (style or {}).get("hat", "none")
        return "farmer_straw" if hat == "straw" else "farmer_straw"

    if rig == "fisherman":
        hat = (style or {}).get("hat", "conical")
        return "fisherman_cap" if hat in ("cap", "straw", "none") else "fisherman_conical"

    if rig == "chibi_farmer":
        return "chibi_farmer_vn"

    # Animals, organs, cells, direct asset match
    if rig in CHARACTER_METADATA:
        return rig

    # Generic chibis
    if rig == "chibi_kid":
        return "chibi_kid_generic"
    if rig == "chibi_boy":
        return "chibi_boy_generic"
    if rig == "chibi_girl":
        return "chibi_girl_generic"

    # Living plants / fruit actors
    actor_map = {
        "radish": "radish_actor",
        "watermelon": "watermelon_actor",
        "tomato": "tomato_actor",
        "apple": "apple_actor",
        "sunflower": "sunflower_actor",
        "pumpkin": "pumpkin_actor",
        "volcano": "volcano_set",
        "cloud": "cloud_set",
        "rainbow": "rainbow_set",
        "coral": "coral_reef_set",
        "recycling_plant": "recycling_plant_set",
        "garbage_truck": "garbage_truck_set",
    }
    if rig in actor_map:
        return actor_map[rig]

    # Fallback to rig name
    return rig


def get_character_info(char_id: str, rig: Optional[str] = None, outfit: Optional[str] = None) -> Dict[str, Any]:
    """Retrieve metadata dictionary for a character ID, with clean fallback."""
    import copy
    if char_id in CHARACTER_METADATA:
        data = copy.deepcopy(CHARACTER_METADATA[char_id])
        data["id"] = char_id
        return data
    r = rig or char_id
    label_en = r.replace("_", " ").title()
    return {
        "id": char_id,
        "label": {"de": label_en, "en": label_en, "ko": label_en, "ja": label_en},
        "rig": r,
        "outfit": outfit,
        "role": "prop_actor",
        "height": 200,
        "props": [],
        "markets": ["de", "us", "kr", "jp"],
        "locale": "neutral",
        "topics": ["other"],
        "voice_role": "none",
        "archived": False,
    }

