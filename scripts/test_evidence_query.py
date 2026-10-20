from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import evidence_query


class EvidenceQueryTest(unittest.TestCase):
    def test_chunks_are_unicode_aligned_and_byte_reconstructable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.txt"
            evidence_query.write_exact(source, "ab😀中cd\n")
            output = root / "output"
            output.mkdir()

            metadata = evidence_query.source_metadata("sample", source, output, chunk_size=4)

            self.assertEqual(metadata["unicode_characters"], 7)
            self.assertEqual(metadata["utf16_code_units"], 8)
            self.assertEqual(len(metadata["chunks"]), 2)
            reconstructed = b"".join(
                (output / chunk["path"]).read_bytes() for chunk in metadata["chunks"]
            )
            self.assertEqual(reconstructed, source.read_bytes())

    def test_cross_chunk_text_search_reports_one_global_offset(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shard_dir = root / "raw" / "sample"
            evidence_query.write_exact(shard_dir / "chunk-0000.txt", "abcXY")
            evidence_query.write_exact(shard_dir / "chunk-0001.txt", "Zdef")
            artifact = {
                "chunks": [
                    {"path": "raw/sample/chunk-0000.txt", "unicode_start": 0},
                    {"path": "raw/sample/chunk-0001.txt", "unicode_start": 5},
                ]
            }

            offsets = evidence_query.find_text_offsets(root, artifact, "XYZ", limit=10)

            self.assertEqual(offsets, [3])

    def test_utf16_and_byte_offsets_reject_mid_character_positions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shard = root / "chunk.txt"
            evidence_query.write_exact(shard, "a😀b")
            chunk = {
                "path": "chunk.txt",
                "byte_start": 0,
                "byte_end": 6,
                "unicode_start": 0,
                "unicode_end": 3,
                "utf16_start": 0,
                "utf16_end": 4,
            }
            artifact = {
                "bytes": 6,
                "unicode_characters": 3,
                "utf16_code_units": 4,
                "chunks": [chunk],
            }

            self.assertEqual(evidence_query.locate_unicode_offset(root, artifact, 5, "byte"), 2)
            self.assertEqual(evidence_query.locate_unicode_offset(root, artifact, 3, "utf16"), 2)
            with self.assertRaises(evidence_query.EvidenceError):
                evidence_query.locate_unicode_offset(root, artifact, 2, "byte")
            with self.assertRaises(evidence_query.EvidenceError):
                evidence_query.locate_unicode_offset(root, artifact, 2, "utf16")

    def test_bounded_output_keeps_both_ends(self) -> None:
        result = evidence_query.bounded("a" * 500 + "z" * 500, 300)

        self.assertLessEqual(len(result), 300)
        self.assertTrue(result.startswith("a"))
        self.assertTrue(result.endswith("z"))
        self.assertIn("OUTPUT TRUNCATED", result)


if __name__ == "__main__":
    unittest.main()
