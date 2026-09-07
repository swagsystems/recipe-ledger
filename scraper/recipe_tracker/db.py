import os
from contextlib import contextmanager
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg
from psycopg.rows import dict_row


@contextmanager
def connect():
    url = _psycopg_url(os.environ["DATABASE_URL"])
    with psycopg.connect(url, row_factory=dict_row) as conn:
        conn.autocommit = False
        yield conn


def _psycopg_url(url):
    parts = urlsplit(url)
    query = [(key, value) for key, value in parse_qsl(parts.query) if key != "schema"]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query and urlencode(query), parts.fragment))
