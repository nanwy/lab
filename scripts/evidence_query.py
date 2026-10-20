#!/usr/bin/env python3
"""Build and query bounded, lossless views of the reverse-engineering evidence.

The original files remain authoritative. Generated shards are non-executable text
fragments whose byte concatenation must reproduce their source exactly.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_ROOT = REPO_ROOT.parent / "rea-analysis" / "xueyuan"
DEFAULT_OUTPUT = EVIDENCE_ROOT / "query-bundle"
PAGE_MAP = REPO_ROOT / "docs" / "planning" / "page-feature-code-map.json"
SOURCES = {
    "bundle": EVIDENCE_ROOT / "artifact" / "index-DECk1PRe.js",
    "evidence": EVIDENCE_ROOT / "rea-evidence.json",
    "page-map": PAGE_MAP,
    "api": EVIDENCE_ROOT / "api-inventory.json",
    "routes": EVIDENCE_ROOT / "route-inventory-verified.json",
}
CHUNK_SIZE = 65_536
DEFAULT_CONTEXT = 2_048
DEFAULT_MAX_OUTPUT = 8_192
HARD_MAX_OUTPUT = 65_536
MANIFEST_VERSION = 1


class EvidenceError(RuntimeError):
    pass


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def pretty_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def utf16_length(value: str) -> int:
    return len(value.encode("utf-16-le")) // 2


def write_exact(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        handle.write(value)


def relative_path(path: Path, base: Path) -> str:
    return Path(os.path.relpath(path, base)).as_posix()


def source_metadata(name: str, source: Path, output: Path, chunk_size: int) -> dict[str, Any]:
    raw = source.read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise EvidenceError(f"{source} 不是有效 UTF-8：{error}") from error

    shard_dir = output / "raw" / name
    byte_offset = 0
    utf16_offset = 0
    chunks: list[dict[str, Any]] = []
    for index, unicode_start in enumerate(range(0, len(text), chunk_size)):
        part = text[unicode_start : unicode_start + chunk_size]
        encoded = part.encode("utf-8")
        part_utf16 = utf16_length(part)
        shard = shard_dir / f"chunk-{index:04d}.txt"
        write_exact(shard, part)
        chunks.append(
            {
                "path": relative_path(shard, output),
                "sha256": sha256_bytes(encoded),
                "byte_start": byte_offset,
                "byte_end": byte_offset + len(encoded),
                "unicode_start": unicode_start,
                "unicode_end": unicode_start + len(part),
                "utf16_start": utf16_offset,
                "utf16_end": utf16_offset + part_utf16,
            }
        )
        byte_offset += len(encoded)
        utf16_offset += part_utf16

    return {
        "source_path": relative_path(source, output),
        "sha256": sha256_bytes(raw),
        "encoding": "utf-8",
        "bytes": len(raw),
        "unicode_characters": len(text),
        "utf16_code_units": utf16_length(text),
        "final_newline": text.endswith("\n"),
        "chunk_size": chunk_size,
        "chunk_unit": "Unicode code point",
        "chunks": chunks,
    }


def evidence_record_summary(record: dict[str, Any]) -> dict[str, Any]:
    normalized = record.get("normalized_result")
    normalized = normalized if isinstance(normalized, dict) else {}
    graph = normalized.get("graph")
    graph = graph if isinstance(graph, dict) else {}
    semantic = normalized.get("semantic_graph")
    semantic = semantic if isinstance(semantic, dict) else {}
    return {
        "evidence_id": record.get("evidence_id"),
        "evidence_links": record.get("evidence_links", []),
        "parent_evidence_id": normalized.get("parent_evidence_id"),
        "operation": record.get("operation"),
        "predicate_type": record.get("predicate_type"),
        "coverage": normalized.get("coverage", graph.get("coverage")),
        "limitations": record.get("limitations", normalized.get("limitations", [])),
        "unknowns": normalized.get("unknowns", semantic.get("unknowns", [])),
        "graph": {
            "nodes": len(graph.get("nodes", [])),
            "edges": len(graph.get("edges", [])),
            "root_node_ids": graph.get("root_node_ids", []),
        },
        "semantic_graph": {
            "nodes": len(semantic.get("nodes", [])),
            "relations": len(semantic.get("relations", [])),
            "root_node_ids": semantic.get("root_node_ids", []),
        },
    }


def write_semantic_views(output: Path) -> dict[str, int]:
    page_map = json.loads(PAGE_MAP.read_text(encoding="utf-8"))
    api_inventory = json.loads(SOURCES["api"].read_text(encoding="utf-8"))
    evidence = json.loads(SOURCES["evidence"].read_text(encoding="utf-8"))

    view_root = output / "views"
    for feature in page_map["features"]:
        write_exact(view_root / "features" / f"{feature['id']}.json", pretty_json(feature))
    for route in page_map["routes"]:
        write_exact(view_root / "routes" / f"{route['id']}.json", pretty_json(route))
    for story in page_map["stories"]:
        write_exact(view_root / "stories" / f"S{int(story['id']):03d}.json", pretty_json(story))

    metadata = {key: value for key, value in page_map.items() if key not in {"features", "routes", "stories"}}
    write_exact(view_root / "page-map-metadata.json", pretty_json(metadata))
    write_exact(
        view_root / "api-inventory.jsonl",
        "".join(compact_json(entry) + "\n" for entry in api_inventory["entries"]),
    )
    write_exact(
        view_root / "evidence-records.jsonl",
        "".join(compact_json(evidence_record_summary(record)) + "\n" for record in evidence["records"]),
    )

    shared: dict[tuple[str | None, int | None], set[str]] = {}
    symbol_data: dict[tuple[str | None, int | None], dict[str, Any]] = {}
    for feature in page_map["features"]:
        for symbol in feature.get("original_symbols", []):
            key = (symbol.get("symbol"), symbol.get("char_offset"))
            shared.setdefault(key, set()).add(feature["id"])
            symbol_data[key] = symbol
    shared_symbols = [
        {**symbol_data[key], "feature_ids": sorted(feature_ids)}
        for key, feature_ids in shared.items()
        if len(feature_ids) > 1
    ]
    shared_symbols.sort(key=lambda item: (item.get("char_offset") is None, item.get("char_offset") or 0))
    write_exact(view_root / "shared-symbols.json", pretty_json(shared_symbols))

    return {
        "features": len(page_map["features"]),
        "routes": len(page_map["routes"]),
        "stories": len(page_map["stories"]),
        "api_candidates": len(api_inventory["entries"]),
        "evidence_records": len(evidence["records"]),
        "shared_symbols": len(shared_symbols),
    }


def evidence_graph_counts() -> dict[str, dict[str, int]]:
    evidence = json.loads(SOURCES["evidence"].read_text(encoding="utf-8"))
    counts: dict[str, dict[str, int]] = {}
    for record in evidence["records"]:
        normalized = record.get("normalized_result")
        normalized = normalized if isinstance(normalized, dict) else {}
        graph = normalized.get("graph")
        graph = graph if isinstance(graph, dict) else {}
        semantic = normalized.get("semantic_graph")
        semantic = semantic if isinstance(semantic, dict) else {}
        counts[record["evidence_id"]] = {
            "application_nodes": len(graph.get("nodes", [])),
            "application_edges": len(graph.get("edges", [])),
            "semantic_nodes": len(semantic.get("nodes", [])),
            "semantic_relations": len(semantic.get("relations", [])),
        }
    return counts


def generate(output: Path, chunk_size: int, force: bool) -> None:
    missing = [str(path) for path in SOURCES.values() if not path.is_file()]
    if missing:
        raise EvidenceError("缺少源文件：" + ", ".join(missing))
    if chunk_size < 4_096 or chunk_size > 262_144:
        raise EvidenceError("chunk-size 必须在 4096 到 262144 Unicode 字符之间")
    if output.exists() and not force:
        raise EvidenceError(f"输出目录已存在：{output}；确认覆盖派生产物时传 --force")

    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{output.name}-", dir=output.parent))
    try:
        artifacts = {
            name: source_metadata(name, path, staging, chunk_size) for name, path in SOURCES.items()
        }
        counts = write_semantic_views(staging)
        manifest = {
            "version": MANIFEST_VERSION,
            "authoritative_sources": True,
            "generated_views_are_executable": False,
            "offset_contract": {
                "default": "zero-based Unicode code point",
                "supported": ["unicode", "utf16", "byte"],
            },
            "artifacts": artifacts,
            "counts": counts,
            "evidence_graph_counts": evidence_graph_counts(),
        }
        write_exact(staging / "manifest.json", pretty_json(manifest))
        if output.exists():
            shutil.rmtree(output)
        staging.rename(output)
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise

    verify(output, run_node_check=True)
    print(f"已生成 {output}")


def load_manifest(output: Path) -> dict[str, Any]:
    path = output / "manifest.json"
    if not path.is_file():
        raise EvidenceError(f"缺少 manifest：{path}；先运行 generate")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("version") != MANIFEST_VERSION:
        raise EvidenceError(f"不支持的 manifest 版本：{manifest.get('version')}")
    return manifest


def validate_artifact(output: Path, name: str, artifact: dict[str, Any]) -> None:
    source = (output / artifact["source_path"]).resolve()
    if not source.is_file():
        raise EvidenceError(f"{name} 源文件不存在：{source}")
    raw = source.read_bytes()
    text = raw.decode("utf-8")
    expected = {
        "sha256": sha256_bytes(raw),
        "bytes": len(raw),
        "unicode_characters": len(text),
        "utf16_code_units": utf16_length(text),
        "final_newline": text.endswith("\n"),
    }
    for key, value in expected.items():
        if artifact.get(key) != value:
            raise EvidenceError(f"{name} 的 {key} 已漂移：manifest={artifact.get(key)!r}, source={value!r}")

    byte_cursor = unicode_cursor = utf16_cursor = 0
    digest = hashlib.sha256()
    for index, chunk in enumerate(artifact["chunks"]):
        shard = output / chunk["path"]
        raw_part = shard.read_bytes()
        part = raw_part.decode("utf-8")
        checks = {
            "byte_start": byte_cursor,
            "byte_end": byte_cursor + len(raw_part),
            "unicode_start": unicode_cursor,
            "unicode_end": unicode_cursor + len(part),
            "utf16_start": utf16_cursor,
            "utf16_end": utf16_cursor + utf16_length(part),
            "sha256": sha256_bytes(raw_part),
        }
        for key, value in checks.items():
            if chunk.get(key) != value:
                raise EvidenceError(f"{name} chunk {index} 的 {key} 无效")
        digest.update(raw_part)
        byte_cursor += len(raw_part)
        unicode_cursor += len(part)
        utf16_cursor += utf16_length(part)
    if (byte_cursor, unicode_cursor, utf16_cursor) != (
        artifact["bytes"],
        artifact["unicode_characters"],
        artifact["utf16_code_units"],
    ):
        raise EvidenceError(f"{name} 分片存在空洞或范围不完整")
    if digest.hexdigest() != artifact["sha256"] or b"".join(
        (output / chunk["path"]).read_bytes() for chunk in artifact["chunks"]
    ) != raw:
        raise EvidenceError(f"{name} 分片不能逐字节重组源文件")


def walk_offsets(value: Any, path: str = "$") -> Iterable[tuple[str, int]]:
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if isinstance(child, int) and (key.endswith("offset") or key == "source_end"):
                yield child_path, child
            yield from walk_offsets(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk_offsets(child, f"{path}[{index}]")


def validate_page_map() -> None:
    source = SOURCES["bundle"].read_text(encoding="utf-8")
    page_map = json.loads(PAGE_MAP.read_text(encoding="utf-8"))
    if page_map["bundle"]["sha256"] != sha256_file(SOURCES["bundle"]):
        raise EvidenceError("页面代码索引绑定的 bundle SHA 与原件不一致")
    for path, offset in walk_offsets(page_map):
        if not 0 <= offset <= len(source):
            raise EvidenceError(f"页面代码索引越界：{path}={offset}")
    for feature in page_map["features"]:
        for symbol in feature.get("original_symbols", []):
            offset, snippet = symbol.get("char_offset"), symbol.get("snippet")
            if offset is not None and snippet and not source.startswith(snippet, offset):
                raise EvidenceError(f"{feature['id']} 的 symbol snippet 与 bundle 不一致：{offset}")
    for route in page_map["routes"]:
        offset, excerpt = route.get("char_offset"), route.get("source_excerpt")
        if offset is not None and excerpt and not source.startswith(excerpt, offset):
            raise EvidenceError(f"{route['id']} 的 route excerpt 与 bundle 不一致：{offset}")


def validate_inventories() -> None:
    source = SOURCES["bundle"].read_text(encoding="utf-8")
    api = json.loads(SOURCES["api"].read_text(encoding="utf-8"))
    for index, entry in enumerate(api.get("entries", [])):
        offset = entry.get("char_offset")
        if not isinstance(offset, int) or not 0 <= offset < len(source):
            raise EvidenceError(f"API inventory offset 越界：entries[{index}]={offset!r}")
        expression = entry.get("url_expression")
        if isinstance(expression, str) and expression and expression not in source[
            max(0, offset - 256) : min(len(source), offset + len(expression) + 256)
        ]:
            raise EvidenceError(f"API inventory 表达式与 bundle 不一致：entries[{index}]")

    routes = json.loads(SOURCES["routes"].read_text(encoding="utf-8"))
    for index, route in enumerate(routes):
        offset = route.get("char_offset")
        end = route.get("source_end")
        if not isinstance(offset, int) or not isinstance(end, int) or not 0 <= offset <= end <= len(source):
            raise EvidenceError(f"route inventory 范围越界：routes[{index}]={offset!r}:{end!r}")
        excerpt = route.get("source_excerpt")
        if isinstance(excerpt, str) and excerpt and not source.startswith(excerpt, offset):
            raise EvidenceError(f"route inventory excerpt 与 bundle 不一致：routes[{index}]")


def validate_graph(graph: dict[str, Any], label: str, edge_key: str) -> None:
    nodes = graph.get("nodes", [])
    node_ids = [node.get("node_id") for node in nodes]
    if len(node_ids) != len(set(node_ids)):
        raise EvidenceError(f"{label} 存在重复 node_id")
    known = set(node_ids)
    for root in graph.get("root_node_ids", []):
        if root not in known:
            raise EvidenceError(f"{label} root_node_id 无法解析：{root}")
    for edge in graph.get(edge_key, []):
        source = edge.get("source_node_id")
        target = edge.get("target_node_id")
        if source not in known or target not in known:
            raise EvidenceError(f"{label} 存在 dangling edge：{source} -> {target}")


def validate_evidence() -> None:
    evidence = json.loads(SOURCES["evidence"].read_text(encoding="utf-8"))
    records = evidence.get("records", [])
    ids = [record.get("evidence_id") for record in records]
    if len(ids) != len(set(ids)):
        raise EvidenceError("REA evidence_id 存在重复定义")
    known = set(ids)
    for record in records:
        evidence_id = record.get("evidence_id")
        normalized = record.get("normalized_result")
        normalized = normalized if isinstance(normalized, dict) else {}
        refs = list(record.get("evidence_links", []))
        parent = normalized.get("parent_evidence_id")
        if parent:
            refs.append(parent)
        for ref in refs:
            if ref not in known:
                raise EvidenceError(f"{evidence_id} 引用不存在的 Evidence：{ref}")
        graph = normalized.get("graph")
        if isinstance(graph, dict):
            validate_graph(graph, f"{evidence_id}.graph", "edges")
        semantic = normalized.get("semantic_graph")
        if isinstance(semantic, dict):
            # Semantic relations can point to application graph nodes, so only
            # validate roots and duplicate semantic node definitions here.
            nodes = semantic.get("nodes", [])
            node_ids = [node.get("node_id") for node in nodes]
            if len(node_ids) != len(set(node_ids)):
                raise EvidenceError(f"{evidence_id}.semantic_graph 存在重复 node_id")
            known_semantic = set(node_ids)
            for root in semantic.get("root_node_ids", []):
                if root not in known_semantic:
                    raise EvidenceError(f"{evidence_id}.semantic_graph root 无法解析：{root}")


def verify(output: Path, run_node_check: bool) -> None:
    manifest = load_manifest(output)
    for name, artifact in manifest["artifacts"].items():
        validate_artifact(output, name, artifact)
    validate_page_map()
    validate_inventories()
    validate_evidence()

    expected_counts = manifest["counts"]
    page_map = json.loads(PAGE_MAP.read_text(encoding="utf-8"))
    api = json.loads(SOURCES["api"].read_text(encoding="utf-8"))
    evidence = json.loads(SOURCES["evidence"].read_text(encoding="utf-8"))
    actual_counts = {
        "features": len(page_map["features"]),
        "routes": len(page_map["routes"]),
        "stories": len(page_map["stories"]),
        "api_candidates": len(api["entries"]),
        "evidence_records": len(evidence["records"]),
    }
    for key, value in actual_counts.items():
        if expected_counts.get(key) != value:
            raise EvidenceError(f"计数漂移：{key} manifest={expected_counts.get(key)} source={value}")
    if manifest.get("evidence_graph_counts") != evidence_graph_counts():
        raise EvidenceError("Evidence graph node/edge 计数与生成时不一致")

    if run_node_check:
        bundle = manifest["artifacts"]["bundle"]
        with tempfile.NamedTemporaryFile(suffix=".js") as reconstructed:
            for chunk in bundle["chunks"]:
                reconstructed.write((output / chunk["path"]).read_bytes())
            reconstructed.flush()
            result = subprocess.run(
                ["node", "--check", reconstructed.name], capture_output=True, text=True, check=False
            )
            if result.returncode != 0:
                raise EvidenceError("重组 bundle 未通过 node --check：\n" + result.stderr.strip())
    print("验证通过：分片可逐字节重组，索引偏移和 Evidence 引用有效")


def ensure_fresh(output: Path, manifest: dict[str, Any]) -> None:
    for name, artifact in manifest["artifacts"].items():
        source = (output / artifact["source_path"]).resolve()
        if not source.is_file() or sha256_file(source) != artifact["sha256"]:
            raise EvidenceError(f"{name} 原件与 manifest 不一致；拒绝退化为全文查询，请重新 generate")


def unicode_offset_for(chunk: dict[str, Any], value: int, unit: str, text: str) -> int:
    if unit == "unicode":
        return value
    if unit == "byte":
        relative = value - chunk["byte_start"]
        raw = text.encode("utf-8")
        try:
            prefix = raw[:relative].decode("utf-8")
        except UnicodeDecodeError as error:
            raise EvidenceError("byte offset 落在 UTF-8 字符内部") from error
        return chunk["unicode_start"] + len(prefix)
    relative = value - chunk["utf16_start"]
    consumed = 0
    for index, char in enumerate(text):
        if consumed == relative:
            return chunk["unicode_start"] + index
        consumed += utf16_length(char)
        if consumed > relative:
            raise EvidenceError("UTF-16 offset 落在代理对内部")
    if consumed == relative:
        return chunk["unicode_end"]
    raise EvidenceError("UTF-16 offset 超出分片")


def locate_unicode_offset(output: Path, artifact: dict[str, Any], value: int, unit: str) -> int:
    total_key = {"unicode": "unicode_characters", "utf16": "utf16_code_units", "byte": "bytes"}[unit]
    if not 0 <= value <= artifact[total_key]:
        raise EvidenceError(f"{unit} offset 越界：{value}")
    start_key, end_key = {
        "unicode": ("unicode_start", "unicode_end"),
        "utf16": ("utf16_start", "utf16_end"),
        "byte": ("byte_start", "byte_end"),
    }[unit]
    for chunk in artifact["chunks"]:
        if chunk[start_key] <= value < chunk[end_key] or (
            value == artifact[total_key] and chunk[end_key] == value
        ):
            text = (output / chunk["path"]).read_text(encoding="utf-8")
            return unicode_offset_for(chunk, value, unit, text)
    raise EvidenceError(f"找不到 {unit} offset：{value}")


def read_unicode_window(output: Path, artifact: dict[str, Any], start: int, end: int) -> str:
    if start < 0 or end < start or end > artifact["unicode_characters"]:
        raise EvidenceError(f"Unicode window 越界：{start}:{end}")
    parts: list[str] = []
    for chunk in artifact["chunks"]:
        if chunk["unicode_end"] <= start:
            continue
        if chunk["unicode_start"] >= end:
            break
        text = (output / chunk["path"]).read_text(encoding="utf-8")
        local_start = max(start, chunk["unicode_start"]) - chunk["unicode_start"]
        local_end = min(end, chunk["unicode_end"]) - chunk["unicode_start"]
        parts.append(text[local_start:local_end])
    return "".join(parts)


def bounded(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    marker = f"\n… OUTPUT TRUNCATED: {len(value) - max_chars} Unicode characters omitted …\n"
    keep = max_chars - len(marker)
    if keep <= 0:
        raise EvidenceError("max-chars 太小，无法输出截断标记")
    left = keep // 2
    return value[:left] + marker + value[-(keep - left) :]


def query_offset(output: Path, manifest: dict[str, Any], source: str, offset: int, unit: str, context: int) -> str:
    artifact = manifest["artifacts"][source]
    unicode_offset = locate_unicode_offset(output, artifact, offset, unit)
    start = max(0, unicode_offset - context)
    end = min(artifact["unicode_characters"], unicode_offset + context)
    body = read_unicode_window(output, artifact, start, end)
    return f"source={source} unicode_offset={unicode_offset} window={start}:{end}\n{body}"


def find_text_offsets(output: Path, artifact: dict[str, Any], pattern: str, limit: int) -> list[int]:
    if not pattern:
        raise EvidenceError("text 查询不能为空")
    carry = ""
    results: list[int] = []
    for chunk in artifact["chunks"]:
        text = (output / chunk["path"]).read_text(encoding="utf-8")
        combined = carry + text
        combined_start = chunk["unicode_start"] - len(carry)
        position = 0
        while True:
            found = combined.find(pattern, position)
            if found < 0:
                break
            global_offset = combined_start + found
            if not results or global_offset != results[-1]:
                results.append(global_offset)
                if len(results) >= limit:
                    return results
            position = found + max(1, len(pattern))
        carry = combined[-max(0, len(pattern) - 1) :] if len(pattern) > 1 else ""
    return results


def query_text(
    output: Path,
    manifest: dict[str, Any],
    source: str,
    pattern: str,
    context: int,
    limit: int,
) -> str:
    artifact = manifest["artifacts"][source]
    offsets = find_text_offsets(output, artifact, pattern, limit)
    if not offsets:
        return f"source={source} matches=0 pattern={pattern!r}"
    windows = []
    for index, offset in enumerate(offsets, 1):
        start = max(0, offset - context)
        end = min(artifact["unicode_characters"], offset + len(pattern) + context)
        windows.append(
            f"--- match {index} unicode_offset={offset} window={start}:{end} ---\n"
            + read_unicode_window(output, artifact, start, end)
        )
    return f"source={source} matches_returned={len(offsets)} pattern={pattern!r}\n" + "\n".join(windows)


def query_feature(output: Path, feature_id: str) -> str:
    normalized = feature_id.upper()
    path = output / "views" / "features" / f"{normalized}.json"
    if not path.is_file():
        raise EvidenceError(f"未知 feature：{feature_id}")
    return path.read_text(encoding="utf-8")


def query_route(output: Path, value: str) -> str:
    candidates = []
    for path in sorted((output / "views" / "routes").glob("R*.json")):
        route = json.loads(path.read_text(encoding="utf-8"))
        if value.upper() == str(route.get("id", "")).upper() or value in {
            route.get("path"), route.get("full_path")
        }:
            candidates.append(route)
    if not candidates:
        raise EvidenceError(f"未知 route id/path：{value}")
    return pretty_json(candidates)


def query_api(output: Path, pattern: str, limit: int) -> str:
    results = []
    path = output / "views" / "api-inventory.jsonl"
    for line in path.read_text(encoding="utf-8").splitlines():
        if pattern in line:
            results.append(json.loads(line))
            if len(results) >= limit:
                break
    return pretty_json({"pattern": pattern, "matches_returned": len(results), "items": results})


def query_symbol(symbol: str, limit: int) -> str:
    page_map = json.loads(PAGE_MAP.read_text(encoding="utf-8"))
    results = []
    for feature in page_map["features"]:
        for item in feature.get("original_symbols", []):
            if symbol in str(item.get("symbol", "")):
                results.append({"feature_id": feature["id"], **item})
                if len(results) >= limit:
                    return pretty_json({"symbol": symbol, "items": results})
    return pretty_json({"symbol": symbol, "items": results})


def query_evidence(evidence_id: str) -> str:
    evidence = json.loads(SOURCES["evidence"].read_text(encoding="utf-8"))
    for record in evidence["records"]:
        if record.get("evidence_id") == evidence_id:
            return pretty_json(evidence_record_summary(record))
    raise EvidenceError(f"未知 evidence id：{evidence_id}")


def query(args: argparse.Namespace) -> None:
    manifest = load_manifest(args.output)
    ensure_fresh(args.output, manifest)
    if args.context < 0 or args.context > HARD_MAX_OUTPUT // 2:
        raise EvidenceError(f"context 必须在 0 到 {HARD_MAX_OUTPUT // 2} 之间")
    if args.max_chars < 256 or args.max_chars > HARD_MAX_OUTPUT:
        raise EvidenceError(f"max-chars 必须在 256 到 {HARD_MAX_OUTPUT} 之间")
    if args.limit < 1 or args.limit > 100:
        raise EvidenceError("limit 必须在 1 到 100 之间")

    if args.feature:
        result = query_feature(args.output, args.feature)
    elif args.route:
        result = query_route(args.output, args.route)
    elif args.api:
        result = query_api(args.output, args.api, args.limit)
    elif args.symbol:
        result = query_symbol(args.symbol, args.limit)
    elif args.evidence_id:
        result = query_evidence(args.evidence_id)
    elif args.offset is not None:
        result = query_offset(args.output, manifest, args.source, args.offset, args.unit, args.context)
    elif args.text is not None:
        result = query_text(args.output, manifest, args.source, args.text, args.context, args.limit)
    else:
        raise EvidenceError("必须指定一种查询选择器")
    rendered = bounded(result, args.max_chars)
    if not rendered.endswith("\n") and len(rendered) < args.max_chars:
        rendered += "\n"
    sys.stdout.write(rendered)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="派生查询目录")
    subparsers = parser.add_subparsers(dest="command", required=True)

    generate_parser = subparsers.add_parser("generate", help="生成无损分片和语义查询视图")
    generate_parser.add_argument("--chunk-size", type=int, default=CHUNK_SIZE)
    generate_parser.add_argument("--force", action="store_true", help="覆盖已有派生产物")

    verify_parser = subparsers.add_parser("verify", help="执行完整性门禁")
    verify_parser.add_argument("--skip-node-check", action="store_true")

    query_parser = subparsers.add_parser("query", help="执行有界查询")
    selectors = query_parser.add_mutually_exclusive_group(required=True)
    selectors.add_argument("--feature")
    selectors.add_argument("--route")
    selectors.add_argument("--api")
    selectors.add_argument("--symbol")
    selectors.add_argument("--evidence-id")
    selectors.add_argument("--offset", type=int)
    selectors.add_argument("--text")
    query_parser.add_argument("--source", choices=sorted(SOURCES), default="bundle")
    query_parser.add_argument("--unit", choices=["unicode", "utf16", "byte"], default="unicode")
    query_parser.add_argument("--context", type=int, default=DEFAULT_CONTEXT)
    query_parser.add_argument("--limit", type=int, default=10)
    query_parser.add_argument("--max-chars", type=int, default=DEFAULT_MAX_OUTPUT)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        if args.command == "generate":
            generate(args.output.resolve(), args.chunk_size, args.force)
        elif args.command == "verify":
            verify(args.output.resolve(), run_node_check=not args.skip_node_check)
        else:
            args.output = args.output.resolve()
            query(args)
    except (EvidenceError, OSError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
