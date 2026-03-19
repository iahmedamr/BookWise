from typing import Optional
import threading
from surprise import SVD, Dataset, Reader
from data_loader import get_all_ratings

_svd_model: Optional[SVD] = None
_trained_users: set = set()
_lock = threading.Lock()
_min_ratings_to_train = 10


def train_cf():
    global _svd_model, _trained_users
    ratings_df = get_all_ratings()

    if len(ratings_df) < _min_ratings_to_train:
        print(f"[CF] Only {len(ratings_df)} ratings — skipping SVD training.")
        with _lock:
            _svd_model = None
        return

    reader = Reader(rating_scale=(1, 5))
    data = Dataset.load_from_df(ratings_df[["user_id", "isbn13", "rating"]], reader)
    trainset = data.build_full_trainset()

    model = SVD(n_factors=50, n_epochs=20, lr_all=0.005, reg_all=0.02, random_state=42)
    model.fit(trainset)

    with _lock:
        _svd_model = model
        _trained_users = set(ratings_df["user_id"].unique())

    print(f"[CF] SVD trained on {len(ratings_df)} ratings from {len(_trained_users)} users.")


def cf_scores_for_user(user_id: str, candidate_isbns: list) -> dict:
    with _lock:
        model = _svd_model
    if model is None:
        return {}
    if user_id not in _trained_users:
        return {}
    return {isbn: model.predict(user_id, isbn).est for isbn in candidate_isbns}


def normalize_cf_scores(scores: dict) -> dict:
    if not scores:
        return {}
    return {isbn: (score - 1) / 4.0 for isbn, score in scores.items()}