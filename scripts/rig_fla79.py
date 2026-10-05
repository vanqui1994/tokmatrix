#!/usr/bin/env python3
"""Build a reusable articulated rig from the extracted XFL content of FLA 79 (Người đàn ông nông thôn cổ đại 2)."""

from __future__ import annotations

import argparse
import copy
import io
import json
import shutil
import struct
import tempfile
import uuid
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from pathlib import Path


NS = "http://ns.adobe.com/xfl/2008/"
X = f"{{{NS}}}"
ET.register_namespace("", NS)
ET.register_namespace("xsi", "http://www.w3.org/2001/XMLSchema-instance")


@dataclass(frozen=True)
class Matrix:
    a: float = 1.0
    b: float = 0.0
    c: float = 0.0
    d: float = 1.0
    tx: float = 0.0
    ty: float = 0.0


def compose(parent: Matrix, child: Matrix) -> Matrix:
    return Matrix(
        a=parent.a * child.a + parent.c * child.b,
        b=parent.b * child.a + parent.d * child.b,
        c=parent.a * child.c + parent.c * child.d,
        d=parent.b * child.c + parent.d * child.d,
        tx=parent.a * child.tx + parent.c * child.ty + parent.tx,
        ty=parent.b * child.tx + parent.d * child.ty + parent.ty,
    )


def read_matrix(node: ET.Element | None) -> Matrix:
    if node is None:
        return Matrix()
    return Matrix(**{key: float(node.get(key, default)) for key, default in {
        "a": "1", "b": "0", "c": "0", "d": "1", "tx": "0", "ty": "0"
    }.items()})


def clean_number(value: float) -> str:
    if abs(value) < 1e-10:
        return "0"
    return f"{value:.12g}"


def write_matrix(node: ET.Element, value: Matrix) -> None:
    for key in ("a", "b", "c", "d", "tx", "ty"):
        number = getattr(value, key)
        default = 1.0 if key in ("a", "d") else 0.0
        if abs(number - default) < 1e-10:
            node.attrib.pop(key, None)
        else:
            node.set(key, clean_number(number))


def shift_art(element: ET.Element, pivot: tuple[float, float], transform: Matrix | None = None) -> ET.Element:
    result = copy.deepcopy(element)
    matrix_nodes = result.findall(f".//{X}Matrix")
    if matrix_nodes:
        for matrix_node in matrix_nodes:
            matrix = read_matrix(matrix_node)
            if transform is not None:
                matrix = compose(transform, matrix)
            matrix = Matrix(matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx - pivot[0], matrix.ty - pivot[1])
            write_matrix(matrix_node, matrix)
    else:
        # Wrap in a group or apply matrix to instance
        wrapper = ET.Element(X + "DOMGroup")
        members = ET.SubElement(wrapper, X + "members")
        members.append(result)
        matrix = Matrix(tx=-pivot[0], ty=-pivot[1])
        if transform is not None:
            matrix = compose(transform, matrix)
        mat_node = ET.SubElement(ET.SubElement(wrapper, X + "matrix"), X + "Matrix")
        write_matrix(mat_node, matrix)
        return wrapper
    return result


def item_id(name: str) -> str:
    raw = uuid.uuid5(uuid.NAMESPACE_URL, f"tokmatrix:fla79:{name}").hex
    return f"{raw[:8]}-{raw[8:16]}"


def symbol_item(name: str, layers: list[ET.Element]) -> ET.Element:
    root = ET.Element(X + "DOMSymbolItem", {
        "name": name,
        "itemID": item_id(name),
        "symbolType": "graphic",
    })
    timeline = ET.SubElement(ET.SubElement(root, X + "timeline"), X + "DOMTimeline", {"name": name.split("/")[-1]})
    layer_container = ET.SubElement(timeline, X + "layers")
    layer_container.extend(layers)
    return root


def layer(name: str, frames: list[ET.Element]) -> ET.Element:
    node = ET.Element(X + "DOMLayer", {"name": name, "color": "#00AEEF", "autoNamed": "false"})
    container = ET.SubElement(node, X + "frames")
    container.extend(frames)
    return node


def frame(index: int, elements: list[ET.Element], *, duration: int = 1, label: str | None = None) -> ET.Element:
    attrs = {"index": str(index)}
    if duration != 1:
        attrs["duration"] = str(duration)
    if label:
        attrs.update({"name": label, "labelType": "name"})
    node = ET.Element(X + "DOMFrame", attrs)
    element_container = ET.SubElement(node, X + "elements")
    element_container.extend(elements)
    return node


def instance(name: str, *, tx: float = 0, ty: float = 0, duration_loop: str = "single frame") -> ET.Element:
    node = ET.Element(X + "DOMSymbolInstance", {
        "libraryItemName": name,
        "symbolType": "graphic",
        "loop": duration_loop,
    })
    matrix = ET.SubElement(ET.SubElement(node, X + "matrix"), X + "Matrix")
    write_matrix(matrix, Matrix(tx=tx, ty=ty))
    point = ET.SubElement(ET.SubElement(node, X + "transformationPoint"), X + "Point")
    point.set("x", "0")
    point.set("y", "0")
    return node


def add_part(
    work: Path,
    doc_root: ET.Element,
    name: str,
    art: ET.Element,
    pivot: tuple[float, float],
    *,
    transform: Matrix | None = None,
) -> dict:
    full_name = f"RIG/parts/{name}"
    item = symbol_item(full_name, [layer("art", [frame(0, [shift_art(art, pivot, transform)])])])
    relative = Path("RIG") / "parts" / f"{name}.xml"
    target = work / "LIBRARY" / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(item).write(target, encoding="utf-8", xml_declaration=False)
    ET.SubElement(doc_root.find(f"./{X}symbols"), X + "Include", {
        "href": relative.as_posix(),
        "itemIcon": "1",
        "loadImmediate": "false",
        "itemID": item.get("itemID"),
    })
    return {"name": full_name, "pivot": [pivot[0], pivot[1]]}


def action_symbol(
    work: Path,
    doc_root: ET.Element,
    action: str,
    parts: list[dict],
    *,
    duration: int = 1,
    body_symbol: str | None = None,
    body_tx: float = 0,
    body_ty: float = 0,
) -> str:
    name = f"RIG/actions/{action}"
    layers: list[ET.Element] = []
    if body_symbol:
        layers.append(layer("walk_body", [frame(0, [instance(body_symbol, tx=body_tx, ty=body_ty, duration_loop="loop")], duration=duration)]))
    for part in parts:
        px, py = part["pivot"]
        layers.append(layer(part["name"].split("/")[-1], [
            frame(0, [instance(part["name"], tx=px, ty=py)], duration=duration)
        ]))
    item = symbol_item(name, layers)
    relative = Path("RIG") / "actions" / f"{action}.xml"
    target = work / "LIBRARY" / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(item).write(target, encoding="utf-8", xml_declaration=False)
    ET.SubElement(doc_root.find(f"./{X}symbols"), X + "Include", {
        "href": relative.as_posix(), "itemIcon": "1", "loadImmediate": "false", "itemID": item.get("itemID")
    })
    return name


def unpack_fla(fla_path: Path, dest_dir: Path) -> None:
    """Safely unpack an Adobe Animate FLA archive, patching the EOCD header if needed."""
    data = bytearray(fla_path.read_bytes())
    eocd_pos = data.rfind(b"PK\x05\x06")
    cd_start = data.find(b"PK\x01\x02")
    if eocd_pos != -1 and cd_start != -1:
        actual_cd_size = eocd_pos - cd_start
        struct.pack_into("<I", data, eocd_pos + 12, actual_cd_size)
    with zipfile.ZipFile(io.BytesIO(data), "r") as z:
        z.extractall(dest_dir)


def pack(work: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        mime = work / "mimetype"
        if mime.exists():
            archive.write(mime, "mimetype", compress_type=zipfile.ZIP_STORED)
        for path in sorted(work.rglob("*")):
            if path.is_file() and path != mime:
                archive.write(path, path.relative_to(work).as_posix())


def build(extracted: Path, output: Path, manifest_path: Path) -> None:
    work = Path(tempfile.mkdtemp(prefix="fla79-rig-build-"))
    try:
        shutil.copytree(extracted, work, dirs_exist_ok=True)
        doc_path = work / "DOMDocument.xml"
        doc_tree = ET.parse(doc_path)
        doc_root = doc_tree.getroot()

        folders = doc_root.find(f"./{X}folders")
        if folders is None:
            folders = ET.SubElement(doc_root, X + "folders")
        existing_folders = {node.get("name") for node in folders.findall(f"./{X}DOMFolderItem")}
        for folder_name in ("RIG", "RIG/parts", "RIG/parts/shared", "RIG/parts/idle", "RIG/parts/point", "RIG/parts/kneel", "RIG/actions"):
            if folder_name not in existing_folders:
                ET.SubElement(folders, X + "DOMFolderItem", {"name": folder_name, "itemID": item_id(folder_name)})

        master_path = work / "LIBRARY" / "重复项目文件夹" / "元件 1 复制 7.xml"
        master = ET.parse(master_path).getroot()
        source_frames = {
            int(node.get("index", "0")): node
            for node in master.findall(f".//{X}DOMFrame")
        }

        # ---------------------------------------------------------------------
        # 1. SHARED HEAD PARTS (Búi tóc, dải lụa, khuôn mặt, tai)
        # ---------------------------------------------------------------------
        head_combo = ET.parse(work / "LIBRARY" / "元件 1.xml").getroot()
        combo_elements = head_combo.find(f".//{X}DOMFrame/{X}elements")
        body_in_combo = combo_elements.find(f"./{X}DOMSymbolInstance")
        body_matrix = read_matrix(body_in_combo.find(f"./{X}matrix/{X}Matrix"))
        det = body_matrix.a * body_matrix.d - body_matrix.b * body_matrix.c
        combo_to_body = Matrix(
            a=body_matrix.d / det,
            b=-body_matrix.b / det,
            c=-body_matrix.c / det,
            d=body_matrix.a / det,
            tx=(body_matrix.c * body_matrix.ty - body_matrix.d * body_matrix.tx) / det,
            ty=(body_matrix.b * body_matrix.tx - body_matrix.a * body_matrix.ty) / det,
        )
        head_members = list(combo_elements.find(f"./{X}DOMGroup/{X}members"))

        shared_parts: list[dict] = []
        # In FLA 79, head members are:
        # Member 0: bun top knot
        # Member 1: blue ribbons
        # Member 2: head contour / skin
        # Member 3: bun body
        # Member 4: ear
        # Member 5: hair strands / bangs
        head_specs = [
            ("head_skin", 2, (340, 480)),
            ("hair_front", 5, (340, 480)),
            ("ear", 4, (280, 520)),
            ("bun_body", 3, (340, 380)),
            ("bun_top", 0, (340, 340)),
            ("ribbons", 1, (310, 440)),
        ]
        for name, member_index, pivot in head_specs:
            shared_parts.append(add_part(work, doc_root, f"shared/{name}", head_members[member_index], pivot, transform=combo_to_body))

        actions: dict[str, list[dict]] = {}

        # ---------------------------------------------------------------------
        # 2. ACTION: IDLE (Frame 0 in 元件 1 复制 7)
        # ---------------------------------------------------------------------
        idle_elements = list(source_frames[0].find(f"./{X}elements"))
        idle_specs = [
            ("idle/torso", idle_elements[8], (340, 680)),
            ("idle/arm_r", idle_elements[7], (360, 640)),
            ("idle/arm_l", idle_elements[6], (220, 640)),
            ("idle/thigh_r", idle_elements[0], (310, 760)),
            ("idle/shin_r", idle_elements[2], (305, 830)),
            ("idle/foot_r", idle_elements[1], (305, 870)),
            ("idle/thigh_l", idle_elements[3], (310, 760)),
            ("idle/shin_l", idle_elements[5], (305, 830)),
            ("idle/foot_l", idle_elements[4], (305, 870)),
        ]
        actions["idle"] = [add_part(work, doc_root, name, art, pivot) for name, art, pivot in idle_specs] + shared_parts

        # ---------------------------------------------------------------------
        # 3. ACTION: POINT (Frame 18 in 元件 1 复制 7)
        # ---------------------------------------------------------------------
        point_elements = list(source_frames[18].find(f"./{X}elements"))
        point_specs = [
            ("point/torso", point_elements[10], (340, 680)),
            ("point/arm_r_upper", point_elements[1], (150, 50)),
            ("point/arm_r_lower", point_elements[2], (205, 65)),
            ("point/hand_r", point_elements[0], (885, 570)),
            ("point/arm_l", point_elements[3], (230, 660)),
            ("point/thigh_r", point_elements[4], (310, 760)),
            ("point/shin_r", point_elements[6], (305, 830)),
            ("point/foot_r", point_elements[5], (305, 870)),
            ("point/thigh_l", point_elements[7], (310, 760)),
            ("point/shin_l", point_elements[9], (305, 830)),
            ("point/foot_l", point_elements[8], (305, 870)),
        ]
        actions["point"] = [add_part(work, doc_root, name, art, pivot) for name, art, pivot in point_specs] + shared_parts

        # ---------------------------------------------------------------------
        # 4. ACTION: KNEEL / SIT (Frame 43 in 元件 1 复制 7)
        # ---------------------------------------------------------------------
        kneel_elements = list(source_frames[43].find(f"./{X}elements"))
        kneel_specs = [
            ("kneel/torso", kneel_elements[6], (340, 680)),
            ("kneel/arm_r", kneel_elements[4], (280, 640)),
            ("kneel/hand_r", kneel_elements[7], (160, 680)),
            ("kneel/arm_l", kneel_elements[5], (280, 640)),
            ("kneel/hand_l", kneel_elements[9], (160, 680)),
            ("kneel/thigh_r", kneel_elements[0], (310, 760)),
            ("kneel/shin_r", kneel_elements[1], (190, 550)),
            ("kneel/thigh_l", kneel_elements[2], (310, 760)),
            ("kneel/shin_l", kneel_elements[3], (170, 550)),
        ]
        actions["kneel"] = [add_part(work, doc_root, name, art, pivot) for name, art, pivot in kneel_specs] + shared_parts

        # ---------------------------------------------------------------------
        # 5. ACTION SYMBOLS & CONTROLLER
        # ---------------------------------------------------------------------
        walk_symbol = "重复项目文件夹/元件 10 复制 3"
        action_names = {
            "idle": action_symbol(work, doc_root, "idle", actions["idle"]),
            "point": action_symbol(work, doc_root, "point", actions["point"]),
            "kneel": action_symbol(work, doc_root, "kneel", actions["kneel"]),
            "walk": action_symbol(work, doc_root, "walk", shared_parts, duration=28, body_symbol=walk_symbol, body_tx=0, body_ty=0),
        }

        controller_name = "RIG/character_controller"
        controller_frames = [
            frame(0, [instance(action_names["idle"])], duration=30, label="idle"),
            frame(30, [instance(action_names["point"])], duration=30, label="point"),
            frame(60, [instance(action_names["kneel"])], duration=30, label="kneel"),
            frame(90, [instance(action_names["walk"], duration_loop="loop")], duration=28, label="walk"),
        ]
        controller = symbol_item(controller_name, [layer("ACTION_SELECTOR", controller_frames)])
        controller_relative = Path("RIG") / "character_controller.xml"
        ET.ElementTree(controller).write(work / "LIBRARY" / controller_relative, encoding="utf-8", xml_declaration=False)
        ET.SubElement(doc_root.find(f"./{X}symbols"), X + "Include", {
            "href": controller_relative.as_posix(), "itemIcon": "1", "loadImmediate": "false", "itemID": controller.get("itemID")
        })

        main_timeline = doc_root.find(f"./{X}timelines/{X}DOMTimeline")
        main_timeline.set("name", "RIG_PREVIEW")
        main_layers = main_timeline.find(f"./{X}layers")
        preview_instance = instance(controller_name, duration_loop="loop")
        preview_matrix = preview_instance.find(f"./{X}matrix/{X}Matrix")
        write_matrix(preview_matrix, Matrix(a=0.85, d=0.85, tx=640, ty=360))
        main_layers[:] = [layer("RIG_Controller", [frame(0, [preview_instance], duration=118)])]
        doc_root.set("currentTimeline", "0")
        doc_root.set("playOptionsPlayLoop", "true")
        doc_tree.write(doc_path, encoding="utf-8", xml_declaration=False)

        manifest = {
            "source": "79 Người đàn ông nông thôn cổ đại 2.fla",
            "document": {"width": 1280, "height": 720, "fps": 30},
            "controller": controller_name,
            "actions": {
                "idle": {"frames": [0, 29], "symbol": action_names["idle"]},
                "point": {"frames": [30, 59], "symbol": action_names["point"]},
                "kneel": {"frames": [60, 89], "symbol": action_names["kneel"]},
                "walk": {"frames": [90, 117], "symbol": action_names["walk"], "cycle_frames": 28},
            },
            "joint_convention": "Every part symbol has registration origin at its named joint. Instances restore the source pose at the pivot coordinates recorded below.",
            "parts": {action: parts for action, parts in actions.items()},
            "shared_head_parts": shared_parts,
        }
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        pack(work, output)
        print(f"Rigged FLA saved to: {output}")
        print(f"Manifest saved to: {manifest_path}")
    finally:
        shutil.rmtree(work)


def main() -> None:
    parser = argparse.ArgumentParser(description="Rig Adobe Animate FLA character")
    parser.add_argument("fla_file", type=Path, help="Input .fla file or extracted folder")
    parser.add_argument("output", type=Path, help="Output .fla file path")
    parser.add_argument("--manifest", type=Path, required=True, help="Output manifest.json path")
    args = parser.parse_args()

    if args.fla_file.is_file():
        temp_extract = Path(tempfile.mkdtemp(prefix="fla79-extract-"))
        try:
            unpack_fla(args.fla_file, temp_extract)
            build(temp_extract, args.output, args.manifest)
        finally:
            shutil.rmtree(temp_extract)
    else:
        build(args.fla_file, args.output, args.manifest)


if __name__ == "__main__":
    main()
