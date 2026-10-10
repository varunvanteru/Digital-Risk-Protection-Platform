"""Images survive a wiped disk: they are restored from the database with their mtime."""

from types import SimpleNamespace

from PIL import Image


def test_saved_image_is_restored_after_disk_wipe(client, tmp_path, monkeypatch):
    from app import media_store

    monkeypatch.setattr(media_store, "settings", SimpleNamespace(media_dir=tmp_path))
    url = media_store.save_image("brand/test-restore.png", Image.new("RGBA", (64, 64), (200, 30, 40, 255)))
    assert url == "/media/brand/test-restore.png"

    path = tmp_path / "brand" / "test-restore.png"
    original, mtime = path.read_bytes(), path.stat().st_mtime
    path.unlink()

    assert media_store.restore_media() >= 1
    assert path.read_bytes() == original
    assert int(path.stat().st_mtime) == int(mtime)  # demo avatar names depend on it
