"""Provision fictional, viewer-only records into a dedicated production demo database."""

import argparse

from app.seed import seed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm-public-demo", action="store_true", required=True)
    parser.parse_args()
    seed(public_demo=True)


if __name__ == "__main__":
    main()
