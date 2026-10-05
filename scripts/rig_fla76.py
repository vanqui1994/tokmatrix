#!/usr/bin/env python3
"""Build a reusable articulated rig from the extracted XFL content of FLA 76."""

from __future__ import annotations

import argparse
import copy
import json
import shutil
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


def read_matrix(node: ET.Element) -> Matrix:
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
    for matrix_node in result.findall(f".//{X}Matrix"):
        matrix = read_matrix(matrix_node)
        if transform is not None:
            matrix = compose(transform, matrix)
        matrix = Matrix(matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx - pivot[0], matrix.ty - pivot[1])
        write_matrix(matrix_node, matrix)
    return result


def item_id(name: str) -> str:
    raw = uuid.uuid5(uuid.NAMESPACE_URL, f"tokmatrix:fla76:{name}").hex
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
) -> str:
    name = f"RIG/actions/{action}"
    layers: list[ET.Element] = []
    if body_symbol:
        layers.append(layer("walk_body", [frame(0, [instance(body_symbol, duration_loop="loop")], duration=duration)]))
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
    work = Path(tempfile.mkdtemp(prefix="fla76-rig-build-"))
    try:
        shutil.copytree(extracted, work, dirs_exist_ok=True)
        doc_path = work / "DOMDocument.xml"
        doc_tree = ET.parse(doc_path)
        doc_root = doc_tree.getroot()

        folders = doc_root.find(f"./{X}folders")
        existing_folders = {node.get("name") for node in folders.findall(f"./{X}DOMFolderItem")}
        for folder_name in ("RIG", "RIG/parts", "RIG/actions"):
            if folder_name not in existing_folders:
                ET.SubElement(folders, X + "DOMFolderItem", {"name": folder_name, "itemID": item_id(folder_name)})

        master = ET.parse(work / "LIBRARY" / "重复项目文件夹" / "元件 2 复制 10.xml").getroot()
        source_frames = {
            int(node.get("index", "0")): node
            for node in master.findall(f".//{X}DOMFrame")
        }
        head_combo = ET.parse(work / "LIBRARY" / "元件 1.xml").getroot()
        combo_elements = head_combo.find(f".//{X}DOMFrame/{X}elements")
        body_in_combo = combo_elements.find(f"./{X}DOMSymbolInstance")
        body_matrix = read_matrix(body_in_combo.find(f"./{X}matrix/{X}Matrix"))
        determinant = body_matrix.a * body_matrix.d - body_matrix.b * body_matrix.c
        combo_to_body = Matrix(
            a=body_matrix.d / determinant,
            b=-body_matrix.b / determinant,
            c=-body_matrix.c / determinant,
            d=body_matrix.a / determinant,
            tx=(body_matrix.c * body_matrix.ty - body_matrix.d * body_matrix.tx) / determinant,
            ty=(body_matrix.b * body_matrix.tx - body_matrix.a * body_matrix.ty) / determinant,
        )
        head_members = list(combo_elements.find(f"./{X}DOMGroup/{X}members"))

        shared_parts: list[dict] = []
        head_specs = [
            ("head_skin", 0, (96, 0)),
            ("hair_main", 1, (82, -120)),
            ("ear", 2, (15, -40)),
            ("bun_back", 3, (55, -205)),
            ("bun_front", 4, (55, -205)),
            ("beard", 5, (105, 0)),
        ]
        for name, member_index, pivot in head_specs:
            shared_parts.append(add_part(work, doc_root, f"shared/{name}", head_members[member_index], pivot, transform=combo_to_body))

        actions: dict[str, list[dict]] = {}

        idle_groups = source_frames[45].findall(f"./{X}elements/{X}DOMGroup")
        idle_specs = [
            ("idle/torso", idle_groups[6], (96, 170)),
            ("idle/arm_r_upper", idle_groups[4], (150, 45)),
            ("idle/arm_r_lower", idle_groups[8], (150, 120)),
            ("idle/hand_r", idle_groups[7], (130, 160)),
            ("idle/arm_l_upper", idle_groups[5], (50, 45)),
            ("idle/arm_l_lower", idle_groups[10], (50, 120)),
            ("idle/hand_l", idle_groups[9], (90, 160)),
            ("idle/thigh_r", idle_groups[0], (130, 175)),
            ("idle/shin_r", idle_groups[1].findall(f".//{X}DOMShape")[1], (130, 245)),
            ("idle/foot_r", idle_groups[1].findall(f".//{X}DOMShape")[0], (115, 265)),
            ("idle/thigh_l", idle_groups[2], (65, 175)),
            ("idle/shin_l", idle_groups[3].findall(f".//{X}DOMShape")[1], (75, 245)),
            ("idle/foot_l", idle_groups[3].findall(f".//{X}DOMShape")[0], (90, 268)),
        ]
        actions["idle"] = [add_part(work, doc_root, name, art, pivot) for name, art, pivot in idle_specs] + shared_parts

        point_groups = source_frames[38].findall(f"./{X}elements/{X}DOMGroup")
        hanging = list(point_groups[0].find(f"./{X}members"))
        point_specs = [
            ("point/torso", point_groups[10], (96, 170)),
            ("point/arm_r_upper", point_groups[2], (150, 50)),
            ("point/arm_r_lower", point_groups[3], (190, 60)),
            ("point/hand_r", point_groups[1], (230, 55)),
            ("point/arm_l_upper", hanging[1], (50, 50)),
            ("point/arm_l_lower", hanging[2], (50, 120)),
            ("point/hand_l", hanging[0], (55, 165)),
            ("point/thigh_r", point_groups[4], (125, 175)),
            ("point/shin_r", point_groups[6], (125, 245)),
            ("point/foot_r", point_groups[5], (125, 292)),
            ("point/thigh_l", point_groups[7], (65, 175)),
            ("point/shin_l", point_groups[9], (65, 245)),
            ("point/foot_l", point_groups[8], (65, 298)),
        ]
        actions["point"] = [add_part(work, doc_root, name, art, pivot) for name, art, pivot in point_specs] + shared_parts

        kneel_groups = source_frames[52].findall(f"./{X}elements/{X}DOMGroup")
        kneel_legs = list(kneel_groups[0].find(f"./{X}members"))
        right_lower_shapes = kneel_legs[1].findall(f".//{X}DOMShape")
        left_lower_shapes = kneel_legs[3].findall(f".//{X}DOMShape")
        kneel_specs = [
            ("kneel/torso", kneel_groups[3], (96, 170)),
            ("kneel/arm_r_upper", kneel_groups[1], (150, 45)),
            ("kneel/arm_r_lower", kneel_groups[5], (150, 120)),
            ("kneel/hand_r", kneel_groups[4], (130, 160)),
            ("kneel/arm_l_upper", kneel_groups[2], (50, 45)),
            ("kneel/arm_l_lower", kneel_groups[7], (50, 120)),
            ("kneel/hand_l", kneel_groups[6], (90, 160)),
            ("kneel/thigh_r", kneel_legs[0], (130, 175)),
            ("kneel/shin_r", right_lower_shapes[1], (145, 230)),
            ("kneel/foot_r", right_lower_shapes[0], (175, 270)),
            ("kneel/thigh_l", kneel_legs[2], (65, 175)),
            ("kneel/shin_l", left_lower_shapes[1], (85, 230)),
            ("kneel/foot_l", left_lower_shapes[0], (40, 285)),
        ]
        actions["kneel"] = [add_part(work, doc_root, name, art, pivot) for name, art, pivot in kneel_specs] + shared_parts

        action_names = {
            "idle": action_symbol(work, doc_root, "idle", actions["idle"]),
            "point": action_symbol(work, doc_root, "point", actions["point"]),
            "kneel": action_symbol(work, doc_root, "kneel", actions["kneel"]),
            "walk": action_symbol(work, doc_root, "walk", shared_parts, duration=28, body_symbol="元件 17"),
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
        write_matrix(preview_matrix, Matrix(a=-0.85, d=0.85, tx=720, ty=300))
        main_layers[:] = [layer("RIG_Controller", [frame(0, [preview_instance], duration=118)])]
        doc_root.set("currentTimeline", "0")
        doc_root.set("playOptionsPlayLoop", "true")
        doc_tree.write(doc_path, encoding="utf-8", xml_declaration=False)

        manifest = {
            "source": "76 Nguoi dan ong nong thon co dai.fla",
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
    finally:
        shutil.rmtree(work)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("extracted", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    build(args.extracted, args.output, args.manifest)


if __name__ == "__main__":
    main()
