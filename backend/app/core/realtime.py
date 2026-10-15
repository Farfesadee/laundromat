"""Realtime fan-out: Redis pub/sub when configured, else in-process broadcast.

WebSocket clients subscribe to channels; service layer publishes small events.
Polling every 15s is the documented fallback, so missing Redis is fine locally.
"""
from __future__ import annotations
import asyncio
import json
from collections import defaultdict

try:
    import redis.asyncio as aioredis  # type: ignore
except Exception:  # pragma: no cover
    aioredis = None

from app.core.config import settings

_subs: dict[str, set[asyncio.Queue]] = defaultdict(set)
_redis = None

async def _get_redis():
    global _redis
    if not settings.REDIS_URL or aioredis is None:
        return None
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis

async def publish(channel: str, payload: dict):
    # in-process first (always works)
    msg = json.dumps(payload, default=str)
    for q in list(_subs.get(channel, set())):
        try:
            q.put_nowait(msg)
        except Exception:
            pass
    # redis fan-out for multi-process deploys
    try:
        r = await _get_redis()
        if r is not None:
            await r.publish(channel, msg)
    except Exception:
        pass

def subscribe(channel: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subs[channel].add(q)
    return q

def unsubscribe(channel: str, q: asyncio.Queue):
    try:
        _subs[channel].discard(q)
    except Exception:
        pass
