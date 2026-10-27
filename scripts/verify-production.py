"""Read-only HTTP smoke checks for a running MetricsFlow production nginx image."""
import argparse
from html.parser import HTMLParser
from urllib.error import HTTPError
from urllib.request import Request, urlopen


class Assets(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.scripts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        source = dict(attrs).get("src")
        if tag == "script" and source and source.startswith("/assets/"):
            self.scripts.append(source)


def verify(base: str) -> None:
    with urlopen(base, timeout=10) as response:
        html = response.read().decode()
        assert "Content-Security-Policy" in response.headers
    parser = Assets()
    parser.feed(html)
    assert parser.scripts, "No built JavaScript asset found"
    with urlopen(Request(base + parser.scripts[0], headers={"Accept-Encoding": "gzip"}), timeout=10) as asset:
        assert "immutable" in asset.headers.get("Cache-Control", ""), "Hashed assets need immutable caching"
        assert asset.headers.get("Content-Encoding") == "gzip", "JavaScript compression is not enabled"
    for path in ("/customers", "/api/v1/health", "/favicon.svg", "/og.png"):
        with urlopen(base + path, timeout=10) as response:
            assert response.status == 200, path
    try:
        urlopen(base + "/assets/missing-file.js", timeout=10)
    except HTTPError as error:
        assert error.code == 404
    else:
        raise AssertionError("Missing assets must return 404, not SPA HTML")
    print("Production HTTP checks passed: security headers, gzip, immutable assets, SPA routing, API and brand assets.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", help="Production nginx base URL, e.g. http://127.0.0.1:8080")
    verify(parser.parse_args().url.rstrip("/"))
