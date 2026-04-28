import argparse

from vector_store import sync_book_embeddings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--batch-size", type=int, default=250)
    parser.add_argument("--force-rebuild-local", action="store_true")
    args = parser.parse_args()

    result = sync_book_embeddings(
        limit=args.limit,
        batch_size=args.batch_size,
        force_rebuild_local=args.force_rebuild_local,
    )
    print(result)


if __name__ == "__main__":
    main()
